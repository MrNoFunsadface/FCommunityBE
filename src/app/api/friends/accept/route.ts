import { fetchRedis } from "@/helpers/redis";
import { db } from "@/lib/db";
import z from "zod";
import jwt from "jsonwebtoken";

/**
 * @swagger
 * /api/friends/accept:
 *   post:
 *     summary: Accept a friend request
 *     description: Accepts a pending friend request. Both users will be added to each other's friend list.
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
 *                 format: uuid
 *                 description: The ID of the user who sent the friend request
 *                 example: "550e8400-e29b-41d4-a716-446655440000"
 *     responses:
 *       200:
 *         description: Friend request accepted successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "OK"
 *       400:
 *         description: Already friends, no friend request found, or invalid request
 *       401:
 *         description: Unauthorized (missing or invalid JWT)
 *       422:
 *         description: Invalid request payload
 */

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorizaed", { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
    };

    const body = await req.json();

    const { id: idToAdd } = z.object({ id: z.string() }).parse(body);

    // verify both users are not already friends
    const areAlreadyFriends = await fetchRedis(
      "sismember",
      `user:${payload.id}:friends`,
      idToAdd
    );

    if (areAlreadyFriends) {
      return new Response("Already friends", { status: 400 });
    }

    const hasFriendRequest = await fetchRedis(
      "sismember",
      `user:${payload.id}:incoming_friend_requests`,
      idToAdd
    );

    if (!hasFriendRequest) {
      return new Response("No friend request", { status: 400 });
    }

    await db.sadd(`user:${payload.id}:friends`, idToAdd);

    await db.sadd(`user:${idToAdd}:friends`, payload.id);

    await db.srem(`user:${payload.id}:incoming_friend_requests`, idToAdd);

    return new Response("OK");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response("Invalid request payload", { status: 422 });
    }

    return new Response("Invalid request", { status: 400 });
  }
}
