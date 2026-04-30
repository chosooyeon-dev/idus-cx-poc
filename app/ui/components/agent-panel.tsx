"use client";

import type { UIMessage } from "ai";
import { Bot, CheckCircle2, Wrench } from "lucide-react";
import { useMemo } from "react";

import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  type Intent,
  TOOL_DISPLAY_NAMES,
  TOOL_INTENT,
  INTENT_DISPLAY_NAMES,
  displayIntent,
  displayToolName,
} from "@/lib/display";
import type { SourcesBlock, TraceEvent } from "@/lib/types";

interface Props {
  messages: UIMessage[];
}

export function AgentPanel({ messages }: Props) {
  const events = useMemo(() => deriveEvents(messages), [messages]);
  const sources = useMemo(() => extractLatestSources(messages), [messages]);

  return (
    <div className="h-full min-w-0 flex flex-col border border-gray-200 bg-white rounded-xl shadow-sm overflow-hidden">
      <div className="bg-blue-600 text-white h-12 px-4 flex items-center gap-3 rounded-t-xl shrink-0">
        <Bot className="h-5 w-5" />
        <h1 className="font-semibold text-sm sm:text-base lg:text-lg">에이전트 트레이스</h1>
        <span className="ml-auto text-xs font-light opacity-80 truncate">아이디어스 CS · 단일 에이전트</span>
      </div>

      <ScrollArea className="flex-1 min-h-0 p-4 bg-gray-50/50">
        <div className="space-y-4 min-w-0">
          <ToolsCard />
          <TraceTimeline events={events} />
          <SourcesCard sources={sources} />
        </div>
      </ScrollArea>
    </div>
  );
}

const INTENT_ORDER: Intent[] = ["refund", "recommend", "shipping", "escalation", "shared"];

function ToolsCard() {
  const grouped: Record<Intent, string[]> = {
    refund: [],
    recommend: [],
    shipping: [],
    escalation: [],
    shared: [],
  };
  for (const [name, intent] of Object.entries(TOOL_INTENT)) {
    const key = (intent as Intent) ?? "shared";
    grouped[key].push(name);
  }
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base flex items-center gap-2">
          <Wrench className="h-4 w-4" /> 사용 가능 도구
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {INTENT_ORDER.map((intent) =>
          grouped[intent].length > 0 ? (
            <div key={intent}>
              <div className="text-xs text-gray-500 mb-1">{INTENT_DISPLAY_NAMES[intent]}</div>
              <div className="flex flex-wrap gap-1">
                {grouped[intent].map((name) => (
                  <Badge key={name} variant="secondary" className="font-mono text-xs">
                    {TOOL_DISPLAY_NAMES[name]}
                    <span className="ml-1 opacity-50">({name})</span>
                  </Badge>
                ))}
              </div>
            </div>
          ) : null
        )}
      </CardContent>
    </Card>
  );
}

function TraceTimeline({ events }: { events: TraceEvent[] }) {
  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="text-base">도구 호출 트레이스</CardTitle>
      </CardHeader>
      <CardContent>
        {events.length === 0 ? (
          <p className="text-sm text-gray-400 italic">아직 호출 없음</p>
        ) : (
          <ol className="space-y-2 text-sm">
            {events.map((e) => (
              <TraceItem key={e.id} event={e} />
            ))}
          </ol>
        )}
      </CardContent>
    </Card>
  );
}

function TraceItem({ event }: { event: TraceEvent }) {
  if (event.type === "tool_call") {
    return (
      <li className="flex items-start gap-2">
        <span className="text-blue-600 mt-0.5">→</span>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium">{displayToolName(event.toolName ?? "")}</span>
            <Badge variant="outline" className="text-xs">{displayIntent(event.toolName ?? "")}</Badge>
            <span className="font-mono text-xs text-gray-400">{event.toolName}</span>
          </div>
          {event.args ? (
            <pre className="mt-1 bg-gray-100 rounded px-2 py-1 text-xs overflow-x-auto whitespace-pre-wrap break-all">
              {JSON.stringify(event.args, null, 2)}
            </pre>
          ) : null}
        </div>
      </li>
    );
  }
  if (event.type === "tool_output") {
    return (
      <li className="flex items-start gap-2">
        <CheckCircle2 className="h-4 w-4 text-green-600 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-xs text-gray-500">결과 ({displayToolName(event.toolName ?? "")})</div>
          <pre className="mt-1 bg-green-50 rounded px-2 py-1 text-xs overflow-x-auto whitespace-pre-wrap break-all">
            {JSON.stringify(event.result, null, 2)}
          </pre>
        </div>
      </li>
    );
  }
  return null;
}

function SourcesCard({ sources }: { sources: SourcesBlock | null }) {
  if (!sources) return null;
  const isRefund = sources.decision !== undefined;
  return (
    <Card className="border-blue-200">
      <CardHeader className="pb-2">
        <CardTitle className="text-base">최근 응답 sources</CardTitle>
      </CardHeader>
      <CardContent>
        <Badge variant="secondary" className="mb-2">
          {isRefund ? "환불 판정" : "추천 결과"}
        </Badge>
        <pre className="bg-gray-100 rounded px-2 py-1 text-xs overflow-x-auto whitespace-pre-wrap break-all">
          {JSON.stringify(sources, null, 2)}
        </pre>
      </CardContent>
    </Card>
  );
}

// -- helpers ---------------------------------------------------------------

function deriveEvents(messages: UIMessage[]): TraceEvent[] {
  const events: TraceEvent[] = [];
  for (const m of messages) {
    if (m.role !== "assistant") continue;
    let idx = 0;
    for (const part of m.parts) {
      if (part.type.startsWith("tool-")) {
        const toolName = part.type.slice("tool-".length);
        const p = part as unknown as {
          state?: string;
          input?: unknown;
          output?: unknown;
          toolCallId?: string;
        };
        const baseId = p.toolCallId ?? `${m.id}-${idx++}`;
        if (p.input !== undefined) {
          events.push({
            id: `${baseId}-in`,
            type: "tool_call",
            toolName,
            intent: TOOL_INTENT[toolName],
            args: p.input,
            timestamp: Date.now(),
          });
        }
        if (p.state === "output-available" && p.output !== undefined) {
          events.push({
            id: `${baseId}-out`,
            type: "tool_output",
            toolName,
            intent: TOOL_INTENT[toolName],
            result: p.output,
            timestamp: Date.now(),
          });
        }
      }
    }
  }
  return events;
}

function extractLatestSources(messages: UIMessage[]): SourcesBlock | null {
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    if (m.role !== "assistant") continue;
    const text = m.parts
      .filter((p) => p.type === "text")
      .map((p) => (p as { type: "text"; text: string }).text)
      .join("");
    const match = text.match(/```json\s*([\s\S]*?)\s*```/);
    if (!match) continue;
    try {
      const parsed = JSON.parse(match[1]);
      if (parsed && typeof parsed === "object" && parsed.sources) {
        return parsed.sources as SourcesBlock;
      }
    } catch {
      // skip malformed
    }
  }
  return null;
}
