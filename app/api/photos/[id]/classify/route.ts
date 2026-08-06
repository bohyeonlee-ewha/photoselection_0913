import { getAuthenticatedUser } from "@/lib/auth";
import { initializeDatabase, query } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const activities = [
  "신체활동", "미술놀이", "음률", "역할놀이", "언어영역",
  "수·조작영역", "감각·탐구영역", "바깥놀이", "기타", "미분류",
] as const;

type Classification = {
  activity: (typeof activities)[number];
  confidence: number;
  reason: string;
};

function parseClassification(content: string): Classification {
  const jsonText = content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const parsed = JSON.parse(jsonText) as Partial<Classification>;
    if (typeof parsed.activity === "string" && typeof parsed.reason === "string") {
      return {
        activity: activities.includes(parsed.activity as Classification["activity"]) ? parsed.activity as Classification["activity"] : "미분류",
        confidence: Number(parsed.confidence) || 0.5,
        reason: parsed.reason,
      };
    }
  } catch {
    // Some compatible models return a short natural-language answer despite the JSON instruction.
  }
  const activity = activities.find((item) => content.includes(item)) ?? "미분류";
  return { activity, confidence: activity === "미분류" ? 0.25 : 0.5, reason: content.slice(0, 1000) };
}

function fallbackActivity(name: string) {
  const value = name.toLowerCase().replace(/[\s_-]/g, "");
  if (/신체|체육|운동|달리기|바깥|산책|놀이터/.test(value)) return "신체활동";
  if (/미술|그림|물감|만들기|공작|색칠|그리기|클레이/.test(value)) return "미술놀이";
  if (/음률|음악|노래|악기|리듬|동요|율동/.test(value)) return "음률";
  if (/역할|병원놀이|가게놀이|소꿉|인형놀이|극놀이/.test(value)) return "역할놀이";
  if (/언어|동화|책|읽기|말하기|이야기|글자|낱말|동시/.test(value)) return "언어영역";
  if (/수조작|수학|퍼즐|블록|조립|분류|수세기|보드게임/.test(value)) return "수·조작영역";
  if (/감각|탐구|과학|실험|관찰|자연|요리|모래|물놀이|촉감/.test(value)) return "감각·탐구영역";
  return "미분류";
}

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const user = await getAuthenticatedUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { id } = await context.params;
  if (!/^\d+$/.test(id)) return Response.json({ error: "Invalid photo id" }, { status: 400 });

  await initializeDatabase();
  const result = await query<{
    name: string;
    image_data: Buffer;
    image_mime: string;
    activity: string | null;
    activity_confidence: number | null;
    activity_reason: string | null;
    activity_source: string;
  }>(
    `SELECT p.name, p.image_data, p.image_mime, p.activity,
            p.activity_confidence, p.activity_reason, p.activity_source
     FROM photos p JOIN photo_sessions s ON s.id = p.session_id
     WHERE p.id = $1 AND s.user_id = $2`,
    [id, user.id],
  );
  const photo = result.rows[0];
  if (!photo) return Response.json({ error: "Photo not found" }, { status: 404 });

  const body = await request.json().catch(() => ({})) as { force?: boolean };
  if (photo.activity_source === "manual" && !body.force) {
    return Response.json({ activity: photo.activity, confidence: photo.activity_confidence, reason: photo.activity_reason, source: "manual" });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    const activity = fallbackActivity(photo.name);
    await query(
      `UPDATE photos SET activity = $1, activity_confidence = $2, activity_reason = $3,
       activity_source = 'filename', updated_at = NOW() WHERE id = $4`,
      [activity, activity === "미분류" ? 0.2 : 0.55, "OpenAI API 키가 없어 파일명 기준으로 분류했습니다.", id],
    );
    return Response.json({ activity, confidence: activity === "미분류" ? 0.2 : 0.55, reason: "파일명 기준 fallback", source: "filename" });
  }

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.bizrouter.ai/v1").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: process.env.BIZROUTER_VISION_MODEL || "anthropic/claude-fable-5",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: [
          {
            type: "text",
            text: `유아교육 활동 사진을 분석하고 아래 JSON 형식으로만 답하세요. 영역은 반드시 다음 중 하나여야 합니다: ${activities.join(", " )}.\n\n판단 기준: 미술 재료·그리기·만들기는 미술놀이, 악기·노래·리듬은 음률, 역할극·병원놀이·가게놀이는 역할놀이, 책·이야기·글자는 언어영역, 숫자·퍼즐·블록·분류는 수·조작영역, 자연·실험·감각 탐색은 감각·탐구영역, 달리기·체육·신체 움직임은 신체활동입니다. 근거가 부족하면 미분류로 선택하세요. confidence는 0과 1 사이 숫자로 주세요.\n\n응답 형식: {"activity":"미술놀이","confidence":0.9,"reason":"판단 근거"}`,
          },
          {
            type: "image",
            source: {
              type: "base64",
              media_type: photo.image_mime,
              data: Buffer.from(photo.image_data).toString("base64"),
            },
          },
        ],
      }],
    }),
  });
  if (!response.ok) throw new Error(`BizRouter Messages API returned ${response.status}`);
  const payload = await response.json() as { content?: Array<{ type: string; text?: string }> };
  const content = payload.content?.find((block) => block.type === "text")?.text;
  if (!content) throw new Error("BizRouter returned an empty classification response");
  const parsed = parseClassification(content);
  const activity = activities.includes(parsed.activity) ? parsed.activity : "미분류";
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0));
  await query(
    `UPDATE photos SET activity = $1, activity_confidence = $2, activity_reason = $3,
     activity_source = 'ai', updated_at = NOW() WHERE id = $4`,
    [activity, confidence, parsed.reason.slice(0, 1000), id],
  );
  return Response.json({ activity, confidence, reason: parsed.reason, source: "ai" });
}
