/**
 * Vercel AI SDK tool 정의 — 단일 에이전트가 의도별로 호출.
 *
 * Phase 2 Python 백엔드에서 검증된 룰엔진을 직역(refund_policy.ts).
 * 보강 1차에서 user 컨텍스트 도구 4개 추가.
 */
import { tool } from "ai";
import { z } from "zod";
import artistsData from "@/data/artists.json";
import productsData from "@/data/products.json";
import usersData from "@/data/users.json";
import { adjudicateRefund, type OrderStage, type PolicyType } from "./refund_policy";

interface SampleOrder {
  order_id: string;
  user_id: string;
  artist_id: string;
  stage: OrderStage;
  items: { product_id: string; name: string; price: number }[];
  used: boolean;
  days_since_delivery: number | null;
  ordered_at: string;
}

const SAMPLE_ORDERS: Record<string, SampleOrder> = {
  "1001": { order_id: "1001", user_id: "u01", artist_id: "a01", stage: "in_production",
    items: [{ product_id: "p001", name: "우유빛 도자 머그", price: 28000 }], used: false, days_since_delivery: null, ordered_at: "2026-04-22" },
  "1002": { order_id: "1002", user_id: "u01", artist_id: "a03", stage: "pre_shipment",
    items: [{ product_id: "p014", name: "시그니처 향초 - 우드", price: 32000 }], used: false, days_since_delivery: null, ordered_at: "2026-04-25" },
  "1003": { order_id: "1003", user_id: "u02", artist_id: "a02", stage: "delivered",
    items: [{ product_id: "p009", name: "미니멀 가죽 카드지갑", price: 45000 }], used: false, days_since_delivery: 4, ordered_at: "2026-04-15" },
  "1004": { order_id: "1004", user_id: "u03", artist_id: "a06", stage: "delivered",
    items: [{ product_id: "p029", name: "14k 미니 펜던트 목걸이", price: 168000 }], used: false, days_since_delivery: 1, ordered_at: "2026-04-22" },
  "1005": { order_id: "1005", user_id: "u04", artist_id: "a04", stage: "in_production",
    items: [{ product_id: "p022", name: "손뜨개 블랭킷(베이비)", price: 145000 }], used: false, days_since_delivery: null, ordered_at: "2026-04-18" },
  "1006": { order_id: "1006", user_id: "u05", artist_id: "a09", stage: "pre_production",
    items: [{ product_id: "p042", name: "인물 초상 일러스트(A4 액자)", price: 280000 }], used: false, days_since_delivery: null, ordered_at: "2026-04-29" },
  "1007": { order_id: "1007", user_id: "u06", artist_id: "a07", stage: "delivered",
    items: [{ product_id: "p034", name: "천연비누 5종 세트", price: 32000 }], used: true, days_since_delivery: 5, ordered_at: "2026-04-20" },
  "1008": { order_id: "1008", user_id: "u07", artist_id: "a10", stage: "pre_shipment",
    items: [{ product_id: "p049", name: "청자 다완", price: 285000 }], used: false, days_since_delivery: null, ordered_at: "2026-04-16" },
  "1010": { order_id: "1010", user_id: "u02", artist_id: "a03", stage: "in_production",
    items: [{ product_id: "p015", name: "시그니처 향초 - 시트러스", price: 32000 }], used: false, days_since_delivery: null, ordered_at: "2026-04-26" },
  "1011": { order_id: "1011", user_id: "u08", artist_id: "a06", stage: "pre_shipment",
    items: [{ product_id: "p030", name: "자수 귀걸이", price: 22000 }], used: false, days_since_delivery: null, ordered_at: "2026-04-21" },
  "1012": { order_id: "1012", user_id: "u09", artist_id: "a02", stage: "delivered",
    items: [{ product_id: "p011", name: "가죽 여권케이스", price: 78000 }], used: false, days_since_delivery: 7, ordered_at: "2026-04-13" },
  "1013": { order_id: "1013", user_id: "u10", artist_id: "a01", stage: "in_production",
    items: [{ product_id: "p005", name: "청화 도자 종지(3p)", price: 42000 }], used: false, days_since_delivery: null, ordered_at: "2026-04-19" },
  "1014": { order_id: "1014", user_id: "u05", artist_id: "a09", stage: "in_production",
    items: [{ product_id: "p046", name: "캘리그라피 한 줄(A4)", price: 95000 }], used: false, days_since_delivery: null, ordered_at: "2026-04-10" },
  "1234": { order_id: "1234", user_id: "u01", artist_id: "a01", stage: "in_production",
    items: [{ product_id: "p003", name: "손빚은 백자 화병", price: 320000 }], used: false, days_since_delivery: null, ordered_at: "2026-04-17" },
};

const IN_PROGRESS_STAGES: OrderStage[] = ["pre_production", "in_production", "pre_shipment"];

// 동일 주문 환불 문의 카운터 (메모리 in-process; 시연용. 운영은 Redis/Upstash로).
const inquiryCounters = new Map<string, number>();

// ---------------------------------------------------------------------------
// User-context tools
// ---------------------------------------------------------------------------

export const lookup_user = tool({
  description:
    "로그인 유저의 정보(닉네임·등급·가입일·최근 주문 5건)를 조회합니다. " +
    "환불·배송 등 주문 관련 의도가 보이고 컨텍스트에 user_id가 있으면 가장 먼저 호출하세요.",
  inputSchema: z.object({
    user_id: z.string(),
  }),
  execute: async ({ user_id }) => {
    const user = usersData.find((u) => u.id === user_id);
    if (!user) return { error: `유저 ${user_id}을(를) 찾을 수 없습니다.` };
    const recentOrders = user.order_ids
      .map((oid) => SAMPLE_ORDERS[oid])
      .filter((o): o is SampleOrder => Boolean(o))
      .sort((a, b) => b.ordered_at.localeCompare(a.ordered_at))
      .slice(0, 5)
      .map((o) => ({
        order_id: o.order_id,
        item_name: o.items[0]?.name,
        stage: o.stage,
        artist_id: o.artist_id,
        ordered_at: o.ordered_at,
      }));
    return {
      id: user.id,
      nickname: user.nickname,
      grade: user.grade,
      joined: user.joined,
      total_orders: user.order_ids.length,
      recent_orders: recentOrders,
    };
  },
});

export const get_user_orders = tool({
  description:
    "유저의 주문을 status_filter로 필터링해 리스트로 반환합니다. " +
    "status_filter: 'in_progress'(진행 중) | 'delivered'(완료) | 'all'(전체). " +
    "유저가 주문 ID를 명시하지 않고 '환불해주세요'·'배송 어디까지'처럼 모호하게 말하면 먼저 호출.",
  inputSchema: z.object({
    user_id: z.string(),
    status_filter: z.enum(["in_progress", "delivered", "all"]).default("in_progress"),
  }),
  execute: async ({ user_id, status_filter }) => {
    const user = usersData.find((u) => u.id === user_id);
    if (!user) return { error: `유저 ${user_id}을(를) 찾을 수 없습니다.` };
    const orders = user.order_ids
      .map((oid) => SAMPLE_ORDERS[oid])
      .filter((o): o is SampleOrder => Boolean(o))
      .filter((o) => {
        if (status_filter === "all") return true;
        if (status_filter === "delivered") return o.stage === "delivered";
        return IN_PROGRESS_STAGES.includes(o.stage);
      })
      .sort((a, b) => b.ordered_at.localeCompare(a.ordered_at));
    return orders.map((o) => ({
      order_id: o.order_id,
      item_name: o.items[0]?.name,
      price: o.items[0]?.price,
      stage: o.stage,
      artist_id: o.artist_id,
      ordered_at: o.ordered_at,
    }));
  },
});

// ---------------------------------------------------------------------------
// Order / refund tools
// ---------------------------------------------------------------------------

export const lookup_order = tool({
  description:
    "주문 ID로 주문 상세를 조회합니다. user_id·진행 단계·사용 여부·수령일 모두 포함. " +
    "환불·배송 의도 + 주문 ID 특정 후 호출.",
  inputSchema: z.object({
    order_id: z.string(),
  }),
  execute: async ({ order_id }) => {
    const order = SAMPLE_ORDERS[order_id.trim()];
    if (!order) return { error: `주문 #${order_id}을(를) 찾을 수 없습니다.` };
    return order;
  },
});

export const lookup_artist = tool({
  description: "작가 ID로 정책 본문·정책 유형·평균 리드타임을 조회합니다. 정책 본문을 응답에 인용해야 할 때만 호출.",
  inputSchema: z.object({
    artist_id: z.string(),
  }),
  execute: async ({ artist_id }) => {
    const artist = artistsData.find((a) => a.id === artist_id);
    if (!artist) return { error: `작가 ${artist_id}을(를) 찾을 수 없습니다.` };
    return artist;
  },
});

export const refund_policy_engine = tool({
  description:
    "환불 가능 여부를 작가별 정책에 따라 룰엔진으로 판정합니다. " +
    "이 도구의 결과만 사용하고, LLM이 정책을 자체 해석/단정하면 안 됩니다. " +
    "lookup_order로 단계를 확인한 후 호출하세요.",
  inputSchema: z.object({
    order_id: z.string(),
    artist_id: z.string(),
    order_stage: z.enum(["pre_production", "in_production", "pre_shipment", "delivered"]),
    used: z.boolean().default(false),
    days_since_delivery: z.number().int().nullable().default(null),
  }),
  execute: async ({ order_id, artist_id, order_stage, used, days_since_delivery }) => {
    const next = (inquiryCounters.get(order_id) ?? 0) + 1;
    inquiryCounters.set(order_id, next);

    const artist = artistsData.find((a) => a.id === artist_id);
    if (!artist) return { error: `작가 ${artist_id}을(를) 찾을 수 없습니다.` };

    return adjudicateRefund({
      artist_policy_type: artist.policy_type as PolicyType,
      artist_policy_text: artist.policy_text,
      order_stage,
      artist_id,
      order_id,
      used,
      days_since_delivery,
      inquiry_count: next,
    });
  },
});

// ---------------------------------------------------------------------------
// Recommendation
// ---------------------------------------------------------------------------

export const recommend_gift = tool({
  description:
    "예산·카테고리·상황에 맞춰 핸드메이드 상품 상위 3개를 추천합니다. " +
    "occasion 태그 예: '환갑', '집들이', '결혼', '베이비', '생신'. " +
    "결과가 비면 category 또는 occasion을 한 단계 완화해 재호출.",
  inputSchema: z.object({
    budget_min: z.number().int().default(0),
    budget_max: z.number().int().default(10_000_000),
    category: z.string().nullable().default(null),
    occasion: z.string().nullable().default(null),
  }),
  execute: async ({ budget_min, budget_max, category, occasion }) => {
    let candidates = productsData.filter(
      (p) => p.price >= budget_min && p.price <= budget_max
    );
    if (category) candidates = candidates.filter((p) => p.category === category);
    if (occasion) candidates = candidates.filter((p) => (p.tags ?? []).includes(occasion));

    candidates.sort((a, b) => (b.rating - a.rating) || (b.reviews - a.reviews));
    const top = candidates.slice(0, 3);

    const artistsMap = Object.fromEntries(artistsData.map((a) => [a.id, a]));
    return top.map((p) => ({
      ...p,
      artist_name: artistsMap[p.artist_id]?.name,
      artist_lead_time_days: artistsMap[p.artist_id]?.avg_lead_time_days,
      artist_policy_type: artistsMap[p.artist_id]?.policy_type,
    }));
  },
});

// ---------------------------------------------------------------------------
// Shipping & escalation
// ---------------------------------------------------------------------------

export const track_shipping = tool({
  description:
    "주문의 배송 단계와 예상 도착일을 조회합니다. 진행 단계별 메시지와 평균 작가 리드타임 기반 ETA 반환.",
  inputSchema: z.object({
    order_id: z.string(),
  }),
  execute: async ({ order_id }) => {
    const order = SAMPLE_ORDERS[order_id.trim()];
    if (!order) return { error: `주문 #${order_id}을(를) 찾을 수 없습니다.` };
    const artist = artistsData.find((a) => a.id === order.artist_id);
    const leadTime = artist?.avg_lead_time_days ?? 7;

    const ordered = new Date(order.ordered_at);
    const eta = new Date(ordered.getTime() + leadTime * 86_400_000);
    const etaStr = eta.toISOString().slice(0, 10);

    const stageMessages: Record<OrderStage, string> = {
      pre_production: `주문 접수 완료. 작가가 작업을 시작하기 전 단계입니다.`,
      in_production: `작가가 작업 중입니다. 평균 리드타임 ${leadTime}일.`,
      pre_shipment: `작품 완성. 발송 준비 중입니다.`,
      delivered: `수령 완료 (${order.days_since_delivery ?? 0}일 전).`,
    };

    return {
      order_id: order.order_id,
      stage: order.stage,
      stage_message: stageMessages[order.stage],
      ordered_at: order.ordered_at,
      avg_lead_time_days: leadTime,
      estimated_delivery: order.stage === "delivered" ? null : etaStr,
      artist_id: order.artist_id,
    };
  },
});

export const escalate_to_human = tool({
  description:
    "명시적으로 CS 매니저에게 이관합니다. 다음 상황에서 호출하세요: " +
    "(a) 작가 무응답 5영업일 이상, (b) VIP 등급 + 강한 불만, (c) 법적·신고·고소·환불 안 해주면 류 위협, " +
    "(d) 강한 감정 표현(화·울·정말·진짜 X) 반복, (e) 같은 주문 환불 문의 3회 이상. " +
    "응답에 ticket_id와 평균 대기 시간을 포함합니다.",
  inputSchema: z.object({
    reason: z.string().describe("이관 사유 (위 5개 카테고리 중 하나 + 짧은 한국어 설명)"),
    conv_summary: z.string().describe("매니저가 컨텍스트를 빠르게 잡을 수 있는 1-2문장 요약"),
  }),
  execute: async ({ reason, conv_summary }) => {
    const ticketId = `TKT-${Date.now().toString(36).toUpperCase().slice(-6)}`;
    const avgWaitMin = 5;
    return {
      ticket_id: ticketId,
      avg_wait_min: avgWaitMin,
      message: `담당자에게 연결해드렸어요. 평균 대기 ${avgWaitMin}분.`,
      reason,
      summary: conv_summary,
      created_at: new Date().toISOString(),
    };
  },
});

export const allTools = {
  lookup_user,
  get_user_orders,
  lookup_order,
  lookup_artist,
  refund_policy_engine,
  recommend_gift,
  track_shipping,
  escalate_to_human,
};

// 시연용: 챗 시작 시 자동 주입할 default 로그인 유저
export const DEFAULT_USER_ID = "u01";
