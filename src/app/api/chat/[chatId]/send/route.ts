import { fetchRedis } from "@/helpers/redis";
import { db } from "@/lib/db";
import { messageValidator } from "@/lib/validations/message";
import { Message } from "@/lib/validations/message";
import jwt from "jsonwebtoken";
import { chatHrefConstructor, toPusherKey } from "@/lib/utils";
import { pusherServer } from "@/lib/pusher";
import { randomUUID } from "crypto";

/**
 * @openapi
 * /chat/{chatId}/send:
 *   post:
 *     summary: Send a message in a chat
 *     description: Send a new message to a specific chat. Only participants of the chat who are friends can send messages.
 *     tags:
 *       - Chat
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: "The unique identifier of the chat (format: userId1--userId2)"
 *         example: 123e4567-e89b-12d3-a456-426614174000--789e4567-e89b-12d3-a456-426614174999
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *                 description: Message content
 *                 example: "Hey, how are you?"
 *     responses:
 *       200:
 *         description: Message successfully sent
 *         content:
 *           application/json:
 *             schema:
 *               $ref: "#/components/schemas/Message"
 *       401:
 *         description: Unauthorized - Invalid token or not part of the chat
 *       422:
 *         description: Invalid message payload
 *       500:
 *         description: Internal server error
 */

export async function POST(
  req: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer "))
      return new Response("Unauthorized", { status: 401 });

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
    };

    const { chatId } = await context.params;

    const { text }: { text: string } = await req.json();

    const [userId1, userId2] = chatId.split("--");

    if (payload.id !== userId1 && payload.id !== userId2)
      return new Response("Unauthorized", { status: 401 });

    const friendId = payload.id === userId1 ? userId2 : userId1;

    const friendList = (await fetchRedis(
      "smembers",
      `user:${payload.id}:friends`
    )) as string[];
    const isFriend = friendList.includes(friendId);

    if (!isFriend) return new Response("Unauthorized", { status: 401 });

    const rawSender = (await db.hgetall(`user:${payload.id}`)) as Record<
      string,
      string
    > | null;

    if (!rawSender || !rawSender.id)
      return new Response("User or userId not found", { status: 404 });

    const sender: User = {
      id: rawSender.id,
      name: rawSender.name,
      email: rawSender.email,
      image: null,
    };

    const timestamp = Date.now();

    const messageData: Message = {
      id: randomUUID(),
      senderId: payload.id,
      text,
      timestamp,
    };

    const message = messageValidator.parse(messageData);
    // notify all connected chat room clients
    await pusherServer.trigger(`chat:${chatId}`, "incoming-message", message);

    await pusherServer.trigger(
      toPusherKey(`user:${friendId}:chats`),
      "new_message",
      {
        ...message,
        senderImg: sender.image,
        senderName: sender.name,
      }
    );

    // all valid, send the message

    const sortedChatId = chatHrefConstructor(userId1, userId2);

    await db.zadd(`chat:${sortedChatId}:messages`, {
      score: timestamp,
      member: JSON.stringify(message),
    });

    return new Response("OK", { status: 200 });
  } catch (error) {
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }

    return new Response("Internal Server Error", { status: 500 });
  }
}
