/**
 * GT 5건 + LLM Judge — PoC 1회 평가 베이스라인.
 *
 * 흐름:
 *   1. 5 시나리오 → prod /api/chat 호출 → PoC 응답 받기
 *   2. 5 시나리오 → Sonnet 4.5에 'idus CS 시니어 매니저' 페르소나로 GT 응답 작성 요청
 *   3. 5건 → Judge(Sonnet 4.5)에 (GT, PoC) 보내 4축 5점 척도 평가
 *   4. data/eval_baseline.json 저장 + docs/kpi.md 'PoC가 검증한 부분' 표 업데이트용 점수 출력
 *
 * 실행:
 *   cd app/ui && npx tsx ../../scripts/eval/baseline.ts
 *
 * 비용 추정: ~$0.15 (Sonnet 4.5 호출 10회 × 3K tokens)
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

const PROD = "https://idus-cx-poc.vercel.app";
const OPENROUTER = "https://openrouter.ai/api/v1/chat/completions";
const JUDGE_MODEL = "anthropic/claude-sonnet-4-5";

// .env.local 직접 읽기 (dotenv 의존성 회피)
async function loadEnv(): Promise<string> {
  const envPath = resolve(REPO_ROOT, ".env.local");
  const raw = await readFile(envPath, "utf-8");
  const m = raw.match(/^OPENROUTER_API_KEY=(.+)$/m);
  if (!m) throw new Error(".env.local에 OPENROUTER_API_KEY 없음");
  return m[1].trim();
}

interface Scenario {
  id: string;
  label: string;
  input: string;
}

const SCENARIOS: Scenario[] = [
  { id: "A", label: "선물 추천", input: "엄마 환갑 선물 30만원대 도자기 추천" },
  { id: "B", label: "환불 안내", input: "주문한 컵 환불해주세요" },
  { id: "C", label: "작품 하자 Discovery", input: "받은 작품에 금이 갔어요" },
  { id: "E", label: "부분 환불", input: "절반만 환불받을 수 있을까요?" },
  { id: "H", label: "쿠폰", input: "쿠폰 어떻게 써요?" },
];

const GT_SYSTEM = `당신은 아이디어스 CS 시니어 매니저입니다. 다음 사용자 발화에 대해 이상적인 한국어 응답을 작성하세요.

원칙:
- 진짜 idus 채널톡 매크로 패턴: 공감 한 줄 → 정책·결과 (인용 블록) → 다음 단계 가이드
- 작품 관련 모든 이슈에 작가-고객 메시지 동선("작품 문의" 버튼) 강조 (FAQ #47)
- 정책 인용 시 본문에 "— 아이디어스 FAQ #N" 출처 표기 X (검증 정보는 별도)
- 응답 끝에 "※"로 시작하는 면책 한 줄
- 한국어 친근 정중형 ("~드릴게요", "~기 위해서는")
- 매크로 톤: "마음이 안 좋으셨겠어요", "당황스러우셨겠어요"
- 환불 결정은 작가별 정책 4종 (full_refund / no_refund_after_start / case_by_case / partial_only) 룰을 따름

응답만 작성하고 다른 멘트 없이 종료.`;

const JUDGE_SYSTEM = `당신은 idus CS 응답 품질 평가자입니다. GT(이상적 응답)과 PoC 응답을 비교해 4축 5점 척도로 평가하세요.

평가 축:
1. citation (정책 인용 정확도): 인용된 정책 본문이 idus 운영 동선과 일치, 출처 본문 X
2. decision (decision 적절성): 환불·이관 결정이 이상적 응답과 같은 방향
3. tone (톤 자연스러움): 공감→정책→가이드 3단 + idus 매크로 친근 정중형
4. escalate (escalate 적절성): 사람 이관·작가 메시지 동선 안내가 적절

JSON으로만 응답:
{"citation": 5, "decision": 4, "tone": 5, "escalate": 4, "reasoning": "한 줄 코멘트"}`;

async function callProd(input: string): Promise<string> {
  const res = await fetch(`${PROD}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: input }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok || !res.body) throw new Error(`prod HTTP ${res.status}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";
    for (const line of lines) {
      if (!line.startsWith("data: ")) continue;
      const payload = line.slice(6).trim();
      if (payload === "[DONE]") continue;
      try {
        const event = JSON.parse(payload);
        if (event.type === "text-delta" && typeof event.delta === "string") {
          text += event.delta;
        }
      } catch {
        // skip
      }
    }
  }
  return text;
}

async function callOpenRouter(
  apiKey: string,
  system: string,
  user: string
): Promise<string> {
  const res = await fetch(OPENROUTER, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model: JUDGE_MODEL,
      messages: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
      temperature: 0.3,
      max_tokens: 1500,
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`OpenRouter ${res.status}: ${body.slice(0, 200)}`);
  }
  const data = await res.json();
  return data.choices?.[0]?.message?.content ?? "";
}

interface Score {
  citation: number;
  decision: number;
  tone: number;
  escalate: number;
  reasoning: string;
}

function parseScore(raw: string): Score | null {
  // 코드블록 제거 + JSON 추출
  const jsonMatch = raw.match(/\{[\s\S]*\}/);
  if (!jsonMatch) return null;
  try {
    const obj = JSON.parse(jsonMatch[0]);
    if (
      typeof obj.citation !== "number" ||
      typeof obj.decision !== "number" ||
      typeof obj.tone !== "number" ||
      typeof obj.escalate !== "number"
    ) {
      return null;
    }
    return {
      citation: obj.citation,
      decision: obj.decision,
      tone: obj.tone,
      escalate: obj.escalate,
      reasoning: typeof obj.reasoning === "string" ? obj.reasoning : "",
    };
  } catch {
    return null;
  }
}

async function main() {
  console.log("▶ GT + LLM Judge 베이스라인 평가\n");
  const apiKey = await loadEnv();

  interface Row {
    id: string;
    label: string;
    input: string;
    poc_response: string;
    gt_response: string;
    score: Score | null;
  }

  const rows: Row[] = [];

  for (const s of SCENARIOS) {
    console.log(`[${s.id}] ${s.label}`);

    process.stdout.write("  prod 호출... ");
    const poc_response = await callProd(s.input);
    console.log(`✓ (${poc_response.length}자)`);

    process.stdout.write("  GT 작성... ");
    const gt_response = await callOpenRouter(apiKey, GT_SYSTEM, s.input);
    console.log(`✓ (${gt_response.length}자)`);

    process.stdout.write("  Judge 평가... ");
    const judgeUser = `[입력]\n${s.input}\n\n[GT 응답]\n${gt_response}\n\n[PoC 응답]\n${poc_response}`;
    const judgeRaw = await callOpenRouter(apiKey, JUDGE_SYSTEM, judgeUser);
    const score = parseScore(judgeRaw);
    if (score) {
      const avg = (score.citation + score.decision + score.tone + score.escalate) / 4;
      console.log(
        `✓ avg=${avg.toFixed(2)} (citation=${score.citation} decision=${score.decision} tone=${score.tone} escalate=${score.escalate})`
      );
    } else {
      console.log(`✗ parse 실패: ${judgeRaw.slice(0, 100)}`);
    }
    console.log();

    rows.push({ ...s, poc_response, gt_response, score });
  }

  // 집계
  const validScores = rows.filter((r) => r.score !== null).map((r) => r.score!);
  const avg = (key: keyof Omit<Score, "reasoning">) =>
    validScores.reduce((acc, s) => acc + s[key], 0) / validScores.length;

  const summary = {
    date: new Date().toISOString(),
    n: rows.length,
    judge_model: JUDGE_MODEL,
    avg_score:
      validScores.length === 0
        ? null
        : (avg("citation") + avg("decision") + avg("tone") + avg("escalate")) / 4,
    axes:
      validScores.length === 0
        ? null
        : {
            citation: Number(avg("citation").toFixed(2)),
            decision: Number(avg("decision").toFixed(2)),
            tone: Number(avg("tone").toFixed(2)),
            escalate: Number(avg("escalate").toFixed(2)),
          },
    rows,
  };

  const outPath = resolve(REPO_ROOT, "data/eval_baseline.json");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(summary, null, 2), "utf-8");

  console.log("═══════════════════════════════");
  console.log(`총 ${rows.length}건 / 점수 산출 ${validScores.length}건`);
  if (summary.avg_score !== null && summary.axes) {
    console.log(`평균: ${summary.avg_score.toFixed(2)}/5`);
    console.log(`축별: citation=${summary.axes.citation} · decision=${summary.axes.decision} · tone=${summary.axes.tone} · escalate=${summary.axes.escalate}`);
  }
  console.log(`저장: ${outPath}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
