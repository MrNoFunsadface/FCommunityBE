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
 *       - Chat DMs
 *     security:
 *       - bearerAuth: []
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
 *                 description: The ID of the friend to start or retrieve a DM with.
 *                 example: "360fc452-7f02-4e11-89d7-a30d2eaf2085"
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
 *                   example: "767f62c7-2cd5-4746-9a94-8467e573dc97"
 *       400:
 *         description: Missing or invalid userId.
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
    const { userId } = body as { userId?: string };

    if (!userId) return new Response("Missing friendId", { status: 400 });

    // check if requester is friend with friendId
    const isFriend = await fetchRedis(
      "sismember",
      `user:${payload.id}:friends`,
      userId
    );

    if (isFriend === 0) return new Response("Unauthorized", { status: 401 });

    // check if the chatId exist using friendId
    const chatId = await db.hget(`user:${payload.id}:dms`, userId);

    if (!chatId) {
      const newChatId = randomUUID();

      await Promise.all([
        db.hset(`user:${payload.id}:dms`, { [userId]: newChatId }),
        db.hset(`user:${userId}:dms`, { [payload.id]: newChatId }),
        db.sadd(`chat:${newChatId}:members`, payload.id, userId),
        db.hset(`chat:${newChatId}:meta`, { type: "dms" }),
        db.hset(`chat:${newChatId}:meta`, { createdAt: Date.now() }),
        db.hset(`chat:${newChatId}:meta`, { user1: payload.id }),
        db.hset(`chat:${newChatId}:meta`, { user2: userId }),
        db.hset(`chat:${newChatId}:meta`, { updatedAt: Date.now() }),
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
