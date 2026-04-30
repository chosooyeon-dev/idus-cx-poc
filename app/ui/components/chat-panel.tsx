"use client";

import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport, type UIMessage } from "ai";
import { Send } from "lucide-react";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ScrollArea } from "@/components/ui/scroll-area";
import usersData from "@/data/users.json";
import { DEFAULT_USER_ID } from "@/lib/tools";

const STARTER_PROMPTS = [
  { label: "환불 문의", prompt: "환불해주세요." },
  { label: "환갑 선물 추천", prompt: "엄마 환갑 선물로 30만원대 도자기 추천해주세요." },
  { label: "배송 문의", prompt: "주문한 거 언제 와요?" },
  { label: "강한 불만 (이관)", prompt: "여러 번 문의했는데 답이 없어서 정말 화가 나요. 환불 안 해주면 신고할 거예요." },
];

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
    <div className="flex flex-col h-full flex-1 bg-white shadow-sm border border-gray-200 rounded-xl">
      <div className="bg-blue-600 text-white h-12 px-4 flex items-center rounded-t-xl">
        <h2 className="font-semibold text-sm sm:text-base lg:text-lg">고객 화면</h2>
        <span className="ml-auto text-xs font-light opacity-90">
          안녕하세요, <span className="font-medium">{userLabel}</span>
        </span>
      </div>

      <ScrollArea className="flex-1 p-4">
        {messages.length === 0 && (
          <div className="flex flex-col items-center justify-center h-full text-center py-12">
            <p className="text-gray-700 font-medium mb-1">
              {currentUser ? `${currentUser.nickname}님, 어떤 도움이 필요하세요? 🎨` : "안녕하세요, 아이디어스 CS입니다 🎨"}
            </p>
            <p className="text-sm text-gray-500 mb-6">환불 · 추천 · 배송 · 직접 상담을 도와드릴게요.</p>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 w-full max-w-md">
              {STARTER_PROMPTS.map((s) => (
                <button
                  key={s.label}
                  onClick={() => submit(s.prompt)}
                  className="text-left px-3 py-2 rounded-lg border border-gray-200 hover:bg-gray-50 text-sm"
                >
                  <div className="font-medium">{s.label}</div>
                  <div className="text-xs text-gray-500 truncate">{s.prompt}</div>
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
            <div className="text-xs text-gray-400 italic">에이전트가 도구를 호출하는 중…</div>
          )}
        </div>
      </ScrollArea>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit(input);
        }}
        className="border-t p-3 flex gap-2"
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder="환불 · 추천 · 배송 — 자연스럽게 입력하세요"
          disabled={isStreaming}
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
  const toolParts = message.parts.filter((p) => p.type.startsWith("tool-"));

  return (
    <div className={`flex ${isUser ? "justify-end" : "justify-start"}`}>
      <div
        className={`rounded-2xl px-4 py-2 max-w-[85%] text-sm leading-relaxed ${
          isUser ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-900"
        }`}
      >
        {!isUser && toolParts.length > 0 && (
          <div className="mb-2 text-xs text-gray-500 italic">
            🔧 {toolParts.length}개 도구 호출 (우측 트레이스 패널 참조)
          </div>
        )}
        {isUser ? (
          <div className="whitespace-pre-wrap">{text}</div>
        ) : (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown>{text}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  );
}
