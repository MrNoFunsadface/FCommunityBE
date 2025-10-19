import { db } from "@/lib/db";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /chat/dms/list:
 *   get:
 *     summary: Get all direct message (DM) chats of the authenticated user
 *     description: >
 *       Returns a list of all existing DM chat sessions for the currently authenticated user.
 *       Each item includes the friend's basic user information and the chat ID.
 *     tags:
 *       - Chat DMs
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Successfully retrieved the user's DM list.
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   user:
 *                     type: object
 *                     description: Basic information about the friend.
 *                     properties:
 *                       id:
 *                         type: string
 *                         description: The friend's user ID.
 *                         example: "360fc452-7f02-4e11-89d7-a30d2eaf2085"
 *                       name:
 *                         type: string
 *                         nullable: true
 *                         description: The friend's display name.
 *                         example: "TakoTakoTime"
 *                       email:
 *                         type: string
 *                         nullable: true
 *                         description: The friend's email address.
 *                         example: "wahwahcookie@gmail.com"
 *                   chatId:
 *                     type: string
 *                     description: The unique ID of the DM chat between the user and this friend.
 *                     example: "767f62c7-2cd5-4746-9a94-8467e573dc97"
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

    const dms = (await db.hgetall(`user:${payload.id}:dms`)) as Record<
      string,
      string
    > | null;

    const entries = Object.entries(dms || {});

    const dmList = (
      await Promise.all(
        entries.map(async ([userId, chatId]) => {
          try {
            const rawUser = await db.hgetall(`user:${userId}`);

            if (!rawUser || Object.keys(rawUser).length === 0) return null;

            const user = {
              id: rawUser.id ?? userId,
              name: rawUser.name ?? null,
              email: rawUser.email ?? null,
            };

            return { user, chatId };
          } catch (err) {
            console.error("Error building dm entry for", userId, chatId, err);
            return null;
          }
        })
      )
    ).filter(Boolean);

    return new Response(JSON.stringify(dmList), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response("Internal server error", { status: 500 });
  }
}
