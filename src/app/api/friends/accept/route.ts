import { fetchRedis } from "@/helpers/redis";
import { authOptions } from "@/lib/auth";
import { db } from "@/lib/db";
import { getServerSession } from "next-auth";
import z from "zod";
import jwt from "jsonwebtoken";

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
