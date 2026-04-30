# 막힌 순간 Top 5

> 24시간 안에 PoC v0를 끝내는 동안 의사결정·디버깅이 가장 빡셌던 5개 지점.
> 원본 raw transcript는 별도 JSONL로 export (Claude Code 세션 export).

## 1. ChatKit ↔ Vercel AI SDK 분기 결정 (Phase 1 → Phase 4 결정)

**상황**
- 베이스 레포(`openai/openai-cs-agents-demo`)가 OpenAI **ChatKit** (`@openai/chatkit-react`) UI 사용.
- `chatkit-panel.tsx:16` 의 `domain_pk_localhost_dev`는 **localhost 전용 키** — Vercel 배포 도메인에서 미작동.
- OpenAI 대시보드에서 `idus-cx-poc.vercel.app` 도메인 등록 + 새 `domain_pk_*` 발급 필요 → **인증 함정 1~2시간**.

**선택지 3개**
| 옵션 | 구조 | 인증 함정 | 위험 |
|---|---|---|---|
| A | ChatKit 유지 + OpenAI 도메인 키 발급 | OpenAI 가입 | 1~2h 함정 |
| B | 단일 Vercel + Python serverless | 없음 | `openai-chatkit` 패키지 250MB 한도 위험 |
| **C** | **Backend 폐기 + Next.js 단일 + 단일 에이전트** | **없음** | Phase 2 백엔드 일부 폐기 |

**결정**: **C**.
- 사용자 노하우 #4("단일 에이전트 + 프롬프트 체이닝 선호") 정합.
- 인증 함정 0.
- Phase 2 룰엔진(Python)은 TS로 직역 — 단위 테스트 17 케이스 그대로 보존.

**사전 검증 (의사결정 전)**: AgentPanel(트레이스) ↔ ChatKit 의존성 분리 가능한지 grep 확인. 자식 컴포넌트 4개 모두 `chatkit/openai` 0건 → ChatKit 떼도 트레이스 임팩트 손실 0 확인 후 결정.

---

## 2. OpenAI Agents SDK `Unknown prefix: z-ai` (Phase 2 e2e)

**증상**
```
agents.exceptions.UserError: Unknown prefix: z-ai
```

**원인**: OpenAI Agents SDK의 `multi_provider`가 모델 문자열 `z-ai/glm-4.6`의 슬래시 앞 토큰을 prefix(litellm/openai/...)로 파싱해 자체 매핑에서 찾으려다 실패. `set_default_openai_client()`로 client는 주입됐지만 model 문자열 라우팅이 우선 동작.

**수정**:
```python
# 문자열 대신 모델 객체로 직접 주입 → prefix 라우팅 우회
MODEL = OpenAIChatCompletionsModel(model="z-ai/glm-4.6", openai_client=client)
```

5분 내 해결. SDK 내부 라우팅 우회 패턴 확보.

---

## 3. OpenRouter 402 — `max_tokens` 잔액 검증

**증상**
```
APIStatusError: 402 - You requested up to 65536 tokens, but can only afford 18181
```

**원인**: Agents SDK 기본 `max_tokens` = 모델 max context(65536). OpenRouter 잔액 사전 검증에서 거부 (실제 출력 토큰 수가 아니라 요청 cap을 본다).

**수정 + 사용자 의사결정**:
```python
DEFAULT_SETTINGS = ModelSettings(max_tokens=4096, temperature=0.3)
GUARDRAIL_SETTINGS = ModelSettings(max_tokens=256, temperature=0.0)
```
- 호출당 비용 0.001~0.005 USD로 안정.
- 사용자에게 즉시 보고 → $10 OpenRouter 충전 + max_tokens=4096 결정.

**교훈**: 잔액 검증은 max_tokens 기준. 모델 max를 그대로 쓰면 잔액 충분해도 거부.

---

## 4. AI SDK 6 Responses API → Chat Completions 강제 (Phase 4 첫 e2e)

**증상**
```
{"type":"error","errorText":"Invalid Responses API request"}
```
첫 도구 호출(`lookup_order`)은 흘렀지만, 두 번째 step(`refund_policy_engine`) 진입 시 깨짐.

**원인**: AI SDK 6의 `@ai-sdk/openai` 기본 API가 OpenAI **Responses API** (reasoning 블록 등 OpenAI 호스팅 전용 기능). OpenRouter는 **Chat Completions만 호환**.

**수정**:
```ts
// .chat() 명시 → Chat Completions API 강제
model: openrouter.chat("z-ai/glm-4.6")
```

추가로 `compatibility: "compatible"` 옵션도 넣었는데 — 다음 항목으로 이어짐.

---

## 5. Vercel build typecheck — `compatibility` deprecated

**증상**: 로컬 `npx next build`는 통과 → Vercel에서
```
Type error: 'compatibility' does not exist in type 'OpenAIProviderSettings'
./app/api/chat/route.ts:12
```

**원인**: AI SDK 6.x에서 `compatibility` 옵션이 타입 정의에서 제거(5.x 잔재). 로컬 typescript 캐시(`tsconfig.tsbuildinfo`)와 Vercel 클린 빌드의 strict 정도 차이로 로컬에서만 통과.

**수정**: 옵션 줄 1줄 삭제. `.chat()` 명시만으로 chat completions 강제 효과 동일. dev 서버에서 multi-step 흐름 재확인 후 push → Vercel 자동 재빌드 통과.

---

## 공통 교훈

| # | 교훈 |
|---|---|
| 1 | **공급자 호환은 base_url 외에도 API 분기**(Responses vs Chat Completions)를 본다. |
| 2 | **잔액 검증은 max_tokens 기준** — 모델 max를 그대로 쓰면 잘못된 402. |
| 3 | **로컬 build와 Vercel build의 strict 정도가 다를 수 있다** — Vercel이 더 엄격(클린 빌드). |
| 4 | **인증 함정은 사전 분리 검증으로 우회** — AgentPanel-ChatKit 의존성 grep으로 사전 확인 후 Path C 결정. |
| 5 | **사용자 노하우 #4("단일 에이전트")는 디버깅 비용도 절감** — 핸드오프 그래프 디버깅 X, 도구 호출 트레이스만. |
