import { db } from "@/lib/db";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /chat/group/{chatId}/add-member:
 *   post:
 *     summary: Add a user to a group
 *     description: Add a user to the group's member set and add the chat id to the user's groups set.
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
 *         description: Added member object and chatId
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 user:
 *                   type: object
 *                 chatId:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       409:
 *         description: User already a member or chat not a group
 *       422:
 *         description: Validation error
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

    if (!authHeader || !authHeader.startsWith("Bearer "))
      return new Response("Unauthorized", { status: 401 });

    const token = authHeader.split(" ")[1];
    let payload: { id: string };
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }

    const { chatId } = await context.params;

    const body = await req.json();
    const { userId } = body as { userId?: string };

    if (!userId) {
      return new Response("userId is required", { status: 422 });
    }

    // verify chat is a group
    const type = await db.hget(`chat:${chatId}:meta`, "type");
    if (type !== "group") {
      return new Response("Chat is not a group", { status: 409 });
    }

    // add user to chat members set
    const added = await db.sadd(`chat:${chatId}:members`, userId);
    if (Number(added) === 0) {
      // 0 means user was already a member
      return new Response("User is already a member", { status: 409 });
    }

    // add chat to user's groups set
    await db.sadd(`user:${userId}:groups`, chatId);

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
    console.error("add-member error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
