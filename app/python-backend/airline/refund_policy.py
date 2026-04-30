"""Refund policy rule engine — single source of truth for adjudication.

핵심 원칙 (사용자 운영 노하우 #1): LLM은 정책을 판정하지 않습니다.
이 모듈의 `adjudicate_refund` 함수가 결정하고, LLM은 결과를 한국어 응답으로 포맷할 뿐입니다.

Returned verdict는 그대로 응답 `sources` 필드에 박혀 검증 가능성을 보장합니다 (노하우 #2).
"""
from __future__ import annotations

from typing import Literal, Optional, TypedDict

PolicyType = Literal[
    "full_refund",
    "no_refund_after_start",
    "case_by_case",
    "partial_only",
]

# pre_production: 제작 착수 전 (주문 후 24h 내, 시안 확정 전)
# in_production: 제작 중
# pre_shipment: 제작 완료, 발송 전
# delivered: 고객 수령 후
OrderStage = Literal["pre_production", "in_production", "pre_shipment", "delivered"]

Decision = Literal["full", "partial", "none", "human_review"]

ESCALATION_THRESHOLD = 3  # 동일 주문 N회 환불 문의 → 사람 라우팅


class RefundVerdict(TypedDict):
    decision: Decision
    refund_percent: int  # 0, 50, 100
    reason: str
    cited_policy: str
    artist_id: str
    order_id: str
    inquiry_count: int
    next_steps: list[str]


def adjudicate_refund(
    *,
    artist_policy_type: PolicyType,
    artist_policy_text: str,
    order_stage: OrderStage,
    artist_id: str,
    order_id: str,
    used: bool = False,
    days_since_delivery: Optional[int] = None,
    inquiry_count: int = 1,
) -> RefundVerdict:
    """Pure-function rule engine. Deterministic given inputs."""

    base = {
        "cited_policy": artist_policy_text,
        "artist_id": artist_id,
        "order_id": order_id,
        "inquiry_count": inquiry_count,
    }

    # Sentinel: 동일 주문 반복 문의 → CS 매니저 이관 (노하우 #3)
    if inquiry_count >= ESCALATION_THRESHOLD:
        return {
            **base,
            "decision": "human_review",
            "refund_percent": 0,
            "reason": (
                f"동일 주문에 대한 환불 문의가 {inquiry_count}회 반복되었습니다. "
                "정책 외 사항일 가능성이 높아 CS 매니저에게 이관합니다."
            ),
            "next_steps": ["CS 매니저가 1영업일 이내 직접 연락드립니다."],
        }

    # Case-by-case: 작가와 1:1 협의가 정책상 명시
    if artist_policy_type == "case_by_case":
        return {
            **base,
            "decision": "human_review",
            "refund_percent": 0,
            "reason": "맞춤 제작 비중이 높은 작가입니다. 작가와의 1:1 협의가 필요합니다.",
            "next_steps": ["작가에게 문의 메시지를 전달했습니다.", "1~2영업일 내 작가가 답변드립니다."],
        }

    # Full refund: 가장 관대한 정책
    if artist_policy_type == "full_refund":
        if order_stage in ("pre_production", "in_production", "pre_shipment"):
            return {
                **base,
                "decision": "full",
                "refund_percent": 100,
                "reason": "발송 전 단계로 작가 정책상 전액 환불 가능합니다.",
                "next_steps": ["3~5영업일 내 결제 수단으로 환불됩니다."],
            }
        # delivered
        if used:
            return {
                **base,
                "decision": "none",
                "refund_percent": 0,
                "reason": "사용 흔적이 있어 작가 정책상 환불이 제한됩니다.",
                "next_steps": ["하자 사진을 보내주시면 작가가 추가로 검토합니다."],
            }
        if days_since_delivery is not None and days_since_delivery <= 7:
            return {
                **base,
                "decision": "full",
                "refund_percent": 100,
                "reason": "수령 후 7일 이내 미사용 상태로 작가 정책상 전액 환불 가능합니다.",
                "next_steps": ["왕복 배송비는 고객 부담입니다.", "반송 후 검수 → 3영업일 내 환불."],
            }
        return {
            **base,
            "decision": "none",
            "refund_percent": 0,
            "reason": "수령 후 7일이 지나 작가 정책상 환불이 어렵습니다.",
            "next_steps": ["하자가 있는 경우 사진과 함께 다시 문의주세요."],
        }

    # No refund after start: 제작 착수 후 환불 불가
    if artist_policy_type == "no_refund_after_start":
        if order_stage == "pre_production":
            return {
                **base,
                "decision": "full",
                "refund_percent": 100,
                "reason": "제작 착수 전 단계로 작가 정책상 전액 환불 가능합니다.",
                "next_steps": ["3~5영업일 내 결제 수단으로 환불됩니다."],
            }
        return {
            **base,
            "decision": "none",
            "refund_percent": 0,
            "reason": (
                "이미 제작이 착수되어 작가 정책상 단순변심 환불이 불가합니다. "
                "핸드메이드 특성상 한번 시작된 작업은 되돌릴 수 없는 점 양해 부탁드립니다."
            ),
            "next_steps": ["작품에 하자가 있는 경우 사진과 함께 다시 문의주세요."],
        }

    # Partial only: 단계별 부분 환불
    if artist_policy_type == "partial_only":
        if order_stage == "pre_production":
            return {
                **base,
                "decision": "full",
                "refund_percent": 100,
                "reason": "제작 착수 전 단계로 작가 정책상 전액 환불 가능합니다.",
                "next_steps": ["3~5영업일 내 결제 수단으로 환불됩니다."],
            }
        if order_stage in ("in_production", "pre_shipment"):
            return {
                **base,
                "decision": "partial",
                "refund_percent": 50,
                "reason": "제작 진행 단계로 작가 정책상 50% 부분 환불 가능합니다.",
                "next_steps": ["작업 인건비·재료비를 제외한 50%가 3~5영업일 내 환불됩니다."],
            }
        # delivered
        if used:
            return {
                **base,
                "decision": "none",
                "refund_percent": 0,
                "reason": "사용 흔적이 있어 작가 정책상 환불이 제한됩니다.",
                "next_steps": ["하자가 있는 경우 사진과 함께 다시 문의주세요."],
            }
        return {
            **base,
            "decision": "none",
            "refund_percent": 0,
            "reason": "발송 후 단순변심은 작가 정책상 환불 불가, 하자에 한해 교환 가능합니다.",
            "next_steps": ["하자 사진을 보내주시면 교환을 진행합니다."],
        }

    # Defensive fallback
    return {
        **base,
        "decision": "human_review",
        "refund_percent": 0,
        "reason": "알 수 없는 정책 유형으로 CS 매니저에게 이관합니다.",
        "next_steps": ["CS 매니저가 1영업일 이내 직접 연락드립니다."],
    }
