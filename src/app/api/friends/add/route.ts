import { fetchRedis } from "@/helpers/redis";
import { db } from "@/lib/db";
import { addFriendValidator } from "@/lib/validations/add-friends";
import { z } from "zod";
import jwt from "jsonwebtoken";
import { pusherServer } from "@/lib/pusher";
import { toPusherKey } from "@/lib/utils";

/**
 * @swagger
 * /friends/add:
 *   post:
 *     summary: Send a friend request
 *     description: Sends a friend request to another user by their email address.
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
 *               - email
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 description: The email of the user to add
 *                 example: "congdeptrai@gmail.com"
 *     responses:
 *       200:
 *         description: Friend request sent successfully
 *         content:
 *           text/plain:
 *             schema:
 *               type: string
 *               example: "OK"
 *       400:
 *         description: Invalid request (user not found, already added, already friends, or self-add attempt)
 *       401:
 *         description: Unauthorized (missing or invalid JWT)
 *       422:
 *         description: Invalid request payload
 */

export async function POST(rq: Request) {
  try {
    const authHeader = rq.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
    };

    const body = await rq.json();

    const { email: emailToAdd } = addFriendValidator.parse(body);

    const idToAdd = (await fetchRedis(
      "get",
      `user:email:${emailToAdd}`
    )) as string;

    if (!idToAdd) {
      return new Response("This person does not exist", { status: 400 });
    }

    if (idToAdd === payload.id) {
      return new Response("You cannot add yourself as a friend", {
        status: 400,
      });
    }

    // check if user is already added
    const isAlreadyAdded = (await fetchRedis(
      "sismember",
      `user:${idToAdd}:incoming_friend_requests`,
      payload.id
    )) as 0 | 1;

    if (isAlreadyAdded) {
      return new Response("Already added this user", { status: 400 });
    }

    // check if user is already friends
    const isAlreadyFriends = (await fetchRedis(
      "sismember",
      `user:${payload.id}:friends`,
      idToAdd
    )) as 0 | 1;

    if (isAlreadyFriends) {
      return new Response("Already friends with this user", { status: 400 });
    }

    // valid request, send friend request

    // return user from db from payload id
    const user = (await db.hgetall(`user:${payload.id}`)) as Record<
      string,
      string
    >;

    await pusherServer.trigger(
      toPusherKey(`user:${idToAdd}:incoming_friend_requests`),
      "incoming_friend_requests",
      {
        senderId: user.id,
        senderEmail: user.email,
        senderName: user.name,
      }
    );

    db.sadd(`user:${idToAdd}:incoming_friend_requests`, payload.id);

    return new Response("OK");
  } catch (error) {
    if (error instanceof z.ZodError) {
      return new Response("Invalid request payload", { status: 422 });
    }
    console.debug("friends/add: ", error);
    return new Response("Invalid request", { status: 400 });
  }
}
