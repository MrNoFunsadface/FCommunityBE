import { fetchRedis } from "@/helpers/redis";
import { db } from "@/lib/db";
import { messageValidator } from "@/lib/validations/message";
import { nanoid } from "nanoid";
import { Message } from "@/lib/validations/message";
import jwt from "jsonwebtoken";

export async function POST(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer "))
      return new Response("Unauthorized", { status: 401 });

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
    };

    const { text, chatId }: { text: string; chatId: string } = await req.json();

    const [userId1, userId2] = chatId.split("--");

    if (payload.id !== userId1 && payload.id !== userId2)
      return new Response("Unauthorized", { status: 401 });

    const friendId = payload.id === userId1 ? userId2 : userId1;

    const friendList = (await fetchRedis(
      "smembers",
      `user:${payload.id}:friends`
    )) as string[];
    const isFriend = friendList.includes(friendId);

    if (!isFriend) return new Response("Unauthorized", { status: 401 });

    const rawsender = (await fetchRedis("get", `user:${payload.id}`)) as string;
    const sender = JSON.parse(rawsender) as User;

    const timestamp = Date.now();

    const messageData: Message = {
      id: nanoid(),
      senderId: payload.id,
      text,
      timestamp,
    };

    const message = messageValidator.parse(messageData);

    // all valid, send the message
    await db.zadd(`chat:${chatId}:messages`, {
      score: timestamp,
      member: JSON.stringify(message),
    });
  } catch (error) {
    if (error instanceof Error) {
      return new Response(error.message, { status: 500 });
    }

    return new Response("Internal Server Error", { status: 500 });
  }
}
