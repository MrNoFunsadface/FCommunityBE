import { db } from "@/lib/db";
import { randomUUID } from "crypto";
import bcrypt from "bcrypt";
import jwt from "jsonwebtoken";

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Register a new user
 *     description: Creates a new user with a name, email, and password. Returns a JWT for authentication.
 *     tags:
 *       - Auth
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *             properties:
 *               name:
 *                 type: string
 *                 example: Cong Dep Trai
 *               email:
 *                 type: string
 *                 format: email
 *                 example: congdeptrai@gmail.com
 *               password:
 *                 type: string
 *                 format: password
 *                 example: congdeptrai
 *     responses:
 *       201:
 *         description: User successfully registered
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 id:
 *                   type: string
 *                   format: uuid
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
 *         description: Missing fields or email already registered
 *       500:
 *         description: Internal server error
 */

export async function POST(rq: Request) {
  try {
    const body = await rq.json();

    const { name, email, password } = body;

    if (!name || !email || !password) {
      return new Response("Missing fields", { status: 400 });
    }

    const existingId = await db.get(`user:email:${email}`);
    if (existingId) {
      return new Response("Email already registered", { status: 400 });
    }

    const userId = randomUUID();
    const passwordHash = await bcrypt.hash(password, 10);

    await db.hset(`user:${userId}`, {
      id: userId,
      name,
      email,
      password: passwordHash,
    });

    await db.set(`user:email:${email}`, userId);

    const token = jwt.sign(
      {
        id: userId,
        email,
        name,
      },
      process.env.JWT_SECRET!,
      { expiresIn: "7d" }
    );

    return new Response(JSON.stringify({ id: userId, email, name, token }), {
      status: 201,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error(error);
    return new Response("Internal server error", { status: 500 });
  }
}
