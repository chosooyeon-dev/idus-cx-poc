"use client";

import type { UIMessage } from "ai";
import dynamic from "next/dynamic";
import { useState } from "react";

import { AgentPanel } from "@/components/agent-panel";

// useChat 훅이 SSR prerender 단계에서 깨지는 케이스 회피 — 클라이언트 전용.
const ChatPanel = dynamic(
  () => import("@/components/chat-panel").then((m) => m.ChatPanel),
  { ssr: false }
);

export default function Home() {
  const [messages, setMessages] = useState<UIMessage[]>([]);

  return (
    <main
      className={[
        "h-screen bg-gray-100 p-2 gap-2",
        // 모바일: 트레이스 위·챗 아래 stack
        "grid grid-cols-1 grid-rows-[minmax(0,1fr)_minmax(0,1fr)]",
        // 데스크탑: 트레이스 7 / 챗 3 비율 강제 (minmax로 폭 누수 차단)
        "md:grid-cols-[minmax(0,7fr)_minmax(0,3fr)] md:grid-rows-1",
      ].join(" ")}
    >
      <AgentPanel messages={messages} />
      <ChatPanel onMessages={setMessages} />
    </main>
  );
}
