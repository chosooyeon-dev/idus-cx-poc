/**
 * UI 트레이스/메시지 타입.
 *
 * 단일 에이전트 + 도구 호출 모델: messages에서 tool-* parts를 추출해 TraceEvent로 변환.
 */

export interface TraceEvent {
  id: string;
  type: "tool_call" | "tool_output" | "user" | "assistant";
  toolName?: string; // 영문 식별자 (lookup_order 등)
  intent?: "refund" | "recommend" | "shared"; // display.ts 매핑
  args?: unknown;
  result?: unknown;
  text?: string;
  timestamp: number;
}

export interface SourcesBlock {
  // refund 응답
  order_id?: string;
  artist_id?: string;
  cited_policy?: string;
  decision?: "full" | "partial" | "none" | "human_review";
  refund_percent?: number;
  inquiry_count?: number;
  next_steps?: string[];
  // recommend 응답
  product_ids?: string[];
  filter?: {
    budget_min?: number;
    budget_max?: number;
    category?: string | null;
    occasion?: string | null;
  };
}
