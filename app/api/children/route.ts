import { getAuthenticatedUser } from "@/lib/auth";
import { initializeDatabase, query, withDatabaseClient } from "@/lib/db";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";

type ChildRow = { id: string; name: string; face_descriptor: number[] };

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  await initializeDatabase();
  await ensureUser(user);
  const result = await query<ChildRow>(
    `SELECT id::text, name, face_descriptor
     FROM children WHERE user_id = $1 ORDER BY created_at, id`,
    [user.id],
  );
  return Response.json({
    children: result.rows.map((child) => ({
      id: Number(child.id),
      name: child.name,
      descriptor: child.face_descriptor,
      url: `/api/children/${child.id}/photo`,
      persisted: true,
    })),
  });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "로그인이 필요합니다." }, { status: 401 });

  const form = await request.formData();
  const name = String(form.get("name") ?? "").trim();
  const image = form.get("image");
  const descriptorValue = String(form.get("descriptor") ?? "");

  if (!name || name.length > 100 || !(image instanceof File)) {
    return Response.json({ error: "아이 이름과 대표사진을 확인해 주세요." }, { status: 400 });
  }
  if (!["image/jpeg", "image/png"].includes(image.type) || image.size > 10 * 1024 * 1024) {
    return Response.json({ error: "10MB 이하 JPG 또는 PNG 파일만 저장할 수 있습니다." }, { status: 400 });
  }

  let descriptor: number[];
  try {
    descriptor = JSON.parse(descriptorValue) as number[];
  } catch {
    return Response.json({ error: "얼굴 특징값 형식이 올바르지 않습니다." }, { status: 400 });
  }
  if (!Array.isArray(descriptor) || descriptor.length !== 128 || descriptor.some((value) => !Number.isFinite(value))) {
    return Response.json({ error: "얼굴 특징값이 올바르지 않습니다." }, { status: 400 });
  }

  await initializeDatabase();
  const imageData = Buffer.from(await image.arrayBuffer());
  const child = await withDatabaseClient(async (client) => {
    await client.query("BEGIN");
    try {
      await client.query(
        `INSERT INTO app_users (id, email) VALUES ($1, $2)
         ON CONFLICT (id) DO UPDATE SET email = EXCLUDED.email, updated_at = NOW()`,
        [user.id, user.email],
      );
      const result = await client.query<{ id: string; name: string }>(
        `INSERT INTO children (user_id, name, image_data, image_mime, face_descriptor)
         VALUES ($1, $2, $3, $4, $5::double precision[])
         RETURNING id::text, name`,
        [user.id, name, imageData, image.type, descriptor],
      );
      await client.query("COMMIT");
      return result.rows[0];
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });

  return Response.json({
    child: {
      id: Number(child.id), name: child.name, descriptor,
      url: `/api/children/${child.id}/photo`, persisted: true,
    },
  }, { status: 201 });
}
