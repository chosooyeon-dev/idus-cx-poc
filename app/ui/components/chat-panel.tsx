"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Send } from "lucide-react";
import { useEffect, useState, type ComponentProps } from "react";
import ReactMarkdown from "react-markdown";

import { ProductCard, type ProductCardData } from "@/components/product-card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import artistsData from "@/data/artists.json";
import productsData from "@/data/products.json";
import usersData from "@/data/users.json";
import { DEFAULT_USER_ID } from "@/lib/tools";

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

export function ChatPanel({ onMessages }: Props) {
  const [input, setInput] = useState("");
  const { messages, sendMessage, status } = useChat({
    transport: new DefaultChatTransport({ api: "/api/chat" }),
  });

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

  return (
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
          placeholder="환불 · 추천 · 배송 — 자연스럽게 입력하세요"
          disabled={isStreaming}
          className="bg-background"
        />
        <Button type="submit" disabled={isStreaming || !input.trim()} size="icon" aria-label="전송">
          <Send className="h-4 w-4" />
        </Button>
      </form>
    </div>
  );
}

function MessageBubble({ message }: { message: UIMessage }) {
  const isUser = message.role === "user";
  const text = message.parts
    .filter((p) => p.type === "text")
    .map((p) => (p as { type: "text"; text: string }).text)
    .join("");
  const toolPartCount = message.parts.filter((p) => p.type.startsWith("tool-")).length;

  // 응답 sources에서 product_ids 추출 → ProductCard 3개 렌더
  let productIds: string[] = [];
  if (!isUser) {
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (match) {
      try {
        const parsed = JSON.parse(match[1]);
        const ids = parsed?.sources?.product_ids;
        if (Array.isArray(ids)) productIds = ids.filter((x): x is string => typeof x === "string");
      } catch {
        // ignore parse error
      }
    }
  }

  const cards = productIds
    .map((id) => lookupCardData(id))
    .filter((c): c is ProductCardData => c !== null);

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

      {/* 추천 카드 — sources.product_ids 있으면 자동 렌더 */}
      {!isUser && cards.length > 0 && (
        <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3 w-full max-w-3xl">
          {cards.map((c) => (
            <ProductCard key={c.id} product={c} />
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
