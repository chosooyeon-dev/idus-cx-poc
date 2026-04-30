# 막힌 순간 Top 11

> 24시간+ 안에 PoC v0를 끝내는 동안 의사결정·디버깅이 가장 빡셌던 11개 지점.
> 원본 raw transcript는 별도 JSONL로 export (Claude Code 세션 export, 마스킹 후 GitHub Gist).
>
> **포맷**: 상황 → 증상 → 원인 → 수정 → 교훈 (해외 FDE Sundeep Teki 권장 패턴).

---

## 1. ChatKit ↔ Vercel AI SDK 분기 결정 (Phase 1 → Phase 4 결정)

**상황**
- 베이스 레포(`openai/openai-cs-agents-demo`)가 OpenAI **ChatKit** (`@openai/chatkit-react`) UI 사용
- `chatkit-panel.tsx:16` 의 `domain_pk_localhost_dev`는 **localhost 전용 키** — Vercel 배포 도메인에서 미작동
- OpenAI 대시보드에서 `idus-cx-poc.vercel.app` 도메인 등록 + 새 `domain_pk_*` 발급 필요 → **인증 함정 1~2시간**

**선택지 3개**

| 옵션 | 구조 | 인증 함정 | 위험 |
|---|---|---|---|
| A | ChatKit 유지 + OpenAI 도메인 키 발급 | OpenAI 가입 필요 | 1~2h 함정 |
| B | 단일 Vercel + Python serverless | 없음 | `openai-chatkit` 패키지 250MB 한도 위험 |
| **C** | **Backend 폐기 + Next.js 단일 + 단일 에이전트** | **없음** | Phase 2 백엔드 일부 폐기 |

**결정**: **C**.
- 내 운영 패턴 #4("단일 에이전트 + 프롬프트 체이닝 선호") 정합
- 인증 함정 0
- Phase 2 룰엔진(Python)은 TS로 직역 — 단위 테스트 17 케이스 그대로 보존

**사전 검증**: AgentPanel(트레이스) ↔ ChatKit 의존성 분리 가능한지 grep 확인. 자식 컴포넌트 4개 모두 `chatkit/openai` 0건 → ChatKit 떼도 트레이스 임팩트 손실 0 확인 후 결정.

**교훈**: **인증 함정은 사전 분리 검증으로 우회**. 결정 전 grep 한 번이 1~2시간 함정 회피.

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

5분 내 해결.

**교훈**: SDK 내부 라우팅 우회 패턴 — 문자열 인터페이스 대신 객체 주입으로 한 단계 내려가면 깔끔.

---

## 3. OpenRouter 402 — `max_tokens` 잔액 검증

**증상**
```
APIStatusError: 402 - You requested up to 65536 tokens, but can only afford 18181
```

**원인**: Agents SDK 기본 `max_tokens` = 모델 max context(65536). OpenRouter 잔액 사전 검증에서 거부 (실제 출력 토큰 수가 아니라 **요청 cap을 본다**).

**수정 + 사용자 의사결정**:
```python
DEFAULT_SETTINGS = ModelSettings(max_tokens=4096, temperature=0.3)
GUARDRAIL_SETTINGS = ModelSettings(max_tokens=256, temperature=0.0)
```
- 호출당 비용 0.001~0.005 USD로 안정
- 사용자에게 즉시 보고 → $10 OpenRouter 충전 + max_tokens=4096 결정

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

**교훈**: 공급자 호환은 base_url 외에도 **API 분기**(Responses vs Chat Completions)를 본다.

---

## 5. Vercel build typecheck — `compatibility` deprecated

**증상**: 로컬 `npx next build`는 통과 → Vercel에서
```
Type error: 'compatibility' does not exist in type 'OpenAIProviderSettings'
./app/api/chat/route.ts:12
```

**원인**: AI SDK 6.x에서 `compatibility` 옵션이 타입 정의에서 제거(5.x 잔재). 로컬 typescript 캐시(`tsconfig.tsbuildinfo`)와 Vercel 클린 빌드의 strict 정도 차이로 로컬에서만 통과.

**수정**: 옵션 줄 1줄 삭제. `.chat()` 명시만으로 chat completions 강제 효과 동일.

**교훈**: **로컬 build와 Vercel build의 strict 정도가 다를 수 있다** — Vercel이 더 엄격(클린 빌드).

---

## 6. 응답 잘림 — 도구 호출 후 LLM 최종 응답 안 만듦 ⭐ critical

**증상** (사용자가 prod 라이브 URL 직접 만져보고 발견)
- 시나리오 1·2·5에서 **도구 호출 후 LLM이 최종 응답 못 만들고 멈춤**
- *"~~ 확인해보겠습니다"* transitional 멘트 출력 → 도구 호출 → 도구 결과 받음 → finish-step → 끝
- 응답 49~117자만, 진짜 답변 X

**증상 패턴**:
| 시나리오 | 응답 길이 | 도구 호출 |
|---|---|---|
| 1. 환불 | 49자 | get_user_orders + lookup_faq |
| 2. 추천 | 117자 | recommend_gift |
| 5. 부분 환불 | 38자 | get_user_orders + lookup_faq |
| 3·4 (Discovery) | 287·120자 | 도구 호출 0~1회 — 정상 |

**진단 흐름**
- 내부 검증("5/5 통과") vs prod 라이브 URL의 실제 응답 차이 발생 — 같은 입력이라도 dev local과 prod streaming 환경에서 응답 끊김 패턴이 다름
- 원인 1: system prompt가 *"도구 호출 전 텍스트 X · 도구 후 한 번에"* 강제했는데, GLM-4.6이 *"도구 후 텍스트도 X"* 로 잘못 해석
- 원인 2: 모델별 multi-step tool use 안정성 차이 — GLM-4.6은 도구 결과 받은 후 추가 텍스트 생성 확률이 Sonnet 4.5보다 낮음
- `prepareStep` 시도 → 효과 없음

**근본 원인 분석**
도구 호출 후 LLM이 텍스트를 다시 생성하려면 (a) system prompt가 명시 허용 + (b) 모델이 multi-turn tool use에 안정적이어야 함. 둘 중 하나만 어긋나도 잘림. PoC에서는 (a) prompt 제약을 좁게 박은 게 1차 원인이고, (b) 모델 안정성 차이가 증폭. 운영은 두 축 모두 정량 측정(`response_length / tool_call_count`)해서 회귀 감지 필요.

**수정**:
- system prompt에서 *"도구 호출 후 반드시 자연어 응답 생성"* 명시 강화
- maxOutputTokens=4096
- 모델 교체 우회 시도 (GLM-4.6 → Sonnet 4.5) — 단 모델 ID 오타로 1차 실패

**교훈**:
- **내부 dev 검증과 prod 검증 사이에 차이가 있다** — streaming·region·모델 라우팅 등 환경 변수 다름. 사용자가 prod 라이브 URL에서 직접 만져 검증해야 진짜 통과
- system prompt의 *"도구 호출 전 텍스트 X"* 같은 제약은 양날의 검 — 모델이 도구 후도 텍스트 X로 해석할 수 있음
- 모델 multi-step 안정성은 prompt와 분리해서 별도 측정해야 한다

---

## 7. URL 혼동 — deployment-specific URL vs main alias

**증상**: 사용자가 *"라이브 URL 깨졌다"* 보고. 새 push 후에도 옛 응답.

**원인**: 사용자가 본 URL이 **deployment-specific URL** (`idus-cx-fgvlfsb4l-...vercel.app`). 이 URL은 그 push 시점 코드 고정. 이후 push되어도 갱신 X.

**진짜 영구 URL**: `https://idus-cx-poc.vercel.app/` — main alias, 새 push마다 자동 갱신.

**수정**: README에 main alias 박고, 모든 검증 명령어에 main alias 사용.

**교훈**: **Vercel은 push마다 새 URL을 발급**. README 또는 평가자에게 줄 URL은 무조건 main alias.

---

## 8. 진짜 idus FAQ 본문 추출 — 이미지로 박혀있음

**상황**: 사용자가 *"진짜 idus 고객센터 보고 만들었냐"* 추궁. 새 세션이 fetch 못 했음.

**증상**:
- `https://www.idus.com/w/board/faq` curl·WebFetch → 카테고리 라벨만, 본문 X
- 이유: idus.com이 Vue/Nuxt SPA. **본문이 이미지로 박혀 있음** (디자인 통일·SEO 부수 효과)

**해결 (4단계 파이프라인)**:
1. **Playwright headless Chrome**으로 19개 FAQ 페이지 + Notice + channel-talk 스크린샷 캡처
2. **Tesseract Korean OCR**로 본문 텍스트 추출 (95% 정확도)
3. **Claude Sonnet 4.5 Vision**으로 OCR 오타·자모 분리·기호 깨짐 정정
4. `data/idus_real_kb_clean.json`에 깨끗한 본문 저장

**결과**: 19건 FAQ 본문 깨끗하게 KB로 통합. PoC 정책 인용을 합성 → 진짜 본문 출처 표기로 전환.

**교훈**: **client-side rendering이 본문을 막아도 길은 있다** — Playwright + OCR + Vision 파이프라인. *"안 됨"* 결론 X, 우회 길 찾기.

---

## 9. ticket_id 환각 작문

**증상**: 작품 하자 시나리오에서 LLM이 `#TK-2025-0418` 같은 가짜 ticket_id 작문.

**원인**: `escalate_to_human` 도구가 ticket_id 발급 안 함. 그냥 *"담당자 연결됨"* 텍스트만 반환. LLM이 시연용으로 ticket 번호를 환각.

**수정**:
1. 도구 시그니처 확장:
   ```ts
   escalate_to_human({
     reason: string,
     conv_summary: string,
     collected_info: { photos?, order_ref?, urgency?, contact_pref? }
   }) → { ticket_id: "TKT-XXXXXX", department, eta_minutes }
   ```
2. 도구 내부에서 timestamp + hash 6자리로 ticket_id 자동 발급
3. system prompt 강제: *"ticket_id, 대기시간, 담당자 부서·이름은 반드시 escalate_to_human 도구 결과의 값만 사용. 자체 작문 절대 금지."*
4. temperature 0 (사실 반환만)

**교훈**: **도구가 반환 안 하는 정보는 LLM이 환각으로 채운다**. 시연용 가짜 정보도 도구가 책임지고 발급해야 검증 가능.

---

## 10. 입력란 비활성화 — 명확화 질문 후 사용자 답 못 함

**증상** (사용자 발견)
- *"환불해주세요"* 입력 → 명확화 질문 *"어떤 작품 말씀이신가요?"* 출력
- 그 후 입력란 비활성화. *"에이전트가 도구를 호출하는 중…"* 상태로 멈춤
- 사용자가 답 못 입력 → 흐름 막힘

**원인**: `streamText`가 명확화 질문 후 stream finish 정확히 안 보냄. 클라이언트 `useChat`의 `isLoading`이 `false`로 안 바뀜. 도구 호출 0회 + LLM 텍스트만 출력하는 케이스에서 stream 종료 처리 누락.

**수정**:
- `streamText`의 stopWhen·finish 신호 정확히 발사 처리
- 클라이언트 useChat status가 명확화 질문 끝나면 ready로 바뀌는지 검증
- 명확화 후 자유 입력 받는 e2e 흐름 검증

**교훈**: **multi-step 흐름의 finish 신호**는 도구 호출 회수 0/1/N 모두에서 정확해야 한다. UI는 finish 신호 신뢰하므로, 백엔드 stream 종료가 한 케이스라도 빠지면 UI 락업.

---

## 11. Discovery dialog 질문 폭격 ⭐ critical

**증상** (사용자가 prod 시나리오 D·H·I 직접 만져 발견)
- 시나리오 D *"작가가 답이 없어요"* → 주문 3건 보여준 후 *"그리고 몇 가지만 더 여쭤볼게요"* 로 한 번에 **3개 질문**
- 시나리오 H *"바로 통과되는 꿀팁 알려주세요"* → 5개 카테고리 × 각 4~5 bullet × sub-bullet 정보 폭격
- 시나리오 I *"앱이 자꾸 튕겨요"* → 4단계 해결책 + 다시 3개 질문

**원인 2종**
1. **Discovery 질문 갯수 제약 누락** — system prompt가 한 턴 1~2질문 제한을 명시 안 함. LLM이 *"기왕이면 다 묻자"* 로 해석.
2. **db 활용 부족** — 시나리오 D에서 AI는 *"마지막 작가 메시지 언제였어요?"* 를 사용자에게 묻는다. db에 timestamp 있는데. 메시지 본문은 개인정보지만 last_user_message_date·last_artist_message_date·days_since_last_artist_reply는 메타데이터로 자동 추정 가능.

**수정 (Intercom Fin 3 Procedures + Sierra 멀티스텝 패턴 차용)**
- system prompt 강화:
  - *"Discovery 단계 한 턴 질문 최대 1개. 사용자 답변 받은 후 다음 질문."*
  - *"응답 bullet 최대 3개, sub-bullet 금지, 카테고리 헤더 금지. 한 응답 200자 또는 6줄 이내."*
- 도구 시그니처 확장 (운영 단계):
  - `lookup_artist_messages(order_id) → { last_user_message_date, last_artist_message_date, days_since_last_artist_reply, total_message_count }` (메시지 본문 X, 메타만)
- system prompt에 능동 추정 가이드:
  - *"작가 무응답 문의 시 메시지 메타로 자동 추정. '마지막 작가 답변이 N일째 없으시네요' 박은 후, Discovery 1개만(시급도 등)."*

**교훈**
- **Discovery는 한 턴 1질문이 황금비** — 더 묻는 순간 사용자는 답을 안 한다 (Intercom Fin 운영 데이터)
- **db에 있는 정보를 사용자에게 묻지 마라** — 메타데이터로 자동 추정 후 가설 박고 *"맞으세요?"* 로 확인. 한 턴 절약
- **응답 길이는 정보량보다 중요** — 정보 폭격은 정보 0과 같다. 핵심 3개 + follow-up 유도

---

## 공통 교훈 (11개 종합)

| # | 교훈 |
|---|---|
| 1 | **공급자 호환은 base_url 외에도 API 분기**(Responses vs Chat Completions)를 본다 |
| 2 | **잔액 검증은 max_tokens 기준** — 모델 max를 그대로 쓰면 잘못된 402 |
| 3 | **로컬 build와 Vercel build의 strict 정도가 다르다** — Vercel이 더 엄격 |
| 4 | **인증 함정은 사전 분리 검증으로 우회** — grep 한 번이 시간 절약 |
| 5 | **내 운영 패턴 #4("단일 에이전트")는 디버깅 비용도 절감** — 핸드오프 그래프 X, 도구 호출 트레이스만 |
| 6 | **자기 dev 검증만으로 통과 보고 금지** — prod 라이브 URL에서 사용자가 직접 e2e 검증해야 진짜 |
| 7 | **Vercel은 push마다 새 URL 발급** — README는 main alias 무조건 |
| 8 | **client-side rendering 막힘 = 우회 길 찾기** — Playwright + OCR + Vision 파이프라인 |
| 9 | **도구가 반환 안 하는 정보는 LLM이 환각으로 채운다** — 시연 데이터도 도구가 발급 |
| 10 | **multi-step finish 신호 누락이 UI 락업의 원인** — 도구 호출 회수와 무관하게 finish 정확히 |
| 11 | **Discovery는 한 턴 1질문 + db 메타로 능동 추정** — 사용자에게 묻기 전에 db에서 끌어올 게 있는지 먼저 본다 |

## 내 운영 패턴 #5 적용 사례

이 PoC 빌드 자체가 *"80% 론칭 + 데일리 실패 케이스 리뷰"* 의 적용 사례. 막힌 11개 → 룰·프롬프트·도구 시그니처·시스템 프롬프트로 보강. KPI #7(Meta-loop Conversion)의 메타 증거.

운영 단계에서 이 루프를 **자동화**하면 (LLM Judge가 daily failure 자동 분류 + PR 자동 생성) → ALF 미답 영역 *"self-improving 운영 봇"*에 한 단계 더 가까워짐 (`docs/architecture.md` §11 다음 단계 참조).
