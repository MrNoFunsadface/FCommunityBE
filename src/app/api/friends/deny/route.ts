import { db } from "@/lib/db";
import z from "zod";
import jwt from "jsonwebtoken";

/**
 * @swagger
 * /api/friends/deny:
 *   post:
 *     summary: Deny a friend request
 *     description: Denies a pending friend request from another user by removing it from the incoming friend requests list.
 *     tags:
 *       - Friends
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - id
 *             properties:
 *               id:
 *                 type: string
 *                 description: The ID of the user whose friend request is being denied
 *                 example: "a1b2c3d4-e5f6-7890-abcd-1234567890ef"
 *     responses:
 *       200:
 *         description: Friend request denied successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "OK"
 *       400:
 *         description: Invalid request (e.g. malformed, JWT invalid)
 *       401:
 *         description: Unauthorized (missing or invalid JWT)
 *       422:
 *         description: Invalid request payload
 */

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader?.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
    };

    const body = await req.json();

    const { id: idToDeny } = z.object({ id: z.string() }).parse(body);

    await db.srem(`user:${payload.id}:incoming_friend_requests`, idToDeny);

    return new Response("OK");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response("Invalid request payload", { status: 422 });
    }

    return new Response("Invalid request", { status: 400 });
  }
}
