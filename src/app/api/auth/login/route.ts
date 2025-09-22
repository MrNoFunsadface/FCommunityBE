import { db } from "@/lib/db";
import bcrypt from "bcrypt";

/**
 * @openapi
 * /login:
 *   post:
 *     summary: Log in a user
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - email
 *               - password
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *                 example: john@example.com
 *               password:
 *                 type: string
 *                 example: mySecurePass123
 *     responses:
 *       200:
 *         description: Successfully logged in
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   example: 123e4567-e89b-12d3-a456-426614174000
 *                 email:
 *                   type: string
 *                   example: john@example.com
 *                 name:
 *                   type: string
 *                   example: John Doe
 *       400:
 *         description: Missing email or password
 *       401:
 *         description: Invalid email or password
 *       404:
 *         description: User not found
 *       500:
 *         description: Internal server error
 */

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
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(error);
    return new Response("Internal server error", { status: 500 });
  }
}
