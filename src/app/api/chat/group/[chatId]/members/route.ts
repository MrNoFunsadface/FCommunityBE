import { fetchRedis } from "@/helpers/redis";
import { db } from "@/lib/db";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /chat/group/{chatId}/members:
 *   post:
 *     summary: Get members of a group chat
 *     description: Returns the minimal user objects for each member of the specified group chat.
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
 *         description: Array of user objects (id, email, name)
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                   email:
 *                     type: string
 *                     nullable: true
 *                   name:
 *                     type: string
 *                     nullable: true
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
    let payload: { id: string };
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }

    const { chatId } = await context.params;

    // check if this chat is a group or not
    const type = await db.hget(`chat:${chatId}:meta`, "type");

    if (type !== "group")
      return new Response("Conflict: Chat type must be group", { status: 409 });

    const rawMembers = (await fetchRedis(
      "smembers",
      `chat:${chatId}:members`
    )) as string[] | null;

    const memberIds = Array.isArray(rawMembers) ? rawMembers : [];

    // fetch each user's hash and map to the minimal user object
    const users = (
      await Promise.all(
        memberIds.map(async (userId) => {
          try {
            const rawUser = (await db.hgetall(`user:${userId}`)) as Record<
              string,
              string
            > | null;

            if (!rawUser || Object.keys(rawUser).length === 0) return null;

            return {
              id: rawUser.id ?? userId,
              email: rawUser.email ?? null,
              name: rawUser.name ?? null,
            };
          } catch (err) {
            console.error("Failed to load user for chat members:", userId, err);
            return null;
          }
        })
      )
    ).filter(Boolean);

    return new Response(JSON.stringify(users), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("chat group members error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
