import { db } from "@/lib/db";

export async function GET(
  req: Request,
  context: { params: Promise<{ userId: string }> }
) {
  try {
    const authHeader = req.headers.get("Authorization");

    if (!authHeader || !authHeader.startsWith("Bearer "))
      return new Response("Unauthorized", { status: 401 });

    const { userId } = await context.params;

    const rawUser = (await db.hgetall(`user:${userId}`)) as Record<
      string,
      string
    > | null;

    if (!rawUser || Object.keys(rawUser).length === 0) {
      return new Response("User not found", { status: 404 });
    }

    const user = {
      id: rawUser.id ?? userId,
      email: rawUser.email ?? null,
      name: rawUser.name ?? null,
    };

    return new Response(JSON.stringify(user), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    return new Response("Internal server error", { status: 500 });
  }
}
