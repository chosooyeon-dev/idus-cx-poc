"use client";

import { Star } from "lucide-react";
import { useState } from "react";

import { Button } from "@/components/ui/button";

export interface ProductCardData {
  id: string;
  name: string;
  category?: string;
  price: number;
  rating?: number;
  reviews?: number;
  artist_name?: string;
  artist_lead_time_days?: number;
  image_url?: string;
}

export function ProductCard({ product }: { product: ProductCardData }) {
  const [showToast, setShowToast] = useState(false);

  const onAddToCart = () => {
    setShowToast(true);
    setTimeout(() => setShowToast(false), 2200);
  };

  return (
    <div className="rounded-xl overflow-hidden border border-border bg-white shadow-sm hover:shadow-md hover:-translate-y-0.5 transition-all relative">
      <div className="aspect-[16/9] bg-secondary overflow-hidden">
        {product.image_url ? (
          <img
            src={product.image_url}
            alt={product.name}
            className="w-full h-full object-cover"
            loading="lazy"
          />
        ) : (
          <div className="w-full h-full flex items-center justify-center text-muted-foreground text-xs">
            (이미지 없음)
          </div>
        )}
      </div>
      <div className="p-3">
        <div className="font-medium line-clamp-1 text-foreground text-sm">{product.name}</div>
        <div className="flex items-center gap-2 mt-1">
          <span className="text-primary font-bold text-base">
            {product.price.toLocaleString()}원
          </span>
          {product.rating !== undefined && (
            <span className="flex items-center gap-0.5 text-xs text-muted-foreground">
              <Star className="h-3 w-3 fill-amber-400 text-amber-400" />
              {product.rating}
              {product.reviews !== undefined && (
                <span className="ml-0.5 opacity-70">({product.reviews})</span>
              )}
            </span>
          )}
        </div>
        {product.artist_name && (
          <div className="text-xs text-muted-foreground mt-1">{product.artist_name} 작가님</div>
        )}
        {product.artist_lead_time_days && (
          <div className="text-xs text-muted-foreground mt-0.5">
            📦 평균 {product.artist_lead_time_days}일 제작
          </div>
        )}
        <Button
          onClick={onAddToCart}
          size="sm"
          className="mt-2 w-full text-xs h-8"
        >
          장바구니 담기 (시연)
        </Button>
      </div>
      {showToast && (
        <div className="absolute inset-x-3 bottom-12 bg-foreground/90 text-background text-xs px-3 py-2 rounded-lg shadow-lg text-center">
          PoC 시연용 — 실제 결제 미지원
        </div>
      )}
    </div>
  );
}
