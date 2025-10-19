import { fetchRedis } from "@/helpers/redis";
import { db } from "@/lib/db";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /chat/group/{chatId}:
 *   get:
 *     summary: Get group chat metadata
 *     description: Returns chat metadata for the specified group (type, name, createdAt, updatedAt, createdBy, etc).
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
 *     responses:
 *       200:
 *         description: Chat metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Chat not found
 *       500:
 *         description: Internal server error
 */

export async function GET(
  req: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    const authHeader =
      req.headers.get("Authorization") || req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer "))
      return new Response("Unauthorized", { status: 401 });

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
    };

    const body = await context.params;
    const { chatId } = body as {
      chatId: string;
    };

    // check to see if chat is a group or not

    const type = await db.hget(`chat:${chatId}:meta`, "type");

    if (type !== "group")
      return new Response("Conflict: Chat type must be group", { status: 409 });

    const rawMeta = await db.hgetall(`chat:${chatId}:meta`);

    if (!rawMeta || Object.keys(rawMeta).length === 0) {
      return new Response("Chat not found", { status: 404 });
    }

    // robust lastMessage parsing
    let lastMessage: any = null;
    if (rawMeta.lastMessage) {
      const raw = rawMeta.lastMessage;
      try {
        if (typeof raw === "string") {
          // try single parse
          lastMessage = JSON.parse(raw);
        } else {
          // already an object
          lastMessage = raw;
        }
      } catch (err) {
        // try double-encoded JSON (common mistake)
        try {
          lastMessage = JSON.parse(JSON.parse(String(raw)));
        } catch (err2) {
          // fallback: log and leave null
          console.error("Failed to parse lastMessage:", raw);
          lastMessage = null;
        }
      }

      // normalize timestamp if present
      if (lastMessage && lastMessage.timestamp) {
        lastMessage.timestamp = Number(lastMessage.timestamp);
      }
    }

    const meta = {
      chatId,
      name: rawMeta.name,
      type: rawMeta.type,
      createdAt: rawMeta.createdAt ? Number(rawMeta.createdAt) : null,
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
    return new Response("Internal server error", { status: 500 });
  }
}
