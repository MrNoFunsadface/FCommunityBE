import { fetchRedis } from "@/helpers/redis";
import { db } from "@/lib/db";
import jwt from "jsonwebtoken";
import { isMessage } from "@/lib/types/db";
import type { Message } from "@/lib/types/db";

/**
 * @openapi
 * /chat/dms/{chatId}/messages:
 *   post:
 *     summary: Get messages for a DMs chat
 *     description: |
 *       Returns a list of messages from a DMs chat between two users.
 *       The requester must be a member of the chat and the chat type must be `dms`.
 *     tags:
 *       - Chat DMs
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: The ID of the DMs chat.
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - startPos
 *               - endPos
 *             properties:
 *               startPos:
 *                 type: integer
 *                 example: 0
 *                 description: The starting index of messages to retrieve.
 *               endPos:
 *                 type: integer
 *                 example: 20
 *                 description: The ending index of messages to retrieve.
 *     responses:
 *       200:
 *         description: Successfully retrieved messages.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: 7f0a9f3e-8b6d-4f38-9a4b-b7d9c7b4ef24
 *                   senderId:
 *                     type: string
 *                     example: 36dfc452-7f02-4e11-89d7-a30d2eaf2085
 *                   text:
 *                     type: string
 *                     example: Hey there!
 *                   timestamp:
 *                     type: integer
 *                     example: 1734345051220
 *       401:
 *         description: Unauthorized — missing or invalid token, or user is not a chat member.
 *       409:
 *         description: Conflict — the chat type is not DMs.
 *       422:
 *         description: Invalid payload — missing or incorrect startPos or endPos.
 *       500:
 *         description: Internal server error.
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
    const { startPos, endPos } = body as {
      startPos?: number;
      endPos?: number;
    };

    if (typeof startPos !== "number" || typeof endPos !== "number")
      return new Response("Invalid payload: startPos and endPos required", {
        status: 422,
      });

    // verify if user allow to see the requested dms or if chatId exist in db
    const isMember = await fetchRedis(
      "sismember",
      `chat:${chatId}:members`,
      payload.id
    );

    if (isMember === 0) {
      return new Response("Unauthorized", { status: 401 });
    }

    // verify if chat is a dms or not
    const type = await db.hget(`chat:${chatId}:meta`, "type");

    if (type !== "dms")
      return new Response("Conflict: Chat type must be DMs", { status: 409 });

    // return messages
    const rawResults: string[] = await fetchRedis(
      "zrevrange",
      `chat:${chatId}:messages`,
      startPos,
      endPos
    );

    const results = (rawResults || [])
      .map((item) => {
        let candidate: unknown = null;
        try {
          candidate = typeof item === "string" ? JSON.parse(item) : item;
        } catch (err) {
          // try handling double-encoded JSON
          try {
            candidate = JSON.parse(JSON.parse(String(item)));
          } catch (err2) {
            console.error("Failed to parse message item:", item);
            candidate = null;
          }
        }

        if (!isMessage(candidate)) return null;

        // normalize timestamp to number
        const msg: Message = {
          id: candidate.id,
          senderId: candidate.senderId,
          text: candidate.text,
          timestamp: Number(candidate.timestamp),
        };

        return msg;
      })
      .filter((m): m is Message => Boolean(m));

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.debug("dms/[chatId]/messages returns an error: ", error);
    return new Response("Internal server error", { status: 500 });
  }
}
