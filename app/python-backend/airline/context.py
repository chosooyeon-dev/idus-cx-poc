from __future__ import annotations as _annotations

from chatkit.agents import AgentContext
from pydantic import BaseModel, Field


class AirlineAgentContext(BaseModel):
    """이커머스(아이디어스) CX 에이전트의 mutable 상태.

    클래스 이름은 베이스 레포 호환을 위해 유지. 의미는 핸드메이드 마켓플레이스 컨텍스트.
    """

    customer_id: str | None = None
    order_id: str | None = None
    artist_id: str | None = None
    last_intent: str | None = None  # "refund" | "recommend" | None
    last_recommended_product_ids: list[str] = Field(default_factory=list)
    # 사용자 노하우 #3: 동일 주문 환불 문의 카운터 → 임계 초과 시 사람 라우팅
    refund_inquiry_count_by_order: dict[str, int] = Field(default_factory=dict)


class AirlineAgentChatContext(AgentContext[dict]):
    """ChatKit run 동안 사용되는 wrapper. mutable 상태는 `state`에 보관."""

    state: AirlineAgentContext


def create_initial_context() -> AirlineAgentContext:
    return AirlineAgentContext()


def public_context(ctx: AirlineAgentContext) -> dict:
    """UI/Trace 패널에 노출하는 필드. 내부 카운터·휘발 정보는 그대로 노출(시연 가시성)."""
    return ctx.model_dump()
