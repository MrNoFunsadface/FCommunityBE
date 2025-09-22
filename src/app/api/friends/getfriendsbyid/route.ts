import { fetchRedis } from "@/helpers/redis";
import jwt from "jsonwebtoken";

/**
 * @swagger
 * /friends/getfriendsbyid:
 *   get:
 *     summary: Get all friends of the authenticated user
 *     description: Returns a list of the authenticated user's friends.
 *     tags:
 *       - Friends
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of friends retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 type: object
 *                 properties:
 *                   id:
 *                     type: string
 *                     example: "a1b2c3d4-e5f6-7890-abcd-1234567890ef"
 *                   name:
 *                     type: string
 *                     example: "John Doe"
 *                   email:
 *                     type: string
 *                     example: "john@example.com"
 *       401:
 *         description: Unauthorized (missing or invalid JWT)
 */

export async function GET(rq: Request) {
  const authHeader = rq.headers.get("Authorization");

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
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
