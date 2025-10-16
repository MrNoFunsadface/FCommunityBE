import { db } from "@/lib/db";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /chat/dms/list:
 *   get:
 *     summary: Get all direct message (DM) chats of the authenticated user
 *     description:
 *       Returns a list of all existing DM chat sessions for the currently authenticated user, including each friend's ID and the corresponding chat ID.
 *     tags:
 *       - Chat
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved DM list.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   friendId:
 *                     type: string
 *                     description: The ID of the friend the user has a DM with.
 *                     example: "user_8f12c09a"
 *                   chatId:
 *                     type: string
 *                     description: The unique ID of the DM chat between the user and this friend.
 *                     example: "4b5b0f33-0d65-4c91-b502-c2d16c9cb875"
 *       401:
 *         description: Unauthorized (missing or invalid token).
 *       500:
 *         description: Internal server error.
 */

export async function GET(req: Request) {
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

    const dms = await db.hgetall(`user:${payload.id}:dms`);

    const dmList = Object.entries(dms || {}).map(([friendId, chatId]) => ({
      friendId,
      chatId,
    }));

    return new Response(JSON.stringify(dmList), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response("Internal server error", { status: 500 });
  }
}
