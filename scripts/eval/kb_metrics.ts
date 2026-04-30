/**
 * KB recall/precision 자동 측정.
 *
 * 비판 #2: "KB 인용이 진짜 응답에 반영되는지 측정 X" 직격.
 *
 * - Precision: PoC 응답의 cited_text가 진짜 idus FAQ 본문에 substring 또는 높은 n-gram overlap 있는 비율
 * - Recall: 시나리오별 expected faq_ids 중 응답의 sources.faq_id에 포함된 비율
 *
 * 실행:
 *   cd app/ui && npx tsx ../../scripts/eval/kb_metrics.ts
 */
import { writeFile, mkdir, readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, "../..");
const PROD = "https://idus-cx-poc.vercel.app";

interface KbItem { id: number; clean_md: string }

interface Scenario {
  id: string;
  label: string;
  input: string;
  expected_faq_ids: number[];
}

const SCENARIOS: Scenario[] = [
  { id: "A", label: "선물 추천", input: "엄마 환갑 선물 30만원대 도자기 추천", expected_faq_ids: [55] },
  { id: "B", label: "환불 안내", input: "주문한 컵 환불해주세요", expected_faq_ids: [39, 41] },
  { id: "C", label: "작품 하자", input: "받은 작품에 금이 갔어요", expected_faq_ids: [23] },
  { id: "D", label: "작가 무응답", input: "작가가 답이 없어요", expected_faq_ids: [47] },
  { id: "E", label: "부분 환불", input: "절반만 환불받을 수 있을까요?", expected_faq_ids: [39, 41] },
  { id: "F", label: "교환 요청", input: "다른 색으로 바꿀 수 있나요?", expected_faq_ids: [39] },
  { id: "G", label: "배송 조회", input: "주문한 거 언제 와요?", expected_faq_ids: [42, 62] },
  { id: "H", label: "쿠폰", input: "쿠폰 어떻게 써요?", expected_faq_ids: [36] },
];

async function callProd(input: string): Promise<string> {
  const res = await fetch(`${PROD}/api/chat`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ messages: [{ role: "user", content: input }] }),
    signal: AbortSignal.timeout(120_000),
  });
  if (!res.ok || !res.body) throw new Error(`HTTP ${res.status}`);
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
        const ev = JSON.parse(payload);
        if (ev.type === "text-delta" && typeof ev.delta === "string") text += ev.delta;
      } catch {}
    }
  }
  return text;
}

interface ParsedSources {
  faq_id?: number;
  faq_title?: string;
  cited_text?: string;
}

function parseSources(text: string): ParsedSources | null {
  const match = text.match(/```json\s*([\s\S]*?)\s*```/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1]);
    return parsed?.sources ?? null;
  } catch {
    return null;
  }
}

/** 본문 인용 블록(>으로 시작하는 줄) 추출 — sources.cited_text 누락 시 폴백 */
function extractInlineQuotes(text: string): string {
  const lines = text.split("\n");
  return lines
    .filter((l) => l.trim().startsWith(">"))
    .map((l) => l.replace(/^>\s*/, "").replace(/^"|"$/g, "").trim())
    .filter((l) => l.length > 10)
    .join(" ");
}

/** 5-gram(=5문자) 겹침 비율 — KB 본문 안에 cited_text의 n-gram이 얼마나 있는지 */
function ngramOverlap(citedText: string, kbText: string, n = 5): number {
  if (citedText.length < n) return 0;
  // 공백/구두점 정리
  const norm = (s: string) => s.replace(/\s+/g, "").replace(/[.,!?·"'`\-—()[\]]/g, "");
  const cited = norm(citedText);
  const kb = norm(kbText);
  if (cited.length < n) return 0;
  let hits = 0;
  let total = 0;
  for (let i = 0; i + n <= cited.length; i++) {
    total++;
    if (kb.includes(cited.slice(i, i + n))) hits++;
  }
  return total === 0 ? 0 : hits / total;
}

async function main() {
  console.log("▶ KB recall/precision 측정\n");
  const kbRaw = await readFile(resolve(REPO_ROOT, "app/ui/data/idus_kb.json"), "utf-8");
  const kb: KbItem[] = JSON.parse(kbRaw);
  const kbById = new Map(kb.map((k) => [k.id, k]));

  interface Row {
    id: string;
    label: string;
    input: string;
    expected_faq_ids: number[];
    cited_faq_id: number | null;
    cited_text: string | null;
    overlap: number; // 0~1, cited_text가 cited_faq_id 본문과 겹친 5-gram 비율
    precision: 0 | 1; // overlap >= 0.6 → 1
    recall: number; // expected ∩ {cited_faq_id} / expected
  }

  const rows: Row[] = [];

  for (const s of SCENARIOS) {
    process.stdout.write(`[${s.id}] ${s.label}: ${s.input}\n  prod 호출... `);
    const text = await callProd(s.input);
    const sources = parseSources(text);
    const cited_faq_id = sources?.faq_id ?? null;
    const cited_text = sources?.cited_text ?? extractInlineQuotes(text) ?? null;
    const kbBody = cited_faq_id !== null ? kbById.get(cited_faq_id)?.clean_md : null;
    const overlap = cited_text && kbBody ? ngramOverlap(cited_text, kbBody) : 0;
    const precision: 0 | 1 = overlap >= 0.6 ? 1 : 0;
    const recall =
      s.expected_faq_ids.length === 0
        ? 1
        : (cited_faq_id !== null && s.expected_faq_ids.includes(cited_faq_id) ? 1 : 0) /
          1; // 응답에 sources.faq_id 1개만 박힘 (한 번에 1개 인용 가정)
    console.log(
      `✓ faq_id=${cited_faq_id} overlap=${(overlap * 100).toFixed(0)}% precision=${precision} recall=${recall}`
    );
    rows.push({
      id: s.id,
      label: s.label,
      input: s.input,
      expected_faq_ids: s.expected_faq_ids,
      cited_faq_id,
      cited_text,
      overlap: Number(overlap.toFixed(3)),
      precision,
      recall,
    });
  }

  // 집계
  const precisionAvg = rows.reduce((a, r) => a + r.precision, 0) / rows.length;
  const recallAvg = rows.reduce((a, r) => a + r.recall, 0) / rows.length;
  const overlapAvg = rows.reduce((a, r) => a + r.overlap, 0) / rows.length;

  const summary = {
    date: new Date().toISOString(),
    n: rows.length,
    method: "5-gram char overlap (정규화 후) + sources.faq_id ↔ expected_faq_ids 교집합",
    precision: Number(precisionAvg.toFixed(2)),
    recall: Number(recallAvg.toFixed(2)),
    avg_overlap: Number(overlapAvg.toFixed(3)),
    rows,
  };

  const outPath = resolve(REPO_ROOT, "data/eval_kb.json");
  await mkdir(dirname(outPath), { recursive: true });
  await writeFile(outPath, JSON.stringify(summary, null, 2), "utf-8");

  console.log("\n═══════════════════════════════");
  console.log(`Precision: ${(precisionAvg * 100).toFixed(0)}% (cited_text가 KB 본문과 5-gram 60%+ 겹침)`);
  console.log(`Recall: ${(recallAvg * 100).toFixed(0)}% (expected_faq_ids 중 응답의 cited faq_id 매칭)`);
  console.log(`평균 5-gram overlap: ${(overlapAvg * 100).toFixed(1)}%`);
  console.log(`저장: ${outPath}`);
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(2);
});
