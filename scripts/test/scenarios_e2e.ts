/**
 * 시나리오 8종 e2e 자동 검증 — prod main alias에서 직접 호출.
 *
 * 실행:
 *   cd app/ui && npx tsx ../../scripts/test/scenarios_e2e.ts
 *
 * 결과:
 *   data/eval_scenarios.json — 통과율 + 시나리오별 4축 체크
 *   콘솔: ✅/❌ 표
 */
import { writeFile, mkdir } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// 스크립트 위치 기반으로 repo root 경로 해석 (cwd 무관)
const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");

const PROD = "https://idus-cx-poc.vercel.app";

interface Scenario {
  id: string;
  label: string;
  input: string;
  expected_tools: string[];
  min_response_chars: number;
  /** Discovery 단계는 sources 생략 OK — system prompt 명시 */
  requires_sources?: boolean;
}

const SCENARIOS: Scenario[] = [
  { id: "A", label: "선물 추천", input: "엄마 환갑 선물 30만원대 도자기 추천", expected_tools: ["recommend_gift"], min_response_chars: 300, requires_sources: true },
  { id: "B", label: "환불 안내", input: "주문한 컵 환불해주세요", expected_tools: ["get_user_orders"], min_response_chars: 200, requires_sources: true },
  { id: "C", label: "작품 하자 Discovery", input: "받은 작품에 금이 갔어요", expected_tools: [], min_response_chars: 150, requires_sources: false },
  { id: "D", label: "작가 무응답 Discovery", input: "작가가 답이 없어요", expected_tools: [], min_response_chars: 150, requires_sources: false },
  { id: "E", label: "부분 환불", input: "절반만 환불받을 수 있을까요?", expected_tools: ["get_user_orders"], min_response_chars: 200, requires_sources: true },
  { id: "F", label: "교환 요청", input: "다른 색으로 바꿀 수 있나요?", expected_tools: ["lookup_faq"], min_response_chars: 200, requires_sources: true },
  { id: "G", label: "배송 조회", input: "주문한 거 언제 와요?", expected_tools: ["get_user_orders"], min_response_chars: 200, requires_sources: true },
  { id: "H", label: "쿠폰", input: "쿠폰 어떻게 써요?", expected_tools: ["lookup_faq"], min_response_chars: 200, requires_sources: true },
];

interface CallResult {
  text: string;
  tools: string[];
  durationMs: number;
}

async function callAPI(input: string): Promise<CallResult> {
  const start = Date.now();
  const res = await fetch(`${PROD}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      messages: [{ role: "user", content: input }],
    }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok || !res.body) {
    throw new Error(`HTTP ${res.status}`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  const tools = new Set<string>();
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
        if (event.type === "tool-input-available" && typeof event.toolName === "string") {
          tools.add(event.toolName);
        }
      } catch {
        // skip malformed
      }
    }
  }
  return { text, tools: Array.from(tools), durationMs: Date.now() - start };
}

interface Checks {
  response_complete: boolean;
  tools_correct: boolean;
  no_inline_source: boolean;
  sources_json: boolean;
}

interface ScenarioResult extends Scenario {
  text_len: number;
  tools: string[];
  duration_ms: number;
  checks: Checks;
  pass: boolean;
}

async function main() {
  console.log(`▶ prod e2e 검증 시작: ${PROD}`);
  console.log(`  시나리오 ${SCENARIOS.length}개\n`);

  const results: ScenarioResult[] = [];

  for (const s of SCENARIOS) {
    process.stdout.write(`[${s.id}] ${s.label}: ${s.input}\n`);
    try {
      const { text, tools, durationMs } = await callAPI(s.input);
      const checks: Checks = {
        response_complete: text.length >= s.min_response_chars,
        tools_correct:
          s.expected_tools.length === 0 ||
          s.expected_tools.every((t) => tools.includes(t)),
        no_inline_source: !text.includes("— 아이디어스 FAQ"),
        sources_json: s.requires_sources === false
          ? true // Discovery 단계는 sources 생략 OK (system prompt 명시)
          : /sources\\?":/.test(text) || /"sources"/.test(text),
      };
      const pass = Object.values(checks).every((v) => v);
      results.push({
        ...s,
        text_len: text.length,
        tools,
        duration_ms: durationMs,
        checks,
        pass,
      });
      const icons = Object.entries(checks)
        .map(([k, v]) => `${v ? "✅" : "❌"}${k.replace(/_/g, "")}`)
        .join(" ");
      console.log(
        `  ${pass ? "✅ PASS" : "❌ FAIL"} | len=${text.length} | tools=[${tools.join(",")}] | ${durationMs}ms`
      );
      console.log(`  ${icons}\n`);
    } catch (err) {
      console.log(`  ❌ ERROR: ${(err as Error).message}\n`);
      results.push({
        ...s,
        text_len: 0,
        tools: [],
        duration_ms: 0,
        checks: {
          response_complete: false,
          tools_correct: false,
          no_inline_source: false,
          sources_json: false,
        },
        pass: false,
      });
    }
  }

  const passCount = results.filter((r) => r.pass).length;
  const summary = {
    date: new Date().toISOString(),
    prod_url: PROD,
    n: results.length,
    pass: passCount,
    fail: results.length - passCount,
    pass_rate: `${Math.round((passCount / results.length) * 100)}%`,
    avg_duration_ms: Math.round(
      results.reduce((acc, r) => acc + r.duration_ms, 0) / results.length
    ),
    results,
  };

  const outPath = resolve(REPO_ROOT, "data/eval_scenarios.json");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(summary, null, 2), "utf-8");

  console.log(`\n═══════════════════════════════`);
  console.log(`결과: ${passCount}/${results.length} 통과 (${summary.pass_rate})`);
  console.log(`평균 응답: ${summary.avg_duration_ms}ms`);
  console.log(`저장: ${outPath}`);

  process.exit(passCount === results.length ? 0 : 1);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
