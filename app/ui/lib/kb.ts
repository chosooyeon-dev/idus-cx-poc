/**
 * 진짜 아이디어스 FAQ 본문 KB.
 *
 * 출처: idus.com/w/board/faq 19건 → Playwright + Tesseract OCR + Sonnet Vision 정정.
 * data/idus_real_kb_clean.json (15건 통합본) → app/ui/data/idus_kb.json.
 *
 * LLM이 정책·운영 안내를 답변할 때 lookup_faq 도구를 통해 진짜 본문을 가져와
 * 그대로 인용하고 출처를 명시하도록 강제. 추측·환각 차단.
 */
import kbData from "@/data/idus_kb.json";

export interface KbItem {
  id: number;
  clean_md: string;
}

const items = kbData as KbItem[];
const byId = new Map<number, KbItem>(items.map((it) => [it.id, it]));

// 카테고리 ↔ FAQ ID 매핑 (PoC 시나리오와 1:1).
// "core"는 항상 우선 검색 대상, "ext"는 보조.
export const KB_CATEGORY_MAP: Record<string, { core: number[]; ext?: number[] }> = {
  refund: { core: [39, 41], ext: [23] },                  // 취소/반품/교환 + 결제와 환불 + 분쟁해결
  shipping: { core: [42, 62] },                            // 주문/배송 조회 + 배송출발일
  artist_message: { core: [47] },                          // 작품 문의·상담 (작가 메시지 동선)
  defect_dispute: { core: [23] },                          // 분쟁 해결 기준
  gift: { core: [55] },                                    // 선물하기 가이드
  coupon: { core: [36] },                                  // 할인 쿠폰
  membership: { core: [61] },                              // 회원 등급
  review: { core: [38] },                                  // 구매 후기
};

export function getFaq(id: number): KbItem | null {
  return byId.get(id) ?? null;
}

export function getFaqsByCategory(category: string): KbItem[] {
  const map = KB_CATEGORY_MAP[category];
  if (!map) return [];
  const ids = [...map.core, ...(map.ext ?? [])];
  return ids.map((id) => byId.get(id)).filter((x): x is KbItem => x !== undefined);
}

/** clean_md 첫 줄(`# 제목`)을 추출 — 출처 표기용 */
export function getFaqTitle(item: KbItem): string {
  const firstLine = item.clean_md.split("\n")[0] ?? "";
  return firstLine.replace(/^#+\s*/, "").trim();
}

export function listAllFaqs(): KbItem[] {
  return items;
}
