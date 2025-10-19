import { fetchRedis } from "@/helpers/redis";
import { db } from "@/lib/db";
import { Message, messageValidator } from "@/lib/validations/message";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /chat/group/{chatId}/send:
 *   post:
 *     summary: Send a message in a group chat
 *     description: Post a message to the group; the message will be stored and optionally broadcast to members.
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
 *               - text
 *             properties:
 *               text:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                 senderId:
 *                   type: string
 *                 text:
 *                   type: string
 *                 timestamp:
 *                   type: integer
 *       400:
 *         description: Invalid payload
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a member
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
      email: string;
      name: string;
    };

    const { chatId } = await context.params;

    // check if chat type is group

    const type = await db.hget(`chat:${chatId}:meta`, "type");

    if (type !== "group")
      return new Response("Conflict: Chat type must be group", { status: 409 });

    // check if sender is inside the chat
    const isMember = await fetchRedis(
      "sismember",
      `chat:${chatId}:members`,
      payload.id
    );

    if (isMember === 0) return new Response("Unauthorized", { status: 401 });

    // sending message

    const body = await req.json();
    const { text } = body as {
      text?: string;
    };

    if (!text) return new Response("text is required", { status: 422 });

    const timestamp = Date.now();

    const messageData: Message = {
      id: randomUUID(),
      senderId: payload.id,
      text,
      timestamp,
    };

    const message = messageValidator.parse(messageData);

    // sending the message

    await db.zadd(`chat:${chatId}:messages`, {
      score: timestamp,
      member: JSON.stringify(message),
    });

    // update chat latest time
    await db.hset(`chat:${chatId}:meta`, {
      lastMessage: JSON.stringify(message),
    });

    return new Response(JSON.stringify(message), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("group send error: ", error);
    return new Response("Internal server error", { status: 500 });
  }
}
