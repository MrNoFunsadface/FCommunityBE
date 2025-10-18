import { fetchRedis } from "@/helpers/redis";
import { chatHrefConstructor } from "@/lib/utils";

/**
 * @openapi
 * /chat/{chatId}:
 *   get:
 *     summary: Get messages from a chat [UNDER MAINTAINANCE]
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
 *         example: 71db50d4-f833-47dd-aea2-07c014ce05ae--360fc452-7f02-4e11-89d7-a30d2eaf2085
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
