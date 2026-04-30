"use client";

import { Calendar, Package } from "lucide-react";

import { Badge } from "@/components/ui/badge";

export interface OrderCardData {
  order_id: string;
  item_name: string;
  price: number;
  artist_name?: string;
  stage: string;
  ordered_at: string;
  image_url?: string;
}

const STAGE_LABELS: Record<string, { label: string; tone: "blue" | "amber" | "green" | "gray" }> = {
  pre_production: { label: "주문 접수", tone: "gray" },
  in_production: { label: "제작 중", tone: "blue" },
  pre_shipment: { label: "발송 준비", tone: "amber" },
  delivered: { label: "수령 완료", tone: "green" },
};

const TONE_CLASS: Record<string, string> = {
  blue: "bg-blue-100 text-blue-700",
  amber: "bg-amber-100 text-amber-700",
  green: "bg-green-100 text-green-700",
  gray: "bg-gray-100 text-gray-700",
};

interface Props {
  order: OrderCardData;
  onSelect?: (order: OrderCardData) => void;
}

export function OrderCard({ order, onSelect }: Props) {
  const stageInfo = STAGE_LABELS[order.stage] ?? { label: order.stage, tone: "gray" as const };

  return (
    <button
      onClick={() => onSelect?.(order)}
      className="text-left rounded-xl overflow-hidden border border-border bg-white shadow-sm hover:shadow-md hover:border-primary transition-all w-full min-w-0"
    >
      <div className="flex gap-3 p-3">
        {order.image_url && (
          <div className="w-20 h-20 shrink-0 rounded-lg overflow-hidden bg-secondary">
            <img src={order.image_url} alt={order.item_name} className="w-full h-full object-cover" loading="lazy" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <div className="flex items-start justify-between gap-2">
            <div className="font-medium text-sm text-foreground line-clamp-1">{order.item_name}</div>
            <Badge className={`shrink-0 text-[10px] ${TONE_CLASS[stageInfo.tone]}`}>{stageInfo.label}</Badge>
          </div>
          <div className="text-primary font-bold text-sm mt-0.5">{order.price.toLocaleString()}원</div>
          {order.artist_name && (
            <div className="text-xs text-muted-foreground mt-0.5">{order.artist_name} 작가님</div>
          )}
          <div className="flex items-center gap-3 mt-1 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-0.5">
              <Calendar className="h-3 w-3" />
              {order.ordered_at}
            </span>
            <span className="flex items-center gap-0.5 font-mono">
              <Package className="h-3 w-3" />
              #{order.order_id}
            </span>
          </div>
        </div>
      </div>
    </button>
  );
}
