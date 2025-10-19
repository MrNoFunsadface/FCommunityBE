import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /chat/group/create:
 *   post:
 *     summary: Create a new group chat
 *     description: Create a group chat with a name and list of member user IDs. The authenticated user will be added as a member if not included.
 *     tags:
 *       - Chat Group
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - members
 *             properties:
 *               name:
 *                 type: string
 *                 description: Group display name
 *               members:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: Array of user ids to include in the group
 *     responses:
 *       201:
 *         description: Group created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 chatId:
 *                   type: string
 *       400:
 *         description: Invalid input (e.g. not enough members)
 *       401:
 *         description: Unauthorized
 *       500:
 *         description: Internal server error
 */

export async function POST(req: Request) {
  try {
    const authHeader =
      req.headers.get("Authorization") || req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer "))
      return new Response("Unauthorized", { status: 401 });

    const token = authHeader.split(" ")[1];
    const payload = jwt.verify(token, process.env.JWT_SECRET!) as {
      id: string;
    };

    const body = await req.json();
    const { name, members } = body as {
      name?: string;
      members?: string[];
    };

    const newChatId = randomUUID();

    // normalize members, ensure it's an array and include the creator
    const memberList = Array.isArray(members) ? members.filter(Boolean) : [];
    if (!memberList.includes(payload.id)) {
      memberList.push(payload.id);
    }

    // require more than 2 members for a group chat
    if (memberList.length <= 2) {
      return new Response("Group chat requires more than 2 members", {
        status: 400,
      });
    }

    await Promise.all([
      db.sadd(
        `chat:${newChatId}:members`,
        memberList[0],
        ...memberList.slice(1)
      ),
      db.hset(`chat:${newChatId}:meta`, {
        type: "group",
        name,
        createdAt: Date.now(),
        createdBy: payload.id,
      }),
      // add the newChatId to each member's groups set
      // spread the map so Promise.all gets each db.sadd promise as an element
      ...memberList.map((memberId) =>
        db.sadd(`user:${memberId}:groups`, newChatId)
      ),
    ]);

    return new Response(JSON.stringify(newChatId), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response("Internal server error", { status: 500 });
  }
}
