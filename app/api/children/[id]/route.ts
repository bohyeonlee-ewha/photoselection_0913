import { getAuthenticatedUser } from "@/lib/auth";
import { initializeDatabase, query } from "@/lib/db";

export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "잘못된 아이 ID입니다." }, { status: 400 });
  await initializeDatabase();
  const result = await query("DELETE FROM children WHERE id = $1 AND user_id = $2", [id, user.id]);
  if (!result.rowCount) return Response.json({ error: "아이를 찾을 수 없습니다." }, { status: 404 });
  return new Response(null, { status: 204 });
}
