"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { RotateCcw, Send, ThumbsDown, ThumbsUp } from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";

import { OrderCard, type OrderCardData } from "@/components/order-card";
import { ProductCard, type ProductCardData } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import artistsData from "@/data/artists.json";
import productsData from "@/data/products.json";
import usersData from "@/data/users.json";
import { DEFAULT_USER_ID } from "@/lib/tools";

// 주문 ID → OrderCardData 매핑 (chat-panel 안에서 sources.order_ids로 lookup)
const SAMPLE_ORDER_DATA: Record<string, OrderCardData> = {
  "1001": { order_id: "1001", item_name: "우유빛 도자 머그", price: 28000, artist_name: "정도연", stage: "in_production", ordered_at: "2026-04-22", image_url: "https://picsum.photos/seed/p001/800/450" },
  "1002": { order_id: "1002", item_name: "시그니처 향초 - 우드", price: 32000, artist_name: "윤하은", stage: "pre_shipment", ordered_at: "2026-04-25", image_url: "https://picsum.photos/seed/p014/800/450" },
  "1003": { order_id: "1003", item_name: "미니멀 가죽 카드지갑", price: 45000, artist_name: "한태경", stage: "delivered", ordered_at: "2026-04-15", image_url: "https://picsum.photos/seed/p009/800/450" },
  "1004": { order_id: "1004", item_name: "14k 미니 펜던트 목걸이", price: 168000, artist_name: "강민지", stage: "delivered", ordered_at: "2026-04-22", image_url: "https://picsum.photos/seed/p029/800/450" },
  "1005": { order_id: "1005", item_name: "손뜨개 블랭킷(베이비)", price: 145000, artist_name: "임수빈", stage: "in_production", ordered_at: "2026-04-18", image_url: "https://picsum.photos/seed/p022/800/450" },
  "1006": { order_id: "1006", item_name: "인물 초상 일러스트(A4)", price: 280000, artist_name: "권은채", stage: "pre_production", ordered_at: "2026-04-29", image_url: "https://picsum.photos/seed/p042/800/450" },
  "1007": { order_id: "1007", item_name: "천연비누 5종 세트", price: 32000, artist_name: "박세린", stage: "delivered", ordered_at: "2026-04-20", image_url: "https://picsum.photos/seed/p034/800/450" },
  "1008": { order_id: "1008", item_name: "청자 다완", price: 285000, artist_name: "서가람", stage: "pre_shipment", ordered_at: "2026-04-16", image_url: "https://picsum.photos/seed/p049/800/450" },
  "1234": { order_id: "1234", item_name: "손빚은 백자 화병", price: 320000, artist_name: "정도연", stage: "in_production", ordered_at: "2026-04-17", image_url: "https://picsum.photos/seed/p003/800/450" },
};

// idus 채널톡 매크로 분석 §4 starter prompt 재조정안 그대로
const STARTER_PROMPTS = [
  { label: "쿠폰", icon: "🎟️", prompt: "쿠폰 어떻게 써요?" },
  { label: "선물 보내기", icon: "🎁", prompt: "선물 보내고 싶어요." },
  { label: "작가 답 없음", icon: "👤", prompt: "작가가 답이 없어요." },
  { label: "환불", icon: "💸", prompt: "환불할 수 있어요?" },
  { label: "배송", icon: "📦", prompt: "주문한 거 언제 와요?" },
  { label: "선물 받기", icon: "💝", prompt: "선물 받았는데 어디서 봐요?" },
  { label: "작가 등록", icon: "🎨", prompt: "작가 등록하고 싶어요." },
  { label: "결제 오류", icon: "⚠️", prompt: "결제 잘못된 것 같아요." },
];

const productById = new Map(productsData.map((p) => [p.id, p]));
const artistById = new Map(artistsData.map((a) => [a.id, a]));

function lookupCardData(productId: string): ProductCardData | null {
  const p = productById.get(productId);
  if (!p) return null;
  const artist = artistById.get(p.artist_id);
  return {
    id: p.id,
    name: p.name,
    category: p.category,
    price: p.price,
    rating: p.rating,
    reviews: p.reviews,
    image_url: (p as { image_url?: string }).image_url,
    artist_name: artist?.name,
    artist_lead_time_days: artist?.avg_lead_time_days,
  };
}

interface Props {
  onMessages: (messages: UIMessage[]) => void;
}

// React Context로 sendMessage를 OrderCard까지 전달 (props drilling 회피)
import { createContext, useContext } from "react";
const SendMessageContext = createContext<((text: string) => void) | null>(null);

const STORAGE_KEY = "idus-cx-messages";
const TTL_MS = 5 * 60 * 1000; // 5분
const FEEDBACK_KEY = "idus-cx-feedback";

interface FeedbackEntry {
  messageId: string;
  rating: "up" | "down";
  timestamp: number;
}

function readFeedback(): FeedbackEntry[] {
  if (typeof window === "undefined") return [];
  try {
    return JSON.parse(localStorage.getItem(FEEDBACK_KEY) ?? "[]");
  } catch {
    return [];
  }
}

function FeedbackButtons({ messageId }: { messageId: string }) {
  const [rated, setRated] = useState<null | "up" | "down">(null);
  const [showToast, setShowToast] = useState(false);

  useEffect(() => {
    const existing = readFeedback().find((f) => f.messageId === messageId);
    if (existing) setRated(existing.rating);
  }, [messageId]);

  const handleRate = (rating: "up" | "down") => {
    if (rated) return;
    if (typeof window !== "undefined") {
      try {
        const arr = readFeedback();
        arr.push({ messageId, rating, timestamp: Date.now() });
        localStorage.setItem(FEEDBACK_KEY, JSON.stringify(arr));
        // 다른 컴포넌트(CSATCounter)에 알림
        window.dispatchEvent(new Event("idus-cx-feedback-update"));
      } catch {
        // quota exceeded
      }
    }
    setRated(rating);
    setShowToast(true);
    setTimeout(() => setShowToast(false), 1800);
  };

  return (
    <div className="flex items-center gap-2 mt-2 text-xs text-muted-foreground">
      <button
        onClick={() => handleRate("up")}
        disabled={rated !== null}
        aria-label="도움됐어요"
        className={`p-1 rounded transition-colors ${
          rated === "up"
            ? "text-primary"
            : "hover:text-foreground hover:bg-secondary disabled:opacity-50"
        }`}
      >
        <ThumbsUp className="h-3.5 w-3.5" />
      </button>
      <button
        onClick={() => handleRate("down")}
        disabled={rated !== null}
        aria-label="아쉬워요"
        className={`p-1 rounded transition-colors ${
          rated === "down"
            ? "text-destructive"
            : "hover:text-foreground hover:bg-secondary disabled:opacity-50"
        }`}
      >
        <ThumbsDown className="h-3.5 w-3.5" />
      </button>
      {showToast && <span className="text-[11px] italic">피드백 감사합니다</span>}
    </div>
  );
}

function CSATCounter() {
  const [stats, setStats] = useState({ up: 0, down: 0 });

  useEffect(() => {
    const update = () => {
      const arr = readFeedback();
      setStats({
        up: arr.filter((f) => f.rating === "up").length,
        down: arr.filter((f) => f.rating === "down").length,
      });
    };
    update();
    const handler = () => update();
    window.addEventListener("idus-cx-feedback-update", handler);
    window.addEventListener("storage", handler);
    return () => {
      window.removeEventListener("idus-cx-feedback-update", handler);
      window.removeEventListener("storage", handler);
    };
  }, []);

  const total = stats.up + stats.down;
  if (total === 0) return null;
  const csat = Math.round((stats.up / total) * 100);
  return (
    <span
      className="text-[11px] text-muted-foreground"
      title={`CSAT proxy = up / (up + down) = ${stats.up}/${total}`}
    >
      👍 {stats.up} · 👎 {stats.down} · CSAT {csat}%
    </span>
  );
}

export function ChatPanel({ onMessages }: Props) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, setMessages, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

  // 1. 첫 마운트 시 localStorage에서 5분 이내 대화 복원
  useEffect(() => {
    if (typeof window === "undefined") return;
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return;
      const { messages: saved, savedAt } = JSON.parse(raw) as {
        messages: UIMessage[];
        savedAt: number;
      };
      if (Date.now() - savedAt > TTL_MS) {
        localStorage.removeItem(STORAGE_KEY);
        return;
      }
      if (Array.isArray(saved) && saved.length > 0) {
        setMessages(saved);
      }
    } catch {
      // 파싱 실패 — 무시
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // 2. messages 변경 시 자동 저장 (timestamp 포함)
  useEffect(() => {
    if (typeof window === "undefined") return;
    if (messages.length === 0) return;
    try {
      localStorage.setItem(
        STORAGE_KEY,
        JSON.stringify({ messages, savedAt: Date.now() })
      );
    } catch {
      // quota exceeded — 무시
    }
  }, [messages]);

  useEffect(() => {
    onMessages(messages);
  }, [messages, onMessages]);

  const isStreaming = status === "streaming" || status === "submitted";
  const currentUser = usersData.find((u) => u.id === DEFAULT_USER_ID);
  const userLabel = currentUser ? `${currentUser.nickname}님 · ${currentUser.grade}` : "게스트";

  const submit = (text: string) => {
    if (!text.trim() || isStreaming) return;
    sendMessage({ text });
    setInput("");
  };

  const submitText = (text: string) => submit(text);

  // 3. 대화 초기화 — localStorage clear + messages 비움
  const resetConversation = () => {
    if (typeof window !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
    setMessages([]);
  };

  return (
    <SendMessageContext.Provider value={submitText}>
    <div className="flex flex-col h-full min-w-0 bg-white shadow-sm border border-border rounded-xl overflow-hidden">
      <header className="bg-white border-b border-border h-14 px-4 flex items-center rounded-t-xl shrink-0">
        <h2 className="font-semibold text-base flex items-center gap-2">
          <span className="text-primary text-lg tracking-tight">idus</span>
          <span className="text-muted-foreground text-xs font-normal">CS Agent · 시연</span>
        </h2>
        <span className="ml-auto flex items-center gap-2 text-sm">
          <span className="w-7 h-7 rounded-full bg-accent text-accent-foreground flex items-center justify-center text-xs font-medium">
            {currentUser?.nickname?.[0] ?? "G"}
          </span>
          <span className="font-medium text-foreground">{userLabel}</span>
          <CSATCounter />
          {messages.length > 0 && (
            <button
              onClick={resetConversation}
              title="대화 초기화"
              aria-label="대화 초기화"
              className="ml-1 p-1.5 rounded-md text-muted-foreground hover:text-foreground hover:bg-secondary transition-colors"
            >
              <RotateCcw className="h-4 w-4" />
            </button>
          )}
        </span>
      </header>

      <ScrollArea className="flex-1 min-h-0 p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-10">
            <p className="text-foreground font-medium mb-1 text-base">
              {currentUser ? `${currentUser.nickname}님, 어떤 도움이 필요하세요?` : "안녕하세요, 아이디어스 CS입니다"}
            </p>
            <p className="text-sm text-muted-foreground mb-6">환불 · 추천 · 배송 · 직접 상담을 도와드릴게요.</p>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 w-full max-w-2xl">
              {STARTER_PROMPTS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => submit(s.prompt)}
                  className="text-left p-3 rounded-lg border border-border bg-white hover:border-primary hover:shadow-sm transition-all text-sm min-w-0"
                >
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-base leading-none">{s.icon}</span>
                    <div className="font-medium text-foreground">{s.label}</div>
                  </div>
                  <div className="text-xs text-muted-foreground truncate">{s.prompt}</div>
                </button>
              ))}
            </div>
          </div>
        )}

        <div className="space-y-3">
          {messages.map((m) => (
            <MessageBubble key={m.id} message={m} />
          ))}
          {isStreaming && (
            <div className="text-xs text-muted-foreground italic">에이전트가 도구를 호출하는 중…</div>
          )}
        </div>
      </ScrollArea>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="border-t border-border p-3 flex gap-2 shrink-0 bg-white"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="무엇이든 물어보세요"
          disabled={isStreaming}
          className="bg-background"
        />
        <Button type="submit" disabled={isStreaming || !input.trim()} size="icon" aria-label="전송">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
    </SendMessageContext.Provider>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const text = message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");
  const toolPartCount = message.parts.filter((p) => p.type.startsWith("tool-")).length;

  // 응답 sources에서 product_ids / order_ids 추출
  let productIds: string[] = [];
  let orderIds: string[] = [];
  if (!isUser) {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        const pids = parsed?.sources?.product_ids;
        const oids = parsed?.sources?.order_ids;
        if (Array.isArray(pids)) productIds = pids.filter((x): x is string => typeof x === "string");
        if (Array.isArray(oids)) orderIds = oids.filter((x): x is string => typeof x === "string");
      } catch {
        // ignore parse error
      }
    }
  }

  const cards = productIds
    .map((id) => lookupCardData(id))
    .filter((c): c is ProductCardData => c !== null);

  const orderCards = orderIds
    .map((id) => SAMPLE_ORDER_DATA[id])
    .filter((c): c is OrderCardData => c !== undefined);

  const sendMessageFromCtx = useContext(SendMessageContext);

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"} ${isUser ? "" : "flex-col items-start"}`}>
      <div
        className={[
          "rounded-2xl px-4 py-2 max-w-[85%] text-sm leading-relaxed",
          "min-w-0 break-words [overflow-wrap:anywhere]",
          isUser
            ? "bg-[hsl(28_100%_91%)] text-foreground"
            : "bg-[hsl(0_0%_97%)] text-foreground",
        ].join(" ")}
      >
        {!isUser && toolPartCount > 0 && (
          <div className="mb-2 text-xs text-muted-foreground italic">
            🔧 {toolPartCount}개 도구 호출 (좌측 시연 콘솔 참조)
          </div>
        )}
        {isUser ? (
          <div className="whitespace-pre-wrap">{text}</div>
        ) : (
          <div className="prose prose-sm max-w-none break-words prose-headings:text-foreground prose-strong:text-foreground prose-p:text-foreground">
            <ReactMarkdown
              components={{
                pre: PreBlock,
                code: InlineCode,
                blockquote: ({ children, ...props }) => (
                  <blockquote
                    {...props}
                    className="border-l-4 border-primary pl-3 py-1 my-2 text-foreground bg-[hsl(28_100%_96%)] rounded-r"
                  >
                    {children}
                  </blockquote>
                ),
              }}
            >
              {text}
            </ReactMarkdown>
          </div>
        )}
      </div>

      {/* thumbs up/down — 에이전트 응답에만, 텍스트 있을 때만 */}
      {!isUser && text.trim().length > 20 && <FeedbackButtons messageId={message.id} />}

      {/* 추천 카드 — sources.product_ids */}
      {!isUser && cards.length > 0 && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-3xl">
          {cards.map((c) => (
            <ProductCard key={c.id} product={c} />
          ))}
        </div>
      )}

      {/* 주문 명확화 카드 — sources.order_ids */}
      {!isUser && orderCards.length > 0 && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-2xl">
          {orderCards.map((o) => (
            <OrderCard
              key={o.order_id}
              order={o}
              onSelect={(order) =>
                sendMessageFromCtx?.(`주문번호 ${order.order_id} (${order.item_name})로 진행해주세요.`)
              }
            />
          ))}
        </div>
      )}
    </div>
  );
}

function PreBlock(props: ComponentProps<"pre">) {
  const child = Array.isArray(props.children) ? props.children[0] : props.children;
  const codeChild = child as { props?: { className?: string; children?: unknown } } | undefined;
  const className = codeChild?.props?.className ?? "";
  const text = String(codeChild?.props?.children ?? "").trim();

  if (/language-json/.test(className)) {
    try {
      const parsed = JSON.parse(text);
      if (parsed && typeof parsed === "object" && "sources" in parsed) {
        return (
          <details className="my-2 not-prose text-xs text-muted-foreground">
            <summary className="cursor-pointer select-none px-2 py-1 rounded bg-secondary hover:bg-accent inline-block">
              📋 sources 보기 (JSON)
            </summary>
            <pre className="mt-1 bg-secondary rounded p-2 overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(parsed.sources, null, 2)}
            </pre>
          </details>
        );
      }
    } catch {
      // 파싱 실패: 일반 코드블록
    }
  }

  return (
    <pre {...props} className="overflow-x-auto bg-secondary rounded p-2 text-xs whitespace-pre-wrap break-all">
      {props.children}
    </pre>
  );
}

function InlineCode(props: ComponentProps<"code">) {
  return <code {...props} className="px-1 py-0.5 rounded bg-secondary text-xs break-all" />;
}
