import { getAuthenticatedUser } from "@/lib/auth";
import { initializeDatabase, query } from "@/lib/db";

export const dynamic = "force-dynamic";

type PhotoRow = { image_data: Buffer; image_mime: string };

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return new Response("Unauthorized", { status: 401 });

  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return new Response("Bad Request", { status: 400 });
  await initializeDatabase();
  const result = await query<PhotoRow>(
    "SELECT image_data, image_mime FROM children WHERE id = $1 AND user_id = $2",
    [id, user.id],
  );
  const photo = result.rows[0];
  if (!photo) return new Response("Not Found", { status: 404 });

  return new Response(new Uint8Array(photo.image_data), {
    headers: {
      "Content-Type": photo.image_mime,
      "Cache-Control": "private, max-age=3600",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
