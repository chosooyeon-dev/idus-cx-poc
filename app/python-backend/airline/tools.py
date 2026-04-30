"""이커머스 CS 도구 — 룰엔진 호출, 카탈로그/주문 조회, 추천."""
from __future__ import annotations as _annotations

import json
from pathlib import Path
from typing import Any

from agents import RunContextWrapper, function_tool

from .context import AirlineAgentChatContext
from .refund_policy import OrderStage, PolicyType, adjudicate_refund

DATA_DIR = Path(__file__).resolve().parent.parent / "data"


def _load_artists() -> list[dict[str, Any]]:
    return json.loads((DATA_DIR / "artists.json").read_text(encoding="utf-8"))


def _load_products() -> list[dict[str, Any]]:
    return json.loads((DATA_DIR / "products.json").read_text(encoding="utf-8"))


# 시연용 합성 주문 데이터. 실 운영에서는 ERP/주문 DB를 호출하면 됨.
_SAMPLE_ORDERS: dict[str, dict[str, Any]] = {
    "1001": {"order_id": "1001", "artist_id": "a01", "stage": "in_production",
             "items": [{"product_id": "p001", "name": "우유빛 도자 머그", "price": 28000}],
             "used": False, "days_since_delivery": None},
    "1002": {"order_id": "1002", "artist_id": "a03", "stage": "pre_shipment",
             "items": [{"product_id": "p014", "name": "시그니처 향초 - 우드", "price": 32000}],
             "used": False, "days_since_delivery": None},
    "1003": {"order_id": "1003", "artist_id": "a02", "stage": "delivered",
             "items": [{"product_id": "p009", "name": "미니멀 가죽 카드지갑", "price": 45000}],
             "used": False, "days_since_delivery": 4},
    "1004": {"order_id": "1004", "artist_id": "a06", "stage": "delivered",
             "items": [{"product_id": "p029", "name": "14k 미니 펜던트 목걸이", "price": 168000}],
             "used": False, "days_since_delivery": 1},
    "1005": {"order_id": "1005", "artist_id": "a04", "stage": "in_production",
             "items": [{"product_id": "p022", "name": "손뜨개 블랭킷(베이비)", "price": 145000}],
             "used": False, "days_since_delivery": None},
    "1006": {"order_id": "1006", "artist_id": "a09", "stage": "pre_production",
             "items": [{"product_id": "p042", "name": "인물 초상 일러스트(A4 액자)", "price": 280000}],
             "used": False, "days_since_delivery": None},
    "1007": {"order_id": "1007", "artist_id": "a07", "stage": "delivered",
             "items": [{"product_id": "p034", "name": "천연비누 5종 세트", "price": 32000}],
             "used": True, "days_since_delivery": 5},
    "1008": {"order_id": "1008", "artist_id": "a10", "stage": "pre_shipment",
             "items": [{"product_id": "p049", "name": "청자 다완", "price": 285000}],
             "used": False, "days_since_delivery": None},
    "1234": {"order_id": "1234", "artist_id": "a01", "stage": "in_production",
             "items": [{"product_id": "p003", "name": "손빚은 백자 화병", "price": 320000}],
             "used": False, "days_since_delivery": None},
}


@function_tool(
    name_override="lookup_order",
    description_override="주문 ID로 주문 상세를 조회합니다 (작가 ID, 진행 단계, 상품 등).",
)
async def lookup_order(
    context: RunContextWrapper[AirlineAgentChatContext],
    order_id: str,
) -> dict[str, Any]:
    order = _SAMPLE_ORDERS.get(order_id.strip())
    if order is None:
        return {"error": f"주문 #{order_id}을(를) 찾을 수 없습니다."}
    # context에 order/artist 기록 (UI Trace 가시성)
    state = context.context.state
    state.order_id = order["order_id"]
    state.artist_id = order["artist_id"]
    return order


@function_tool(
    name_override="lookup_artist",
    description_override="작가 ID로 작가 정보(환불 정책 본문, 정책 유형, 평균 리드타임)를 조회합니다.",
)
async def lookup_artist(artist_id: str) -> dict[str, Any]:
    for a in _load_artists():
        if a["id"] == artist_id:
            return a
    return {"error": f"작가 {artist_id}을(를) 찾을 수 없습니다."}


@function_tool(
    name_override="refund_policy_engine",
    description_override=(
        "환불 가능 여부를 작가별 정책에 따라 룰엔진으로 판정합니다. "
        "LLM은 이 도구의 결과를 그대로 사용해야 하며, 정책을 자체 해석하면 안 됩니다."
    ),
)
async def refund_policy_engine(
    context: RunContextWrapper[AirlineAgentChatContext],
    order_id: str,
    artist_id: str,
    order_stage: str,
    used: bool = False,
    days_since_delivery: int | None = None,
) -> dict[str, Any]:
    state = context.context.state

    # 동일 주문 환불 문의 카운터 (사용자 노하우 #3)
    state.refund_inquiry_count_by_order[order_id] = (
        state.refund_inquiry_count_by_order.get(order_id, 0) + 1
    )
    inquiry_count = state.refund_inquiry_count_by_order[order_id]

    artist = next((a for a in _load_artists() if a["id"] == artist_id), None)
    if artist is None:
        return {"error": f"작가 {artist_id}을(를) 찾을 수 없습니다."}

    if order_stage not in ("pre_production", "in_production", "pre_shipment", "delivered"):
        return {"error": f"알 수 없는 주문 단계: {order_stage}"}

    verdict = adjudicate_refund(
        artist_policy_type=artist["policy_type"],  # type: ignore[arg-type]
        artist_policy_text=artist["policy_text"],
        order_stage=order_stage,  # type: ignore[arg-type]
        artist_id=artist_id,
        order_id=order_id,
        used=used,
        days_since_delivery=days_since_delivery,
        inquiry_count=inquiry_count,
    )
    state.last_intent = "refund"
    return dict(verdict)


@function_tool(
    name_override="recommend_gift",
    description_override=(
        "예산·카테고리·상황에 맞춰 핸드메이드 상품 상위 3개를 추천합니다. "
        "occasion에는 '환갑', '집들이', '결혼', '베이비', '생신' 등 태그가 들어갑니다."
    ),
)
async def recommend_gift(
    context: RunContextWrapper[AirlineAgentChatContext],
    budget_min: int = 0,
    budget_max: int = 10_000_000,
    category: str | None = None,
    occasion: str | None = None,
) -> list[dict[str, Any]]:
    products = _load_products()
    artists = {a["id"]: a for a in _load_artists()}

    candidates = []
    for p in products:
        if p["price"] < budget_min or p["price"] > budget_max:
            continue
        if category and p["category"] != category:
            continue
        if occasion and occasion not in p.get("tags", []):
            continue
        candidates.append(p)

    # 평점 우선, 동점 시 리뷰 수
    candidates.sort(key=lambda p: (p["rating"], p["reviews"]), reverse=True)

    top: list[dict[str, Any]] = []
    for p in candidates[:3]:
        artist = artists.get(p["artist_id"], {})
        top.append({
            **p,
            "artist_name": artist.get("name"),
            "artist_lead_time_days": artist.get("avg_lead_time_days"),
            "artist_policy_type": artist.get("policy_type"),
        })

    state = context.context.state
    state.last_intent = "recommend"
    state.last_recommended_product_ids = [p["id"] for p in top]
    return top
