import { fetchRedis } from "@/helpers/redis";
import { db } from "@/lib/db";
import jwt from "jsonwebtoken";
import {
  isLastMessage,
  isMessage,
  LastMessage,
  type Message,
  type User,
} from "@/lib/types/db";

/**
 * @openapi
 * /chat/dms/{chatId}:
 *   get:
 *     summary: Get DM chat metadata
 *     description: >
 *       Retrieves metadata for a direct message (DM) chat, including its type, creation time, members, and last message.
 *       Requires a valid Bearer token, and the requester must be a member of the chat.
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
 *           example: "767f62c7-2cd5-4746-9a94-8467e573dc97"
 *         type:
 *           type: string
 *           description: Chat type, usually "dms".
 *           example: "dms"
 *         createdAt:
 *           type: integer
 *           nullable: true
 *           description: Unix timestamp when the chat was created.
 *           example: 1760682108173
 *         members:
 *           type: array
 *           description: Array of user IDs participating in the chat.
 *           items:
 *             type: string
 *           example: ["71db50d4-f833-47dd-aea2-07c014ce05ae", "360fc452-7f02-4e11-89d7-a30d2eaf2085"]
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
 *             id: "6fe5f221-d5bb-42d3-af8f-5f4786655b78"
 *             senderId: "71db50d4-f833-47dd-aea2-07c014ce05ae"
 *             text: "OMG WAHROO"
 *             timestamp: 1760682761439
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

    // check if requester is a part of this dms
    const isMember = await fetchRedis(
      "sismember",
      `chat:${chatId}:members`,
      payload.id
    );

    if (isMember === 0) {
      return new Response("Unauthorized", { status: 401 });
    }

    const rawMeta = await db.hgetall(`chat:${chatId}:meta`);

    if (!rawMeta || Object.keys(rawMeta).length === 0) {
      return new Response("Chat not found", { status: 404 });
    }

    // robust lastMessage parsing
    let lastMessage: LastMessage | null = null;
    if (rawMeta.lastMessage) {
      const raw = rawMeta.lastMessage;
      try {
        const parsed =
          typeof raw === "string" ? JSON.parse(raw) : (raw as Message);

        // Get user info

        const rawUser = (await db.hgetall(`user:${parsed.senderId}`)) as Record<
          string,
          string
        > | null;

        if (!rawUser || Object.keys(rawUser).length === 0) {
          return new Response("sender user not found", { status: 404 });
        }

        let user: User = {
          id: rawUser.id,
          name: rawUser.name,
          email: rawUser.email,
          image: null,
        };

        lastMessage = {
          id: parsed.id,
          user,
          text: parsed.text,
          timestamp: Number(parsed.timestamp) || Date.now(),
        };
      } catch (err) {
        // try double-encoded JSON (common mistake)
        try {
          const parsed = JSON.parse(JSON.parse(String(raw)));

          // Get user info

          const rawUser = (await db.hgetall(
            `user:${parsed.senderId}`
          )) as Record<string, string> | null;

          if (!rawUser || Object.keys(rawUser).length === 0) {
            return new Response("sender user not found", { status: 404 });
          }

          const user: User = {
            id: rawUser.id,
            name: rawUser.name,
            email: rawUser.email,
            image: null,
          };

          lastMessage = {
            id: parsed.id,
            user,
            text: parsed.text,
            timestamp: Number(parsed.timestamp) || Date.now(),
          };
        } catch (err2) {
          // fallback: log and leave null
          console.error("Failed to parse lastMessage:", raw);
          console.error(err2);
          lastMessage = null;
        }
      }
    }

    const meta = {
      chatId,
      type: rawMeta.type,
      createdAt: rawMeta.createdAt ? Number(rawMeta.createdAt) : null,
      members: [rawMeta.user1, rawMeta.user2].filter(Boolean),
      lastMessage,
    };

    return new Response(JSON.stringify(meta), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(`dms/[chatId] error:`, error);
    return new Response("Internal server error", { status: 500 });
  }
}
