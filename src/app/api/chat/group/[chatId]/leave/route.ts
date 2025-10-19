import { db } from "@/lib/db";
import { fetchRedis } from "@/helpers/redis";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /chat/group/{chatId}/leave:
 *   post:
 *     summary: Leave a group chat
 *     description: Remove the authenticated user from the group's member set and remove the chat id from the user's groups set.
 *     tags:
 *       - Chat Group
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: chatId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Successfully left the group
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 chatId:
 *                   type: string
 *                 left:
 *                   type: boolean
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a member
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Internal server error
 */

export async function POST(
  req: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    const authHeader =
      req.headers.get("Authorization") || req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const token = authHeader.split(" ")[1];

    if (!process.env.JWT_SECRET) {
      return new Response("Server configuration error", { status: 500 });
    }

    let payload: { id: string };
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }

    const { chatId } = await context.params;

    // ensure chat exists
    const meta = (await db.hgetall(`chat:${chatId}:meta`)) as Record<
      string,
      string
    > | null;
    if (!meta || Object.keys(meta).length === 0) {
      return new Response("Chat not found", { status: 404 });
    }

    // only groups can be left via this route
    if (meta.type !== "group") {
      return new Response("Chat is not a group", { status: 409 });
    }

    // verify caller is a member
    const isMemberRaw = await fetchRedis(
      "sismember",
      `chat:${chatId}:members`,
      payload.id
    );
    const isMember = Boolean(Number(isMemberRaw));
    if (!isMember) {
      return new Response("Not a member of this group", { status: 403 });
    }

    // remove user from group members and remove chat from user's groups
    await Promise.all([
      db.srem(`chat:${chatId}:members`, payload.id),
      db.srem(`user:${payload.id}:groups`, chatId),
      db.hset(`chat:${chatId}:meta`, { updatedAt: String(Date.now()) }),
    ]);

    // if no members remain, clean up chat data
    const remaining = (await fetchRedis(
      "smembers",
      `chat:${chatId}:members`
    )) as string[] | null;

    if (!Array.isArray(remaining) || remaining.length === 0) {
      // delete meta and members set (ignore errors)
      try {
        await Promise.all([
          db.del(`chat:${chatId}:meta`),
          db.del(`chat:${chatId}:members`),
          db.del(`chat:${chatId}:messages`),
        ]);
      } catch (err) {
        console.error("Failed to delete empty chat data:", chatId, err);
      }
    }

    return new Response(JSON.stringify({ chatId, left: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("chat group leave error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
