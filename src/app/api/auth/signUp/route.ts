import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";

export async function POST(rq: Request) {
  try {
    const body = await rq.json();

    const { name, email, password } = body;

    if (!name || !email || !password) {
      return new Response("Missing fields", { status: 400 });
    }

    const existingId = await db.get(`user:email:${email}`);
    if (existingId) {
      return new Response("Email already registered", { status: 400 });
    }

    const userId = randomUUID();

    const passwordHash = await bcrypt.hash(password, 10);

    await db.hset(`user:${userId}`, {
      id: userId,
      name,
      email,
      password: passwordHash,
    });

    await db.sadd(`user:email:${email}`, userId);

    return new Response(JSON.stringify({ id: userId, email, name }), {
      status: 201,
    });
  } catch (error) {
    console.error(error);
    return new Response("Internal server error", { status: 500 });
  }
}
