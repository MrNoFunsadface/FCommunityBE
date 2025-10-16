import { fetchRedis } from "@/helpers/redis";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /chat/dms/get-or-create:
 *   post:
 *     summary: Get or create a direct message (DM) chat
 *     description:
 *       Returns the existing DM chat ID between the authenticated user and a specified friend.
 *       If no chat exists, a new one is created automatically.
 *     tags:
 *       - Chat
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - friendId
 *             properties:
 *               friendId:
 *                 type: string
 *                 description: The ID of the friend to start or retrieve a DM with.
 *                 example: "user_42a8e09b"
 *     responses:
 *       200:
 *         description: Successfully retrieved or created a DM chat.
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 chatId:
 *                   type: string
 *                   description: The unique identifier of the DM chat.
 *                   example: "9f7c5eaa-2b1e-4d6b-b3c1-930b0d72e1f1"
 *       400:
 *         description: Missing or invalid friendId.
 *       401:
 *         description: Unauthorized or not friends with the specified user.
 *       500:
 *         description: Internal server error.
 */

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
    };

    const body = await req.json();
    const { friendId } = body as { friendId?: string };

    if (!friendId) return new Response("Missing friendId", { status: 400 });

    // check if requester is friend with friendId
    const isFriend = await fetchRedis(
      "sismember",
      `user:${payload.id}:friends`,
      friendId
    );

    if (isFriend === 0) return new Response("Unauthorized", { status: 401 });

    // check if the chatId exist using friendId
    const chatId = await db.hget(`user:${payload.id}:dms`, friendId);

    if (!chatId) {
      const newChatId = randomUUID();

      await Promise.all([
        db.hset(`user:${payload.id}:dms`, { [friendId]: newChatId }),
        db.hset(`user:${friendId}:dms`, { [payload.id]: newChatId }),
        db.sadd(`chat:${newChatId}:members`, payload.id, friendId),
        db.hset(`chat:${chatId}:meta`, { type: "dms" }),
        db.hset(`chat:${chatId}:meta`, { createdAt: Date.now() }),
        db.hset(`chat:${chatId}:meta`, { user1: payload.id }),
        db.hset(`chat:${chatId}:meta`, { user2: friendId }),
      ]);

      return new Response(
        JSON.stringify({
          chatId: newChatId,
        }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        chatId: chatId,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("get-or-create: ", error);
    return new Response("Internal server error", { status: 500 });
  }
}
