import { getAuthenticatedUser } from "@/lib/auth";
import { initializeDatabase, query, withDatabaseClient } from "@/lib/db";
import { ensureUser } from "@/lib/users";

export const dynamic = "force-dynamic";

type PhotoRow = {
  id: string;
  name: string;
  image_mime: string;
  quality: string;
  quality_reasons: string[];
  quality_score: number | null;
  shot_type: string;
  child_id: string | null;
  matched_child_ids: string[];
  activity: string | null;
  selected: boolean;
  best_key: string | null;
  is_best: boolean;
  duplicate_of: string | null;
  is_duplicate: boolean;
  perceptual_hash: string | null;
};

function serialize(row: PhotoRow) {
  return {
    id: Number(row.id),
    name: row.name,
    url: `/api/photos/${row.id}/image`,
    quality: row.quality,
    reasons: row.quality_reasons ?? [],
    score: row.quality_score,
    shotType: row.shot_type,
    childId: row.child_id ? Number(row.child_id) : 0,
    matchedChildIds: (row.matched_child_ids ?? []).map(Number),
    activity: row.activity,
    selected: row.selected,
    bestKey: row.best_key,
    isBest: row.is_best,
    duplicateOf: row.duplicate_of ? Number(row.duplicate_of) : null,
    isDuplicate: row.is_duplicate,
    perceptualHash: row.perceptual_hash,
  };
}

export async function GET() {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  await initializeDatabase();
  await ensureUser(user);
  const session = await query<{ id: string; goals: Record<string, number> }>(
    `SELECT id::text, goals FROM photo_sessions
     WHERE user_id = $1 ORDER BY updated_at DESC, id DESC LIMIT 1`,
    [user.id],
  );
  if (!session.rows[0]) return Response.json({ sessionId: null, goals: {}, photos: [] });
  const result = await query<PhotoRow>(
    `SELECT id::text, name, image_mime, quality, quality_reasons,
            quality_score, shot_type, child_id::text, matched_child_ids,
            activity, selected, best_key, is_best
            , duplicate_of::text, is_duplicate, perceptual_hash
     FROM photos WHERE session_id = $1 ORDER BY created_at, id`,
    [session.rows[0].id],
  );
  return Response.json({
    sessionId: Number(session.rows[0].id),
    goals: session.rows[0].goals ?? {},
    photos: result.rows.map(serialize),
  });
}

export async function POST(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const form = await request.formData();
  const files = form.getAll("files").filter((value): value is File => value instanceof File);
  const requestedSessionId = String(form.get("sessionId") ?? "");
  if (!files.length || files.length > 100) return Response.json({ error: "Invalid files" }, { status: 400 });
  if (files.some((file) => !["image/jpeg", "image/png"].includes(file.type) || file.size > 10 * 1024 * 1024)) {
    return Response.json({ error: "Only JPG/PNG files up to 10MB are supported" }, { status: 400 });
  }

  await initializeDatabase();
  await ensureUser(user);
  const saved = await withDatabaseClient(async (client) => {
    await client.query("BEGIN");
    try {
      let sessionId = requestedSessionId;
      if (sessionId) {
        const owned = await client.query("SELECT id FROM photo_sessions WHERE id = $1 AND user_id = $2", [sessionId, user.id]);
        if (!owned.rowCount) throw new Error("Session not found");
      } else {
        const session = await client.query<{ id: string }>(
          `INSERT INTO photo_sessions (user_id) VALUES ($1) RETURNING id::text`, [user.id],
        );
        sessionId = session.rows[0].id;
      }
      const photos: Array<{ id: number; name: string; url: string }> = [];
      for (const file of files) {
        const result = await client.query<{ id: string }>(
          `INSERT INTO photos (session_id, name, image_data, image_mime)
           VALUES ($1, $2, $3, $4) RETURNING id::text`,
          [sessionId, file.name, Buffer.from(await file.arrayBuffer()), file.type],
        );
        photos.push({ id: Number(result.rows[0].id), name: file.name, url: `/api/photos/${result.rows[0].id}/image` });
      }
      await client.query("UPDATE photo_sessions SET updated_at = NOW() WHERE id = $1", [sessionId]);
      await client.query("COMMIT");
      return { sessionId, photos };
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    }
  });
  return Response.json({ sessionId: Number(saved.sessionId), photos: saved.photos }, { status: 201 });
}

export async function PATCH(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = await request.json() as {
    sessionId?: number;
    goals?: Record<string, number>;
    photos?: Array<{
      id: number; quality?: string; reasons?: string[]; score?: number;
      shotType?: string; childId?: number; matchedChildIds?: number[];
      activity?: string; selected?: boolean; bestKey?: string; isBest?: boolean;
      duplicateOf?: number; isDuplicate?: boolean; perceptualHash?: string;
    }>;
  };
  if (!body.sessionId || !Number.isInteger(body.sessionId)) return Response.json({ error: "Invalid session" }, { status: 400 });
  await initializeDatabase();
  const ownership = await query(
    "UPDATE photo_sessions SET goals = COALESCE($1::jsonb, goals), updated_at = NOW() WHERE id = $2 AND user_id = $3",
    [body.goals ? JSON.stringify(body.goals) : null, body.sessionId, user.id],
  );
  if (!ownership.rowCount) return Response.json({ error: "Session not found" }, { status: 404 });
  for (const photo of body.photos ?? []) {
    await query(
      `UPDATE photos SET quality = COALESCE($1, quality), quality_reasons = COALESCE($2::jsonb, quality_reasons),
       quality_score = COALESCE($3, quality_score), shot_type = COALESCE($4, shot_type),
       child_id = $5, matched_child_ids = COALESCE($6, matched_child_ids), activity = COALESCE($7, activity),
       selected = COALESCE($8, selected), best_key = $9, is_best = COALESCE($10, is_best),
       duplicate_of = $11, is_duplicate = COALESCE($12, is_duplicate), perceptual_hash = COALESCE($13, perceptual_hash), updated_at = NOW()
       WHERE id = $14 AND session_id = $15`,
      [photo.quality ?? null, photo.reasons ? JSON.stringify(photo.reasons) : null, photo.score ?? null,
        photo.shotType ?? null, photo.childId || null, photo.matchedChildIds ?? null, photo.activity ?? null,
        photo.selected ?? null, photo.bestKey ?? null, photo.isBest ?? null, photo.duplicateOf || null,
        photo.isDuplicate ?? null, photo.perceptualHash ?? null, photo.id, body.sessionId],
    );
  }
  return Response.json({ ok: true });
}

export async function DELETE(request: Request) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const sessionId = new URL(request.url).searchParams.get("sessionId");
  if (!sessionId || !/^\d+$/.test(sessionId)) return Response.json({ error: "Invalid session" }, { status: 400 });
  await initializeDatabase();
  const result = await query("DELETE FROM photo_sessions WHERE id = $1 AND user_id = $2", [sessionId, user.id]);
  if (!result.rowCount) return Response.json({ error: "Session not found" }, { status: 404 });
  return new Response(null, { status: 204 });
}
