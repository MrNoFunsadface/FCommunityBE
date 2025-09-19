import { db } from "@/lib/db";
import bcrypt from "bcrypt";

export async function POST(rq: Request) {
  try {
    const body = await rq.json();

    const { email, password } = body;

    if (!email || !password) {
      return new Response("Missing email or password!", { status: 400 });
    }

    const userId = await db.get(`user:email:${email}`);
    if (!userId) {
      return new Response("Invalid email", { status: 401 });
    }

    const user = await db.hgetall(`user:${userId}`);
    if (!user) {
      return new Response("User not found", { status: 404 });
    }

    //validate password
    const isPasswordValid = await bcrypt.compare(
      password,
      user.password as string
    );
    if (!isPasswordValid) {
      return new Response("Invalid password", { status: 401 });
    }

    return new Response(
      JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
      }),
      { status: 200 }
    );
  } catch (error) {
    console.error(error);
    return new Response("Internal server error", { status: 500 });
  }
}
