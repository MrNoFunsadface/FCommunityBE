import { fetchRedis } from "@/helpers/redis";
import { db } from "@/lib/db";
import z from "zod";
import jwt from "jsonwebtoken";
import { pusherServer } from "@/lib/pusher";
import { toPusherKey } from "@/lib/utils";

/**
 * @swagger
 * /friends/accept:
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
    const authHeader =
      req.headers.get("authorization") || req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const token = authHeader.split(" ")[1];

    if (!process.env.JWT_SECRET) {
      return new Response("Server configuration error", { status: 500 });
    }

    let payload: { id: string };
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET) as { id: string };
    } catch (err: any) {
      return new Response("Unauthorized", { status: 401 });
    }

    const body = await req.json();
    const { id: idToAdd } = z.object({ id: z.string() }).parse(body);

    // verify both users are not already friends
    const areAlreadyFriendsRaw = await fetchRedis(
      "sismember",
      `user:${payload.id}:friends`,
      idToAdd
    );
    const areAlreadyFriends = Boolean(Number(areAlreadyFriendsRaw));

    if (areAlreadyFriends) {
      return new Response("Already friends", { status: 400 });
    }

    const hasFriendRequestRaw = await fetchRedis(
      "sismember",
      `user:${payload.id}:incoming_friend_requests`,
      idToAdd
    );
    const hasFriendRequest = Boolean(Number(hasFriendRequestRaw));

    if (!hasFriendRequest) {
      return new Response("No friend request", { status: 400 });
    }

    const [rawUser, rawFriend] = await Promise.all([
      db.hgetall(`user:${payload.id}`),
      db.hgetall(`user:${idToAdd}`),
    ]);

    if (!rawUser?.id || !rawFriend?.id) {
      return new Response("Invalid request", { status: 400 });
    }

    const user = {
      id: rawUser.id,
      name: rawUser.name,
      email: rawUser.email,
      image: rawUser.image ?? null,
    };

    const friend = {
      id: rawFriend.id,
      name: rawFriend.name,
      email: rawFriend.email,
      image: rawFriend.image ?? null,
    };

    // update both users' friend sets
    await Promise.all([
      db.sadd(`user:${payload.id}:friends`, idToAdd),
      db.sadd(`user:${idToAdd}:friends`, payload.id),
      db.srem(`user:${payload.id}:incoming_friend_requests`, idToAdd),
    ]);

    // notify the other user about the new friend
    await pusherServer.trigger(
      toPusherKey(`user:${idToAdd}:friends`),
      "new_friend",
      user
    );

    await pusherServer.trigger(
      toPusherKey(`user:${payload.id}:friends`),
      "new_friend",
      friend
    );

    return new Response("OK", { status: 200 });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return new Response("Invalid request payload", { status: 422 });
    }

    return new Response("Invalid request", { status: 500 });
  }
}
