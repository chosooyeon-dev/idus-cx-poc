/**
 * Tool 식별자 (영문 snake_case) ↔ UI/Trace 한글 표시명 매핑.
 *
 * 단일 에이전트 구조에서 트레이스 패널은 "어떤 도구가 어떤 의도에 호출되는지"를
 * 한글로 보여주는 게 핵심 가시성. Python backend의 DISPLAY_NAMES와 같은 역할.
 */

export const TOOL_DISPLAY_NAMES: Record<string, string> = {
  lookup_user: "유저 조회",
  get_user_orders: "유저 주문 목록",
  lookup_order: "주문 조회",
  lookup_artist: "작가 정책 조회",
  refund_policy_engine: "환불 정책 룰엔진",
  recommend_gift: "선물 추천 검색",
  track_shipping: "배송 조회",
  escalate_to_human: "사람 이관",
};

export type Intent = "refund" | "recommend" | "shipping" | "escalation" | "shared";

export const TOOL_INTENT: Record<string, Intent> = {
  lookup_user: "shared",
  get_user_orders: "shared",
  lookup_order: "shared",
  lookup_artist: "shared",
  refund_policy_engine: "refund",
  recommend_gift: "recommend",
  track_shipping: "shipping",
  escalate_to_human: "escalation",
};

export const INTENT_DISPLAY_NAMES: Record<Intent, string> = {
  refund: "환불 안내",
  recommend: "선물 추천",
  shipping: "배송 조회",
  escalation: "사람 이관",
  shared: "공통",
};

export function displayToolName(toolName: string): string {
  return TOOL_DISPLAY_NAMES[toolName] ?? toolName;
}

export function displayIntent(toolName: string): string {
  const intent: Intent = TOOL_INTENT[toolName] ?? "shared";
  return INTENT_DISPLAY_NAMES[intent];
}
