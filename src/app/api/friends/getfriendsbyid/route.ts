import { fetchRedis } from "@/helpers/redis";
import jwt from "jsonwebtoken";

export async function GET(rq: Request) {
  const authHeader = rq.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("bearer ")) {
    return new Response("Unauthorized", { status: 401 });
  }

  const token = authHeader.split(" ")[1];
  const payload = jwt.verify(token, process.env.JWT_SECRET!) as User;

  const friendIds = (await fetchRedis(
    "smembers",
    `user:${payload.id}:friends`
  )) as string[];

  const friends = await Promise.all(
    friendIds.map(async (friendId) => {
      const friend = (await fetchRedis("get", `user:${friendId}`)) as User;
      return friend;
    })
  );

  return new Response(JSON.stringify(friends), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}
