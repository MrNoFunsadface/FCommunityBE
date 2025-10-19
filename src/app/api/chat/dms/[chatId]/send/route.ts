import { fetchRedis } from "@/helpers/redis";
import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";
import { Message, messageValidator } from "@/lib/validations/message";

/**
 * @openapi
 * /chat/dms/{chatId}/send:
 *   post:
 *     summary: Send a direct message (DM)
 *     description: >
 *       Sends a message to a direct message (DM) chat between two users.
 *       Requires a valid Bearer token. The chat must be of type `dms`, and the sender must be a member and a friend of the recipient.
 *     tags:
 *       - Chat DMs
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         description: The unique ID of the DM chat.
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
 *                 description: The message content to send.
 *                 example: "OMG WAHROO"
 *     responses:
 *       201:
 *         description: Message sent successfully.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Message'
 *       400:
 *         description: Unable to determine chat recipient.
 *       401:
 *         description: Unauthorized — invalid token or sender not allowed.
 *       409:
 *         description: Conflict — chat type must be DMs.
 *       500:
 *         description: Internal server error.
 *
 * components:
 *   schemas:
 *     Message:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *           example: "767f62c7-2cd5-4746-9a94-8467e573dc97"
 *         senderId:
 *           type: string
 *           description: The ID of the user who sent the message.
 *           example: "71db50d4-f833-47dd-aea2-07c014ce05ae"
 *         text:
 *           type: string
 *           example: "OMG WAHROO"
 *         timestamp:
 *           type: integer
 *           description: Unix timestamp (milliseconds) when the message was sent.
 *           example: 1760682761439
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

    // check if chat type is dms

    const type = await db.hget(`chat:${chatId}:meta`, "type");

    if (type !== "dms")
      return new Response("Conflict: Chat type must be DMs", { status: 409 });

    // check if sender is inside the chat
    const members = await fetchRedis("smembers", `chat:${chatId}:members`);

    if (!members.includes(payload.id) || !Array.isArray(members)) {
      return new Response("Unauthorized", { status: 401 });
    }

    // check if sender is friend with the other person
    // find the other member in the chat (the one that's not the requester)
    const otherUserId = (members as string[]).find((m) => m !== payload.id);

    if (!otherUserId) {
      return new Response("Unable to determine chat recipient", {
        status: 400,
      });
    }

    const isFriend = await fetchRedis(
      "sismember",
      `user:${payload.id}:friends`,
      otherUserId
    );

    if (isFriend === 0) {
      return new Response("Unauthorized", { status: 401 });
    }

    // sending message

    const body = await req.json();
    const { text } = body as {
      text: string;
    };

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
    console.error("DM send error: ", error);
    return new Response("Internal server error", { status: 500 });
  }
}
