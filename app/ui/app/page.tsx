"use client";

import type { UIMessage } from "ai";
import dynamic from "next/dynamic";
import { useState } from "react";

import { AgentPanel } from "@/components/agent-panel";

// useChat 훅이 SSR prerender 단계에서 깨지는 케이스 회피 — 클라이언트 전용 로딩.
const ChatPanel = dynamic(
  () => import("@/components/chat-panel").then((m) => m.ChatPanel),
  { ssr: false }
);

export default function Home() {
  const [messages, setMessages] = useState<UIMessage[]>([]);

  return (
    <main className="flex h-screen gap-2 bg-gray-100 p-2">
      <AgentPanel messages={messages} />
      <ChatPanel onMessages={setMessages} />
    </main>
  );
}
