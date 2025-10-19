import { db } from "@/lib/db";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /chat/group/list:
 *   get:
 *     summary: List group chat IDs for the authenticated user
 *     description: Returns an array of chatId strings representing group chats the user belongs to.
 *     tags:
 *       - Chat Group
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of group chat IDs
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: string
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

export async function GET(req: Request) {
  try {
    const authHeader =
      req.headers.get("Authorization") || req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    let payload: { id: string };
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }

    // read user's group chat IDs (set) and return as array of chatId
    const groups = (await db.smembers(`user:${payload.id}:groups`)) as
      | string[]
      | null;

    const groupList = groups || [];

    return new Response(JSON.stringify(groupList), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response("Internal server error", { status: 500 });
  }
}
