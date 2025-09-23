import { fetchRedis } from "@/helpers/redis";
import { chatHrefConstructor } from "@/lib/utils";

/**
 * @openapi
 * /chat/{chatId}:
 *   get:
 *     summary: Get messages from a chat
 *     description: Retrieve all messages from a specific chat.
 *     tags:
 *       - Chat
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: chatId
 *         required: true
 *         schema:
 *           type: string
 *         description: "The unique identifier of the chat (format: userId1--userId2)"
 *         example: 123e4567-e89b-12d3-a456-426614174000--789e4567-e89b-12d3-a456-426614174999
 *     responses:
 *       200:
 *         description: A list of messages
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: "#/components/schemas/Message"
 *       401:
 *         description: Unauthorized - Invalid token
 *       500:
 *         description: Internal server error
 */

export async function GET(
  rq: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    const authHeader = rq.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer "))
      return new Response("Unauthorized", { status: 401 });

    const { chatId } = await context.params;

    const [userId1, userId2] = chatId.split("--");

    const sortedChatId = chatHrefConstructor(userId1, userId2);

    const results: string[] = await fetchRedis(
      "zrange",
      `chat:${sortedChatId}:messages`,
      0,
      -1
    );

    return new Response(JSON.stringify(results), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {}
}
