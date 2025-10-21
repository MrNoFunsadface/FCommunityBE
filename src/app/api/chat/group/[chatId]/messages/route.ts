import { fetchRedis } from "@/helpers/redis";
import { db } from "@/lib/db";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /chat/group/{chatId}/messages:
 *   post:
 *     summary: Get a range of messages for a group chat
 *     description: >
 *       Returns a page / range of messages from a group chat's sorted-set.
 *       The requester must be a member of the group and the chat type must be `group`.
 *     tags:
 *       - Chat Group
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: chatId
 *         in: path
 *         required: true
 *         description: The ID of the group chat to fetch messages from.
 *         schema:
 *           type: string
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
 *                 description: Starting index for the range (ZRANGE). Use negative indices for offsets from the end.
 *               endPos:
 *                 type: integer
 *                 example: 19
 *                 description: Ending index for the range (ZRANGE).
 *     responses:
 *       200:
 *         description: Successfully retrieved messages (array of Message objects).
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Message'
 *       401:
 *         description: Unauthorized — missing/invalid token or not a chat member.
 *       403:
 *         description: Forbidden — requester is not a member of the group.
 *       404:
 *         description: Chat not found.
 *       409:
 *         description: Conflict — the chat type is not `group`.
 *       422:
 *         description: Unprocessable Entity — invalid payload (startPos/endPos required and must be numbers).
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
 *           description: Message identifier (UUID or similar).
 *           example: "b93af89b-4812-4b41-901a-f86b3c5f1e8e"
 *         senderId:
 *           type: string
 *           description: User ID of the sender.
 *           example: "360fc452-7f02-4e11-89d7-a30d2eaf2085"
 *         text:
 *           type: string
 *           description: Message text content.
 *           example: "Hey there!"
 *         timestamp:
 *           type: integer
 *           description: Unix timestamp in milliseconds.
 *           example: 1734374892000
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

    // verify if chat is a group or not
    const type = await db.hget(`chat:${chatId}:meta`, "type");

    if (type !== "group")
      return new Response("Conflict: Chat type must be group", { status: 409 });

    // return messages
    const rawResults: string[] = await fetchRedis(
      "zrevrange",
      `chat:${chatId}:messages`,
      startPos,
      endPos
    );

    const results = (rawResults || [])
      .map((item) => {
        let parsed: unknown = null;
        try {
          parsed = typeof item === "string" ? JSON.parse(item) : item;
        } catch (err) {
          // try handling double-encoded JSON
          try {
            parsed = JSON.parse(JSON.parse(String(item)));
          } catch (err2) {
            console.error("Failed to parse message item:", item);
            parsed = null;
          }
        }

        if (
          parsed &&
          typeof parsed === "object" &&
          "timestamp" in parsed &&
          parsed !== null
        ) {
          (parsed as { timestamp: number | string }).timestamp = Number(
            (parsed as { timestamp: number | string }).timestamp
          );
        }

        return parsed;
      })
      .filter(Boolean);

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response("Internal server error", { status: 500 });
  }
}
