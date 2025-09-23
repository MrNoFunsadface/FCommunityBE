import { db } from "@/lib/db";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

/**
 * @openapi
 * /auth/login:
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
 *                 example: congdeptrai@gmail.com
 *               password:
 *                 type: string
 *                 example: congdeptrai
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
 *                   example: 71db50d4-f833-47dd-aea2-07c014ce05ae
 *                 email:
 *                   type: string
 *                   example: congdeptrai@gmail.com
 *                 name:
 *                   type: string
 *                   example: Cong Dep Trai
 *                 token:
 *                   type: string
 *                   example: eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpZCI6IjcxZGI1MGQ0LWY4MzMtNDdkZC1hZWEyLTA3YzAxNGNlMDVhZSIsImVtYWlsIjoiY29uZ2RlcHRyYWlAZ21haWwuY29tIiwibmFtZSI6IkNvbmcgRGVwIFRyYWkiLCJpYXQiOjE3NTg2MTU5NDIsImV4cCI6MTc1OTIyMDc0Mn0.lmUlxYrx4EuaNzgpMg1fQYdygLAfR-DJ5vvsuFT0IEI
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
    if (!user || Object.keys(user).length === 0) {
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

    const token = jwt.sign(
      {
        id: userId,
        email: user.email,
        name: user.name,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    return new Response(
      JSON.stringify({
        id: user.id,
        email: user.email,
        name: user.name,
        token,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error(error);
    return new Response("Internal server error", { status: 500 });
  }
}
