export const dynamic = "force-dynamic";
export const maxDuration = 60;

const activities = [
  "신체활동", "미술놀이", "음률", "역할놀이", "언어영역",
  "수·조작영역", "감각·탐구영역", "바깥놀이", "기타", "미분류",
] as const;

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

function parseActivity(content: string) {
  const text = content.replace(/^```json\s*/i, "").replace(/\s*```$/i, "").trim();
  try {
    const value = JSON.parse(text) as { activity?: string; confidence?: number; reason?: string };
    if (value.activity && activities.includes(value.activity as (typeof activities)[number])) {
      return { activity: value.activity, confidence: Number(value.confidence) || 0.5, reason: value.reason || "AI 이미지 분석" };
    }
  } catch {
    // Use the category mentioned in a natural-language response.
  }
  const activity = activities.find((item) => content.includes(item)) ?? "미분류";
  return { activity, confidence: activity === "미분류" ? 0.25 : 0.5, reason: content.slice(0, 1000) };
}

export async function POST(request: Request) {
  const form = await request.formData();
  const image = form.get("image");
  const name = String(form.get("name") ?? "");
  if (!(image instanceof File) || !["image/jpeg", "image/png", "image/webp"].includes(image.type) || image.size > 10 * 1024 * 1024) {
    return Response.json({ error: "Invalid image" }, { status: 400 });
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return Response.json({ activity: fallbackActivity(name), confidence: 0.25, reason: "파일명 기준 fallback", source: "filename" });

  const baseUrl = (process.env.OPENAI_BASE_URL || "https://api.bizrouter.ai/v1").replace(/\/+$/, "");
  const response = await fetch(`${baseUrl}/messages`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({
      model: process.env.BIZROUTER_VISION_MODEL || "anthropic/claude-fable-5",
      max_tokens: 256,
      messages: [{
        role: "user",
        content: [
          { type: "text", text: `유아교육 활동 사진을 보고 아래 영역 중 하나로 분류하세요: ${activities.join(", ")}. 미술 재료·그리기·만들기는 미술놀이, 악기·노래·리듬은 음률, 역할극은 역할놀이, 책·이야기·글자는 언어영역, 숫자·퍼즐·블록은 수·조작영역, 자연·실험·감각 탐색은 감각·탐구영역, 달리기·체육은 신체활동입니다. 반드시 JSON 한 줄로만 답하세요: {"activity":"미술놀이","confidence":0.9,"reason":"판단 근거"}` },
          { type: "image", source: { type: "base64", media_type: image.type, data: Buffer.from(await image.arrayBuffer()).toString("base64") } },
        ],
      }],
    }),
  });
  if (!response.ok) return Response.json({ activity: fallbackActivity(name), confidence: 0.25, reason: "AI 분류 실패로 파일명을 사용했습니다.", source: "filename" });
  const payload = await response.json() as { content?: Array<{ type: string; text?: string }> };
  const content = payload.content?.find((block) => block.type === "text")?.text;
  if (!content) return Response.json({ activity: fallbackActivity(name), confidence: 0.25, reason: "AI 응답이 없어 파일명을 사용했습니다.", source: "filename" });
  return Response.json({ ...parseActivity(content), source: "ai" });
}
