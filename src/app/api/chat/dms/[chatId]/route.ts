import { fetchRedis } from "@/helpers/redis";
import { db } from "@/lib/db";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /chat/dms/{chatId}:
 *   get:
 *     summary: Get DM chat metadata
 *     description: >
 *       Retrieves metadata for a direct message (DM) chat, including its type, creation time, members, and last message.
 *       Requires a valid Bearer token, and the requester must be a member of the chat.
 *     tags:
 *       - Chat
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         description: The unique ID of the DM chat.
 *         schema:
 *           type: string
 *     responses:
 *       200:
 *         description: Chat metadata successfully retrieved.
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/ChatMeta'
 *       401:
 *         description: Unauthorized — missing token or requester is not part of this chat.
 *       404:
 *         description: Chat not found.
 *       500:
 *         description: Internal server error.
 *
 * components:
 *   schemas:
 *     ChatMeta:
 *       type: object
 *       properties:
 *         chatId:
 *           type: string
 *           example: "dms_abc123"
 *         type:
 *           type: string
 *           description: Chat type, usually "dms".
 *           example: "dms"
 *         createdAt:
 *           type: integer
 *           nullable: true
 *           description: Unix timestamp when the chat was created.
 *           example: 1734374892000
 *         members:
 *           type: array
 *           description: Array of user IDs participating in the chat.
 *           items:
 *             type: string
 *           example: ["user123", "user456"]
 *         lastMessage:
 *           type: object
 *           nullable: true
 *           description: The last message sent in the chat.
 *           properties:
 *             id:
 *               type: string
 *               format: uuid
 *             senderId:
 *               type: string
 *             text:
 *               type: string
 *             timestamp:
 *               type: integer
 *           example:
 *             id: "a12f6b9d-3e4f-4a2c-8d90-7b9e6b2c4c10"
 *             senderId: "user123"
 *             text: "Hey, are you free later?"
 *             timestamp: 1734374892000
 */

export async function GET(
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

    const rawMeta = await db.hgetall(`chat:${chatId}:meta`);

    if (!rawMeta || Object.keys(rawMeta).length === 0) {
      return new Response("Chat not found", { status: 404 });
    }

    let lastMessage = null;
    if (rawMeta.lastMessage) {
      try {
        lastMessage = JSON.parse(rawMeta.lastMessage as string);
      } catch (error) {
        lastMessage = null;
      }
    }

    const meta = {
      chatId,
      type: rawMeta.type,
      createdAt: rawMeta.createdAt ? Number(rawMeta.createdAt) : null,
      members: [rawMeta.user1, rawMeta.user2].filter(Boolean),
      lastMessage,
    };

    // check if requester is a part of this dms
    const isMember = await fetchRedis(
      "sismember",
      `chat:${chatId}:members`,
      payload.id
    );

    if (isMember === 0) {
      return new Response("Unauthorized", { status: 401 });
    }

    return new Response(JSON.stringify(meta), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`dms/[chatId] error:`, error);
    return new Response("Internal server error", { status: 500 });
  }
}
