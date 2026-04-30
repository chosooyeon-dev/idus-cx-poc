/**
 * Vercel AI SDK tool 정의 — 단일 에이전트가 의도별로 호출.
 *
 * Phase 2 Python 백엔드에서 검증된 룰엔진을 직역(refund_policy.ts).
 * 묶음 C에서 recommend_gift를 자연어 의미 매칭형으로 강화 (occasion_context · gift_recipient).
 */
import { tool } from "ai";
import { z } from "zod";
import artistsData from "@/data/artists.json";
import productsData from "@/data/products.json";
import usersData from "@/data/users.json";
import { KB_CATEGORY_MAP, getFaq, getFaqTitle, getFaqsByCategory } from "./kb";
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
    "유저가 주문 ID를 명시하지 않고 '환불해주세요'·'배송 어디까지'·'주문한 컵'처럼 모호하게 말하면 먼저 호출.",
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
// Recommendation — 의미 매칭형 (1차 가격·카테고리 필터 → LLM이 description 보고 의미 ranking)
// ---------------------------------------------------------------------------

const OCCASION_KEYWORDS = [
  "환갑",
  "칠순",
  "고희",
  "팔순",
  "생신",
  "집들이",
  "결혼",
  "베이비",
  "출산",
  "돌",
];

export const recommend_gift = tool({
  description:
    "예산·카테고리·자연어 상황(occasion_context)·받는 사람(gift_recipient)을 받아 후보 8개를 반환합니다. " +
    "LLM이 후보의 description을 읽고 의미 매칭으로 상위 3개를 직접 ranking·선택해 응답에 사용합니다. " +
    "결과 candidates가 비어있으면 budget_max를 1.5배로 완화하거나 category를 빼고 재호출하세요.",
  inputSchema: z.object({
    budget_min: z.number().int().default(0),
    budget_max: z.number().int().default(10_000_000),
    category: z.string().nullable().default(null).describe("도자기/캔들/액세서리/비누/그릇/가죽/뜨개/우드/패브릭/일러스트 중 하나, 없으면 null"),
    occasion_context: z.string().nullable().default(null).describe("자연어 상황 설명. 예: '엄마 환갑 선물', '60세 생신', '부모님 70세 기념', '친구 출산 선물'"),
    gift_recipient: z.string().nullable().default(null).describe("자연어 받는 사람 정보. 예: '엄마', '60대 어머니', '친한 친구', '신혼부부'"),
  }),
  execute: async ({ budget_min, budget_max, category, occasion_context, gift_recipient }) => {
    let candidates = productsData.filter(
      (p) => p.price >= budget_min && p.price <= budget_max
    );
    if (category) candidates = candidates.filter((p) => p.category === category);

    // occasion_context에서 명시 키워드 추출 → tag 매칭 우선 정렬
    const matchedKeyword = occasion_context
      ? OCCASION_KEYWORDS.find((k) => occasion_context.includes(k))
      : null;

    candidates.sort((a, b) => {
      const aMatch = matchedKeyword && a.tags?.includes(matchedKeyword) ? 1 : 0;
      const bMatch = matchedKeyword && b.tags?.includes(matchedKeyword) ? 1 : 0;
      if (aMatch !== bMatch) return bMatch - aMatch;
      if (a.rating !== b.rating) return b.rating - a.rating;
      return b.reviews - a.reviews;
    });

    const top = candidates.slice(0, 5);
    const artistsMap = Object.fromEntries(artistsData.map((a) => [a.id, a]));

    return {
      query: { budget_min, budget_max, category, occasion_context, gift_recipient },
      matched_occasion_tag: matchedKeyword,
      candidates: top.map((p) => ({
        id: p.id,
        name: p.name,
        category: p.category,
        price: p.price,
        rating: p.rating,
        reviews: p.reviews,
        tags: p.tags,
        description: p.description,
        image_url: (p as { image_url?: string }).image_url,
        artist_name: artistsMap[p.artist_id]?.name,
        artist_lead_time_days: artistsMap[p.artist_id]?.avg_lead_time_days,
      })),
      hint:
        candidates.length === 0
          ? "후보가 없습니다. budget_max를 1.5배로 완화하거나 category를 빼고 다시 호출하세요."
          : `${top.length}개 후보 description을 의미 매칭해 상위 3개를 즉시 응답에 포함하세요. 다른 도구 호출 없이 바로 사용자에게 최종 응답을 작성합니다.`,
    };
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

// 이슈 타입별 담당 부서·평균 대기시간 매핑 (시연용 합성)
const ESCALATION_ROUTING: Record<string, { department: string; avg_wait_min: number }> = {
  defect: { department: "작품 검수팀", avg_wait_min: 7 },        // 작품 하자
  artist_unresponsive: { department: "작가 관리팀", avg_wait_min: 10 },  // 작가 무응답
  legal: { department: "분쟁 해결팀", avg_wait_min: 15 },          // 법적 위협
  emotion: { department: "VIP 케어팀", avg_wait_min: 5 },          // 감정 격앙
  human_review: { department: "CS 매니저팀", avg_wait_min: 8 },    // 룰엔진 human_review
  general: { department: "CS 일반팀", avg_wait_min: 5 },
};

export const escalate_to_human = tool({
  description:
    "**[필수 호출 — Discovery 후]** 사람 이관 의도가 보이면 먼저 collected_info의 모든 필드를 채울 수 있도록 " +
    "사용자에게 1~3개의 추가 질문을 해서 정보를 수집한 뒤 이 도구를 호출하세요. " +
    "정보 수집 없이 즉시 호출 금지. 단, 사용자가 이미 충분한 정보를 한 번에 준 경우는 바로 호출 가능. " +
    "절대 ticket_id, department, avg_wait_min을 LLM 지식으로 만들지 말고, 이 도구의 결과 값을 그대로 응답에 사용하세요. " +
    "issue_type 분류: 'defect'(작품 하자) / 'artist_unresponsive'(작가 무응답) / 'legal'(법적 위협) / " +
    "'emotion'(감정 격앙) / 'human_review'(룰엔진 결과) / 'general'.",
  inputSchema: z.object({
    issue_type: z
      .enum(["defect", "artist_unresponsive", "legal", "emotion", "human_review", "general"])
      .describe("이슈 카테고리 — 부서 라우팅과 대기시간 결정"),
    reason: z.string().describe("이관 사유 한 줄 요약"),
    conv_summary: z.string().describe("매니저가 컨텍스트를 빠르게 잡을 수 있는 1-3문장 요약 (지금까지 대화에서 추출)"),
    collected_info: z
      .object({
        order_ref: z.string().nullable().default(null).describe("관련 주문 ID (예: '1234')"),
        days_since_received: z
          .number()
          .nullable()
          .default(null)
          .describe("작품 받은 후 일수 (작품 하자/배송 문의 시)"),
        when_happened: z
          .string()
          .nullable()
          .default(null)
          .describe("문제 발생 시점 — '받자마자' / '사용 중' / '배송 중' / '불명' 중 하나"),
        photos_described: z
          .string()
          .nullable()
          .default(null)
          .describe("사용자가 묘사한 사진/실물 상태 (작품 하자 시)"),
        urgency: z.enum(["low", "normal", "high"]).default("normal"),
        contact_pref: z
          .string()
          .nullable()
          .default(null)
          .describe("선호 연락 수단 — '앱 메시지' / '전화' / '이메일'"),
      })
      .describe("Discovery dialog로 수집된 구조화 정보"),
  }),
  execute: async ({ issue_type, reason, conv_summary, collected_info }) => {
    // ticket_id 자동 발급: timestamp 기반 hash 6자리
    const ts = Date.now();
    const hash = (
      ts.toString(36) + Math.random().toString(36).slice(2, 6)
    ).toUpperCase().slice(-6);
    const ticketId = `TKT-${hash}`;

    const routing = ESCALATION_ROUTING[issue_type] ?? ESCALATION_ROUTING.general;

    return {
      ticket_id: ticketId,
      department: routing.department,
      avg_wait_min: routing.avg_wait_min,
      issue_type,
      received_info: collected_info,
      reason,
      summary: conv_summary,
      created_at: new Date(ts).toISOString(),
    };
  },
});

// ---------------------------------------------------------------------------
// Real idus FAQ KB lookup
// ---------------------------------------------------------------------------

export const lookup_faq = tool({
  description:
    "**[필수 호출 — 정책·운영 안내 시]** 진짜 아이디어스 FAQ 본문에서 인용할 답변을 가져옵니다. " +
    "환불·교환·취소·배송·작가 메시지·분쟁·선물하기·쿠폰·회원등급 등 운영 정책 질문은 LLM 지식으로 답하지 말고 이 도구를 호출해 진짜 본문을 받은 뒤, " +
    "응답에 본문을 그대로 인용하고 출처(예: '아이디어스 FAQ #39 자주 묻는 질문 - 취소/반품/교환')를 표기하세요. " +
    "category로 검색하거나 faq_id로 직접 조회 가능. " +
    "사용 가능 category: refund / shipping / artist_message / defect_dispute / gift / coupon / membership / review.",
  inputSchema: z.object({
    category: z
      .enum([
        "refund",
        "shipping",
        "artist_message",
        "defect_dispute",
        "gift",
        "coupon",
        "membership",
        "review",
      ])
      .nullable()
      .default(null)
      .describe("의도 카테고리 (예: 환불 의도 → refund)"),
    faq_id: z
      .number()
      .int()
      .nullable()
      .default(null)
      .describe("특정 FAQ ID 직접 조회 (예: 39, 41, 47)"),
  }),
  execute: async ({ category, faq_id }) => {
    if (faq_id !== null && faq_id !== undefined) {
      const item = getFaq(faq_id);
      if (!item) return { error: `FAQ #${faq_id}을(를) 찾을 수 없습니다.` };
      return {
        results: [
          {
            faq_id: item.id,
            title: getFaqTitle(item),
            source: `아이디어스 FAQ #${item.id} ${getFaqTitle(item)}`,
            body_md: item.clean_md,
          },
        ],
      };
    }
    if (category) {
      const items = getFaqsByCategory(category);
      if (items.length === 0) return { error: `카테고리 ${category}에 해당하는 FAQ가 없습니다.` };
      return {
        category,
        results: items.map((it) => ({
          faq_id: it.id,
          title: getFaqTitle(it),
          source: `아이디어스 FAQ #${it.id} ${getFaqTitle(it)}`,
          body_md: it.clean_md,
        })),
      };
    }
    return { error: "category 또는 faq_id 중 하나는 반드시 지정." };
  },
});

export const allTools = {
  lookup_user,
  get_user_orders,
  lookup_order,
  lookup_artist,
  lookup_faq,
  refund_policy_engine,
  recommend_gift,
  track_shipping,
  escalate_to_human,
};

export const DEFAULT_USER_ID = "u01";
