/**
 * Tool 식별자 (영문 snake_case) ↔ UI/Trace 한글 표시명 매핑.
 *
 * 단일 에이전트 구조에서 트레이스 패널은 "어떤 도구가 어떤 의도에 호출되는지"를
 * 한글로 보여주는 게 핵심 가시성. Python backend의 DISPLAY_NAMES와 같은 역할.
 */

export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  lookup_order: "주문 조회",
  lookup_artist: "작가 정책 조회",
  refund_policy_engine: "환불 정책 룰엔진",
  recommend_gift: "선물 추천 검색",
};

export const TOOL_INTENT: Record<string, "refund" | "recommend" | "shared"> = {
  lookup_order: "shared", // 환불·추천 양쪽에서 사용 가능
  lookup_artist: "shared",
  refund_policy_engine: "refund",
  recommend_gift: "recommend",
};

export const INTENT_DISPLAY_NAMES: Record<string, string> = {
  refund: "환불 안내",
  recommend: "선물 추천",
  shared: "공통",
};

export function displayToolName(toolName: string): string {
  return TOOL_DISPLAY_NAMES[toolName] ?? toolName;
}

export function displayIntent(toolName: string): string {
  const intent = TOOL_INTENT[toolName] ?? "shared";
  return INTENT_DISPLAY_NAMES[intent];
}
