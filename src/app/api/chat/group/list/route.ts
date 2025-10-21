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

    const entries = groups || [];

    const groupList = (
      await Promise.all(
        entries.map(async (chatId) => {
          try {
            const updatedAtRaw = await db.hget(
              `chat:${chatId}:meta`,
              "updatedAt"
            );

            const updatedAt = updatedAtRaw ? Number(updatedAtRaw) : null;

            return { chatId, updatedAt };
          } catch (err) {
            console.error("Error building group entry for:", chatId, err);
            return null;
          }
        })
      )
    )
      .filter((v): v is { chatId: string; updatedAt: number | null } =>
        Boolean(v)
      )
      .sort((a, b) => (b.updatedAt ?? 0) - (a.updatedAt ?? 0));

    return new Response(JSON.stringify(groupList), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response("Internal server error", { status: 500 });
  }
}
