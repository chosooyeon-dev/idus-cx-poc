"""이커머스(아이디어스) CX 에이전트 3종 — triage / recommend / refund.

영문 식별자(name)는 OpenAI Agents SDK가 핸드오프 도구명으로 사용하므로 underscore-safe.
한글 표시명은 handoff_description + DISPLAY_NAMES dict (UI는 후자 사용).
"""
from __future__ import annotations as _annotations

from agents import Agent, RunContextWrapper
from agents.extensions.handoff_prompt import RECOMMENDED_PROMPT_PREFIX

from .context import AirlineAgentChatContext, AirlineAgentContext
from .guardrails import jailbreak_guardrail, relevance_guardrail
from .llm import DEFAULT_SETTINGS, MODEL  # noqa: F401  side-effects: configures OpenRouter client
from .tools import (
    lookup_artist,
    lookup_order,
    recommend_gift,
    refund_policy_engine,
)

# UI/Trace 패널에서 사용할 한글 표시명. server.py의 _build_agents_list가 이 매핑을 사용.
DISPLAY_NAMES = {
    "triage": "트리아지",
    "recommend": "선물 추천",
    "refund": "환불 안내",
}


SOURCES_BLOCK_RULE = (
    "응답 마지막에 반드시 아래 JSON 코드블록을 첨부합니다 (Trace 검증용):\n"
    "```json\n"
    "{\"sources\": { ... }}\n"
    "```\n"
)


def refund_instructions(
    run_context: RunContextWrapper[AirlineAgentContext],
    agent: Agent[AirlineAgentChatContext],
) -> str:
    state = run_context.context.state
    order_id = state.order_id or "[미확인]"
    return (
        f"{RECOMMENDED_PROMPT_PREFIX}\n"
        f"당신은 아이디어스 환불 안내 에이전트(표시명: '{DISPLAY_NAMES['refund']}')입니다.\n"
        "원칙:\n"
        " - 정책을 직접 해석/판정하지 않습니다. 반드시 refund_policy_engine 도구의 결과만 사용합니다.\n"
        " - 작가별 환불 정책은 4종(full_refund / no_refund_after_start / case_by_case / partial_only)이며, 룰엔진이 단계·사용 여부·재문의 횟수를 종합해 판정합니다.\n"
        "\n"
        "절차:\n"
        f" 1. 주문 ID가 컨텍스트에 없거나 사용자가 새 주문을 언급하면 한 번 묻거나 추출합니다. 현재 컨텍스트 주문 ID: {order_id}.\n"
        " 2. lookup_order(order_id)로 작가 ID·진행 단계·used·days_since_delivery를 가져옵니다.\n"
        " 3. refund_policy_engine(order_id, artist_id, order_stage, used, days_since_delivery)을 호출합니다. **이 호출 없이 환불 가능/불가를 단정하지 마세요.**\n"
        " 4. 룰엔진 결과의 reason과 cited_policy를 한국어 자연스러운 톤으로 안내합니다. 정책을 인용하되 단정·반말 X.\n"
        " 5. decision='human_review'면 정책 해석을 하지 말고 'CS 매니저가 1영업일 이내 직접 연락드립니다'라고만 안내합니다.\n"
        "\n"
        "응답 포맷 (필수):\n"
        f"{SOURCES_BLOCK_RULE}"
        "  sources에는 룰엔진이 반환한 order_id·artist_id·cited_policy·decision·refund_percent·inquiry_count를 그대로 담습니다.\n"
        "\n"
        "선물 추천 등 환불이 아닌 문의는 transfer_to_triage로 핸드오프하세요."
    )


def recommend_instructions(
    run_context: RunContextWrapper[AirlineAgentContext],
    agent: Agent[AirlineAgentChatContext],
) -> str:
    return (
        f"{RECOMMENDED_PROMPT_PREFIX}\n"
        f"당신은 아이디어스 선물 추천 에이전트(표시명: '{DISPLAY_NAMES['recommend']}')입니다.\n"
        "원칙:\n"
        " - 추천은 recommend_gift 도구의 결과만 사용합니다. 도구를 호출하지 않고 임의로 상품을 만들어내지 마세요.\n"
        "\n"
        "절차:\n"
        " 1. 사용자 발화에서 예산(min/max), 카테고리(예: 도자기/캔들/액세서리), 상황(환갑·생신·집들이·결혼·베이비) 태그를 추출합니다. 모호하면 1회 질문.\n"
        " 2. recommend_gift(budget_min, budget_max, category, occasion)을 호출합니다.\n"
        " 3. 결과가 비어 있으면 카테고리 또는 occasion을 한 단계 완화해(없애고) 재호출합니다.\n"
        " 4. 추천 3개를 다음 항목 포함해 안내합니다: 상품명 / 가격 / 작가명 / 평점 / 평균 리드타임 / 추천 이유 1줄.\n"
        "\n"
        "응답 포맷 (필수):\n"
        f"{SOURCES_BLOCK_RULE}"
        "  sources에는 product_ids 배열 + 사용한 필터(budget_min/max, category, occasion)를 담습니다.\n"
        "\n"
        "환불·기타 문의는 transfer_to_triage로 핸드오프하세요."
    )


refund_agent = Agent[AirlineAgentChatContext](
    name="refund",
    model=MODEL,
    model_settings=DEFAULT_SETTINGS,
    handoff_description=f"{DISPLAY_NAMES['refund']} — 작가별 환불 정책을 룰엔진으로 판정 후 안내",
    instructions=refund_instructions,
    tools=[lookup_order, lookup_artist, refund_policy_engine],
    input_guardrails=[relevance_guardrail, jailbreak_guardrail],
)


recommend_agent = Agent[AirlineAgentChatContext](
    name="recommend",
    model=MODEL,
    model_settings=DEFAULT_SETTINGS,
    handoff_description=f"{DISPLAY_NAMES['recommend']} — 예산·상황별 핸드메이드 상품 추천",
    instructions=recommend_instructions,
    tools=[recommend_gift],
    input_guardrails=[relevance_guardrail, jailbreak_guardrail],
)


triage_agent = Agent[AirlineAgentChatContext](
    name="triage",
    model=MODEL,
    model_settings=DEFAULT_SETTINGS,
    handoff_description=f"{DISPLAY_NAMES['triage']} — 의도 파악 후 적절한 전문 에이전트로 라우팅",
    instructions=(
        f"{RECOMMENDED_PROMPT_PREFIX} "
        f"당신은 아이디어스 CS 트리아지 에이전트(표시명: '{DISPLAY_NAMES['triage']}')입니다. "
        "사용자 의도를 한 번 파악해 다음 두 에이전트 중 하나로 핸드오프합니다:\n"
        f" - 환불·교환·취소·결제 문제 → transfer_to_refund ('{DISPLAY_NAMES['refund']}')\n"
        f" - 선물·상품·구매·추천 문의 → transfer_to_recommend ('{DISPLAY_NAMES['recommend']}')\n"
        "스스로 답변하지 말고 즉시 핸드오프합니다. 한 메시지에 핸드오프는 1회만."
    ),
    tools=[],
    handoffs=[],
    input_guardrails=[relevance_guardrail, jailbreak_guardrail],
)


# 핸드오프 그래프
triage_agent.handoffs = [refund_agent, recommend_agent]
refund_agent.handoffs = [triage_agent]
recommend_agent.handoffs = [triage_agent]
