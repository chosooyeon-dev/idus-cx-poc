"use client";

import type { UIMessage } from "ai";
import { useState } from "react";

import { AgentPanel } from "@/components/agent-panel";
import { ChatPanel } from "@/components/chat-panel";

export default function Home() {
  const [messages, setMessages] = useState<UIMessage[]>([]);

  return (
    <main className="flex h-screen gap-2 bg-gray-100 p-2">
      <AgentPanel messages={messages} />
      <ChatPanel onMessages={setMessages} />
    </main>
  );
}
