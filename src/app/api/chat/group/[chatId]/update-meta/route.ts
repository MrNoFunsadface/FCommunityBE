import { db } from "@/lib/db";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /chat/group/{chatId}/update-meta:
 *   patch:
 *     summary: Update group metadata
 *     description: Update mutable group metadata such as the group name. Typically restricted to the creator/admins.
 *     tags:
 *       - Chat Group
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: chatId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *     responses:
 *       200:
 *         description: Updated metadata
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Forbidden (not allowed to update)
 *       404:
 *         description: Chat not found
 *       422:
 *         description: Validation error
 *       500:
 *         description: Internal server error
 */

export async function PATCH(
  req: Request,
  context: { params: Promise<{ chatId: string }> }
) {
  try {
    const authHeader =
      req.headers.get("Authorization") || req.headers.get("authorization");

    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return new Response("Unauthorized", { status: 401 });
    }

    const token = authHeader.split(" ")[1];

    if (!process.env.JWT_SECRET) {
      return new Response("Server configuration error", { status: 500 });
    }

    let payload: { id: string };
    try {
      payload = jwt.verify(token, process.env.JWT_SECRET!) as { id: string };
    } catch {
      return new Response("Unauthorized", { status: 401 });
    }

    const { chatId } = await context.params;

    const body = await req.json();
    const { name } = body as { name?: string };

    if (!name || typeof name !== "string" || name.trim().length === 0) {
      return new Response("name is required", { status: 422 });
    }

    // ensure chat exists
    const meta = (await db.hgetall(`chat:${chatId}:meta`)) as Record<
      string,
      string
    > | null;

    if (!meta || Object.keys(meta).length === 0) {
      return new Response("Chat not found", { status: 404 });
    }

    // permission: only creator can update meta (adjust as needed)
    if (meta.createdBy && meta.createdBy !== payload.id) {
      return new Response("Forbidden", { status: 403 });
    }

    const updatedAt = String(Date.now());

    await db.hset(`chat:${chatId}:meta`, {
      name: name.trim(),
      updatedAt,
    });

    const updatedMeta = {
      chatId,
      type: meta.type ?? "group",
      name: name.trim(),
      updatedAt: Number(updatedAt),
    };

    return new Response(JSON.stringify(updatedMeta), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("update chat meta error:", error);
    return new Response("Internal server error", { status: 500 });
  }
}
