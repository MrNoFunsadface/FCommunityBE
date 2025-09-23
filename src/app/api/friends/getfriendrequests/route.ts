import { fetchRedis } from "@/helpers/redis";
import { db } from "@/lib/db";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /friends/getfriendrequests:
 *   get:
 *     summary: Get incoming friend requests
 *     description: "Retrieve all pending friend requests for the authenticated user. Each friend request contains full user details."
 *     tags:
 *       - Friends
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: "A list of incoming friend requests (user objects)."
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/User'
 *       401:
 *         description: "Unauthorized - Missing or invalid JWT token."
 *       500:
 *         description: "Internal server error."
 *
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           example: "123e4567-e89b-12d3-a456-426614174000"
 *         email:
 *           type: string
 *           example: "friend@example.com"
 *         name:
 *           type: string
 *           example: "Alice Johnson"
 */

export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as User;

    const friendRequestIds = (await fetchRedis(
      "smembers",
      `user:${payload.id}:incoming_friend_requests`
    )) as string[];

    const friendRequests = await Promise.all(
      friendRequestIds.map(async (requestId) => {
        const friend = await db.hgetall(`user:${requestId}`);

        if (!friend || !friend.id) {
          return null; // skip invalid or missing users
        }

        return {
          id: friend.id,
          name: friend.name,
          email: friend.email,
        } as User;
      })
    );

    return new Response(JSON.stringify(friendRequests), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.log(error);
    return new Response("Internal server error", { status: 500 });
  }
}
