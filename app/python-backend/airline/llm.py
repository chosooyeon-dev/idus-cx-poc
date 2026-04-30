"""LLM client setup — route OpenAI Agents SDK calls through OpenRouter.

Loaded once on backend startup. base_url + api_key swap is the only thing
needed to point Agents SDK at any OpenAI-compatible provider.
"""
from __future__ import annotations

import os
from pathlib import Path

from agents import (
    ModelSettings,
    OpenAIChatCompletionsModel,
    set_default_openai_api,
    set_default_openai_client,
    set_tracing_disabled,
)
from dotenv import load_dotenv
from openai import AsyncOpenAI

# .env.local lives at repo root: ~/dev/idus-cx-poc/.env.local
# This file: app/python-backend/airline/llm.py → parents[3] = repo root
_ENV_PATH = Path(__file__).resolve().parents[3] / ".env.local"
load_dotenv(_ENV_PATH)

_BASE_URL = os.environ.get("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1")
_API_KEY = os.environ.get("OPENROUTER_API_KEY", "")

_client = AsyncOpenAI(base_url=_BASE_URL, api_key=_API_KEY)
set_default_openai_client(_client, use_for_tracing=False)
set_default_openai_api("chat_completions")
set_tracing_disabled(True)

# OpenRouter 모델 이름은 'z-ai/glm-4.6'처럼 슬래시를 포함합니다. Agents SDK의 multi_provider는
# 슬래시 앞 토큰을 prefix(litellm/openai/...)로 파싱하므로, 문자열로 넘기면 'Unknown prefix'.
# 모델 객체를 직접 주입하면 prefix 라우팅을 우회합니다.
MODEL_NAME = os.environ.get("PRIMARY_MODEL", "z-ai/glm-4.6")
MODEL = OpenAIChatCompletionsModel(model=MODEL_NAME, openai_client=_client)

# OpenRouter 무료 크레딧 잔액 검증은 max_tokens를 기준으로 합니다.
# Agents SDK 기본값은 모델 max context(65536) → 402. 작은 cap을 명시해 호출당 비용을 줄입니다.
DEFAULT_SETTINGS = ModelSettings(max_tokens=4096, temperature=0.3)
GUARDRAIL_SETTINGS = ModelSettings(max_tokens=256, temperature=0.0)
