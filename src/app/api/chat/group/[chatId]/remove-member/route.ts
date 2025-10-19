import { db } from "@/lib/db";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /chat/group/{chatId}/remove-member:
 *   post:
 *     summary: Remove a user from a group
 *     description: Remove a user from the group's member set and remove the chat id from the user's groups set.
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
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - userId
 *             properties:
 *               userId:
 *                 type: string
 *     responses:
 *       200:
 *         description: Removed member object and chatId
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a member or not allowed
 *       404:
 *         description: Chat or user not found
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
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
    };

    const { chatId } = await context.params;

    const body = await req.json();
    const { userId } = body as { userId?: string };

    if (!userId) {
      return new Response("userId is required", { status: 422 });
    }

    // verify that the requester is the group owner
    const createdBy = (await db.hget(`chat:${chatId}:meta`, "createdBy")) as
      | string
      | null;

    if (!createdBy) return new Response("createdBy not found", { status: 409 });

    if (createdBy && createdBy !== payload.id) return new Response();

    // verify chat is a group
    const type = await db.hget(`chat:${chatId}:meta`, "type");
    if (type !== "group") {
      return new Response("Chat is not a group", { status: 409 });
    }

    // remove user from chat member set
    const removed = await db.srem(`chat:${chatId}:members`, userId);
    if (Number(removed) === 0)
      return new Response("User not found in group", { status: 404 });

    // remove chat from user's groups
    await db.srem(`user:${userId}:groups`, chatId);

    // update chat meta updatedAt
    await db.hset(`chat:${chatId}:meta`, {
      updatedAt: String(Date.now()),
    });

    // fetch minimal user object to return
    const rawUser = (await db.hgetall(`user:${userId}`)) as Record<
      string,
      string
    > | null;

    const user =
      rawUser && Object.keys(rawUser).length > 0
        ? {
            id: rawUser.id ?? userId,
            email: rawUser.email ?? null,
            name: rawUser.name ?? null,
          }
        : { id: userId, email: null, name: null };

    return new Response(JSON.stringify({ user, chatId }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("remove-member error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
