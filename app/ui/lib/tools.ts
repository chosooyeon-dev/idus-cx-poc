/**
 * Vercel AI SDK tool 정의 — 단일 에이전트가 의도별로 호출.
 *
 * Phase 2 Python 백엔드의 lookup_order / lookup_artist / refund_policy_engine / recommend_gift를 직역.
 * 룰엔진은 lib/refund_policy.ts (단위 테스트 17 통과).
 */
import { tool } from "ai";
import { z } from "zod";
import artistsData from "@/data/artists.json";
import productsData from "@/data/products.json";
import { adjudicateRefund, type OrderStage, type PolicyType } from "./refund_policy";

interface SampleOrder {
  order_id: string;
  artist_id: string;
  stage: OrderStage;
  items: { product_id: string; name: string; price: number }[];
  used: boolean;
  days_since_delivery: number | null;
}

const SAMPLE_ORDERS: Record<string, SampleOrder> = {
  "1001": { order_id: "1001", artist_id: "a01", stage: "in_production",
    items: [{ product_id: "p001", name: "우유빛 도자 머그", price: 28000 }], used: false, days_since_delivery: null },
  "1002": { order_id: "1002", artist_id: "a03", stage: "pre_shipment",
    items: [{ product_id: "p014", name: "시그니처 향초 - 우드", price: 32000 }], used: false, days_since_delivery: null },
  "1003": { order_id: "1003", artist_id: "a02", stage: "delivered",
    items: [{ product_id: "p009", name: "미니멀 가죽 카드지갑", price: 45000 }], used: false, days_since_delivery: 4 },
  "1004": { order_id: "1004", artist_id: "a06", stage: "delivered",
    items: [{ product_id: "p029", name: "14k 미니 펜던트 목걸이", price: 168000 }], used: false, days_since_delivery: 1 },
  "1005": { order_id: "1005", artist_id: "a04", stage: "in_production",
    items: [{ product_id: "p022", name: "손뜨개 블랭킷(베이비)", price: 145000 }], used: false, days_since_delivery: null },
  "1006": { order_id: "1006", artist_id: "a09", stage: "pre_production",
    items: [{ product_id: "p042", name: "인물 초상 일러스트(A4 액자)", price: 280000 }], used: false, days_since_delivery: null },
  "1007": { order_id: "1007", artist_id: "a07", stage: "delivered",
    items: [{ product_id: "p034", name: "천연비누 5종 세트", price: 32000 }], used: true, days_since_delivery: 5 },
  "1008": { order_id: "1008", artist_id: "a10", stage: "pre_shipment",
    items: [{ product_id: "p049", name: "청자 다완", price: 285000 }], used: false, days_since_delivery: null },
  "1234": { order_id: "1234", artist_id: "a01", stage: "in_production",
    items: [{ product_id: "p003", name: "손빚은 백자 화병", price: 320000 }], used: false, days_since_delivery: null },
};

// 동일 주문 환불 문의 카운터 (메모리 in-process; 시연용. 운영은 Redis/DB).
const inquiryCounters = new Map<string, number>();

export const lookup_order = tool({
  description: "주문 ID로 주문 상세를 조회합니다. 환불 의도가 보이면 가장 먼저 호출하여 작가 ID와 진행 단계를 확인하세요.",
  inputSchema: z.object({
    order_id: z.string().describe("주문 ID (예: '1234')"),
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
    artist_id: z.string().describe("작가 ID (예: 'a01')"),
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
    used: z.boolean().default(false).describe("delivered 단계에서 사용 흔적 여부"),
    days_since_delivery: z.number().int().nullable().default(null).describe("delivered 단계에서 수령 후 일수"),
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

export const recommend_gift = tool({
  description:
    "예산·카테고리·상황에 맞춰 핸드메이드 상품 상위 3개를 추천합니다. " +
    "occasion 태그 예: '환갑', '집들이', '결혼', '베이비', '생신'. " +
    "결과가 비면 category 또는 occasion을 한 단계 완화해 재호출하세요.",
  inputSchema: z.object({
    budget_min: z.number().int().default(0),
    budget_max: z.number().int().default(10_000_000),
    category: z.string().nullable().default(null).describe("예: '도자기', '캔들', '액세서리'. 미지정 시 전체."),
    occasion: z.string().nullable().default(null).describe("예: '환갑', '집들이'. 미지정 시 전체."),
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

export const allTools = {
  lookup_order,
  lookup_artist,
  refund_policy_engine,
  recommend_gift,
};
