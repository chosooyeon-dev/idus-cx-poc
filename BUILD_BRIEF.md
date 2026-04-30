# 빌드 브리프 — 아이디어스 CS 에이전트 PoC

> **이 문서를 읽는 주체**: Claude Code 새 세션 (또는 다른 LLM 코딩 어시스턴트). 사용자(조수연, CX 5년 경력 비엔지니어)가 4/30 23:59 마감 과제를 짧은 시간에 빌드하기 위한 컨텍스트.
>
> **첫 응답 포맷**:
> 1. v0 scope 한 줄 요약 (§6에서 인용)
> 2. Phase 1부터 시작한다는 한 줄 선언
> 3. Phase 1 첫 작업 즉시 시작
>
> 의도가 모호하면 코드부터 짜지 말고 한 번 질문할 것.
>
> **작성일**: 2026-04-29 / **마감**: 2026-04-30 23:59 / **남은 시간**: ~24시간

---

## 1. 과제 (원문 인용 — 변경 금지)

채널톡 AX Consultant 포지션 과제.

**미션**: 어떤 도구든 자유롭게 활용해 이커머스 에이전트를 만든다. 핵심 기능을 스스로 정의하고 각 기능 데모 구현. 데이터는 직접 크롤링·목업 무방.

**제출물 5개**:
1. 라이브 URL (실제 챗봇이 작동하는 주소)
2. 시연 영상 (3분 이내)
3. Raw Transcript (사용한 AI 도구 export 원문 로그 — 프롬프트·응답·재시도·에러·설계 변경 과정 포함)
4. 아키텍처 메모 (도구 선택 이유·데이터 흐름·예상 비용)
5. KPI 시트 (핵심 지표 및 이유)

---

## 2. 평가 각도 (이 과제가 무엇을 보는지)

면접관 2명, 채점 각도 다름. **두 사람 모두 만족시켜야 함.**

| 평가자 | 핵심 질문 | 좋아할 신호 |
|---|---|---|
| **마일로** (DS팀 리드) | 데이터 구조·실행 파이프라인 견고성, 막혔을 때 어떻게 움직였나 | "정리"·"한계 인식"·"사람이 안 해도 되겠네요" |
| **브라이언** (CAIO) | 비즈니스 KPI 움직였나, 100개 회사에 복붙 가능한가, 일본 확장 | "진짜"·"현장"·"실제 처리까지" |

**숨은 채점 6축** (Anthropic·OpenAI·Sierra·Decagon·Intercom 공통):
1. **Product sense** — 스코프 자기결정
2. **Trade-off articulation** — 왜 이 모델·구조·범위
3. **Production reality** — 에러 핸들링·로깅·degradation
4. **Evaluation** — 잘됐는지 어떻게 아는가
5. **Communication** — 고객 입장 말하기
6. **Clean > clever** — 화려함보다 정돈

---

## 3. 직무 본질 — 한 문장

> *"고객사 페인 진단 → ALF + 바이브 코딩 자동화로 솔루션 빌드 → 현장 튜닝·교육·전환 → 사례화"*

이 과제는 위 직무의 **첫 클라이언트 미팅 1차 딜리버러블 시뮬레이션**으로 본다.

---

## 4. 타겟 클라이언트: 아이디어스 (idus.com)

### 왜 아이디어스 (3줄)
1. **이미 채널톡 chat 도입 + ALF 미도입 (정황상)** = AX Consultant가 매일 하는 "기존 채널톡 고객 → ALF 업그레이드" 시뮬레이션 정중앙
2. **3자 구조** (작가-고객-플랫폼) = ALF 공개 레퍼런스 전부 2자 구조 → 빈 영역 = 독창성
3. **중견 D2C·버티컬 커머스 결** = ALF 대표 고객사(브랜든·콜로소·아임웹·민병철유폰) 결과 일치

### 외부에서 확인된 사실 (수동 fetch로 확인됨)
- `idus.com` HTML 코드에 박힌 채널톡 플러그인 키:
  ```js
  channelTalk: { hashKey: "...", pluginKey: "46304f6f-24f5-4b36-a593-e86c7d821238" }
  ```
- 자체 챗봇: `chatbot-aggregator.idus.com` API 도메인 운영
- 채널톡 공개 고객사례·헬프센터 채팅 흐름에서 **ALF 미도입 확인됨**

### 데이터 사용 원칙 (컴플라이언스)
- robots.txt 기본값 `Disallow: /` (Googlebot 등 화이트리스트만) → **자동 크롤링 금지**
- 약관·헬프센터·카테고리 페이지는 사람이 브라우저로 보고 패턴만 파악
- **PoC에 들어가는 모든 데이터는 합성** — 실제 텍스트·이미지 직접 사용 X
- 외부 공개 시 가명 처리 권장 (`FreshCraft` 등). 과제 제출본은 디스클레이머 *"본 시연은 지원자 개인 포트폴리오, 해당 브랜드의 공식 프로젝트가 아닙니다"* 명시.

---

## 5. 페인 (외부 자료 + CX 도메인 패턴)

> 출처: 아이디어스 약관·헬프센터·앱스토어 리뷰 수동 확인 + 핸드메이드 마켓플레이스 CX 도메인 일반 패턴.

| # | 페인 | 자동화 가능성 | 시나리오 매핑 |
|---|---|---|---|
| 1 | **작가별 환불·교환 정책 다양** → CS팀 일일이 확인 | ★★★★★ 룰엔진 | 시나리오 B |
| 2 | **"언제 받아요?"** 빈발 (작가별 리드타임) | ★★★★ 평균+현 단계 | (v0.5 옵션) |
| 3 | **핸드메이드 하자 분쟁** (사진 판정 필요) | ★★★★ VLM | 시나리오 C |
| 4 | **선물 구매 추천 어시스턴트 부재** | ★★★★ RAG | 시나리오 A |

---

## 6. Scope

### v0 — 오늘 안에 확실히 동작 (필수, 8시간 안)

**시나리오 A · 선물 추천 (페인 4)**
- 입력: *"엄마 환갑 선물로 30만원대 도자기 추천해줘"*
- 처리: 카탈로그 RAG (가격·카테고리 필터) → 작가 평점·리드타임 종합 → 추천 3개
- 출력: 추천 3개 + 이유 + *"이 작가는 평균 X일 소요"*

**시나리오 B · 환불 안내 (페인 1) ⭐ 핵심**
- 입력: *"주문 #1234 환불하고 싶어요"*
- 처리: 주문 조회 → 작가 ID → 작가별 정책 조회 → **Python 룰엔진으로 분기** (제작 전/후, 단순변심/하자, 부분환불 등) → 결과 안내
- 출력: 정책 인용 + 환불 가능 여부 + 다음 단계
- **핵심 원칙**: LLM이 정책 판정 X. 룰엔진이 판정. LLM은 응답 작성만.
- **결제·환불 실 처리는 안 함** (시연 안내까지만, 한국 PG 미지원 — 부록 D 참조)

### v0.5 — 시간 남으면

**시나리오 C · 사진 하자 판정 (페인 3)**
- 이미지 업로드 + *"이거 깨졌어요"* → VLM 판정 → 자동 환불 승인 OR 작가 확인 요청

### 다음 단계 — 영상·메모 비전 한 단락만 (만들지 X)
- 환불 후 자동 작가 추천 (CRM 회복)
- 멀티모달 출력 (조립법 GIF 즉석 생성)
- 모델 교체 (Sonnet 4.6 → GLM-4.6, base_url 한 줄)
- self-improving 운영 봇 (NousResearch [Hermes Agent](https://github.com/NousResearch/hermes-agent) 등 후속 자율 에이전트 프레임워크)

---

## 7. 스택

| 영역 | 선택 | 이유 |
|---|---|---|
| **빌드 도구** | Claude Code (Max 플랜) | 사용자 익숙, Max 한도 내 무료 |
| **베이스 레포** | `openai/openai-cs-agents-demo` (MIT) | Next.js + OpenAI Agents SDK, 핸드오프 UI 기성품 |
| **라이브 URL 추론 모델** | **GLM-4.6** (`z-ai/glm-4.6` via OpenRouter) | OpenRouter $1 무료 크레딧으로 비용 0. 한국어 강함, OpenAI 호환 API |
| **VLM** | GLM-4V 또는 Gemini 2.5 Flash (시간 남으면) | 동일 키, 무료 크레딧 내 |
| **Embedding** | `text-embedding-3-small` (OpenAI 호환, OpenRouter) | 표준 |
| **룰엔진** | Python 함수 (`refund_policy.py`) | 별도 라이브러리 X. 사용자의 `refund_decision.py` 패턴 차용 |
| **디자인** | shadcn/ui + Tweakcn 테마 1클릭 | 직접 만들지 말고 가져와 조립 |
| **데이터** | 합성 JSON (상품 50·작가 10·상담 30) | DB 안 씀 (오버킬) |
| **배포** | Vercel — 새 프로젝트 `idus-cx-poc` | `project-oppua`는 그대로 두고 신규 추가 |

**모델 전략**: 빌드는 Claude Code Max로 Opus 4.7급 모델 활용 (무료). 라이브 추론은 GLM-4.6 (OpenRouter $1 무료). **클라이언트 도입 시 base_url 한 줄로 Opus 4.7 또는 자체 fine-tune 모델 교체 가능** — 코드 수정 0. 컨설턴트 사고 (아키 메모에 한 단락).

---

## 8. 사용자 운영 노하우 5개 (PoC 빌드 시 그대로 적용)

CX 에이전트를 직접 프로덕션 운영하며 쌓은 패턴:

1. **정책 판정은 코드, 응답 작성은 LLM** — 환불·교환 같이 일관성 중요한 판정은 Python 룰엔진. LLM은 자연어 응답만. → **시나리오 B 핵심 구조**.
2. **검증 가능성이 완성도보다 우선** — AI 응답에 근거(조회 결과·정책 조항) 함께 반환. → **응답 포맷에 `sources` 필드 강제**.
3. **반복 이슈 자동 감지 → 사람한테 즉시 알림** — 같은 문의 N건 반복 시 담당자 알림. → **시나리오 B에 "최근 N건 동일 문의" 카운터 + 임계 초과 시 사람 라우팅**.
4. **단일 에이전트 + 프롬프트 체이닝 선호** — 멀티 에이전트는 정보 손실 잦음. → **베이스 레포 멀티 에이전트는 라우팅만, 시나리오 내부는 단일**.
5. **80% 론칭 + 데일리 실패 케이스 리뷰** — 빠른 배포 후 매일 30분 리뷰로 룰·프롬프트 보강. → **v0 동작 후 시간 남으면 실패 케이스 5개 던져 보강**.

---

## 9. 활용 외부 자원 (직접 만들지 말고 조립)

| 자원 | 용도 |
|---|---|
| **Vercel AI SDK** (`useChat` 훅) | 챗 UI·스트리밍 |
| **shadcn/ui** + Tweakcn | 디자인 시스템 (CLI 1줄 설치) |
| 메모리 스킬 `customer-support` | 시나리오·정책 검증 |
| 메모리 스킬 `humanize-writing` | AI 응답 톤 다듬기 (AI 티 제거) |
| 메모리 스킬 `claude-api` | prompt caching·tool use 최적화 |

---

## 10. 5개 제출물 매핑

| # | 제출물 | 무엇을 담을지 | 시간 |
|---|---|---|---|
| 1 | **라이브 URL** | Vercel 배포. 시나리오 A·B 동작. 콜드스타트 3초 이내. 우측 Agent Trace 패널 | 30% |
| 2 | **3분 영상** | OpenAI FDE 포맷: 페르소나 20s → 시나리오 A·B 라이브 70s → 시나리오 C 30s → 아키 30s → 다음 단계 30s. 침착 해설 (BGM·FX 없음) | 15% |
| 3 | **Raw Transcript** | 이 세션 JSONL export + "막힌 순간 Top 5" 정제 .md 함께 | 10% |
| 4 | **아키텍처 메모** (1-2p) | (a) 한 줄 요약 (b) 도구 선택 이유 (c) Mermaid 데이터 흐름 (d) 비용 4단계 (e) 한계 3개 (f) 다음 단계 | 25% |
| 5 | **KPI 시트** | 자동해결률 + Safety Rate + Eval (LLM judge + GT 20개) + Klarna 맥락 표 | 20% |

---

## 11. 작업 규칙 (Raw Transcript에 신호로 남음)

1. **매 단계 시작 전 한 줄 선언** — *"지금 뭘 할 건지"* 한 문장
2. **5분 이상 막히면 멈춤** — 다른 방식 제안. 같은 방향으로 더 파지 말 것
3. **설계 변경은 명시** — *"이 방향 안 되니까 X로 가자"*
4. **큰 변경은 먼저 확인** — 파일 구조·스택 교체·의존성 추가
5. **Clean > clever** — 50줄 단일 함수가 깔끔한 5-class 추상화보다 낫다

---

## 12. 환경

### 12-1. 작업 폴더
```
~/dev/idus-cx-poc/
```
이 문서·`research/`·`.env.local`·`.gitignore` 이미 여기 있음.

### 12-2. GitHub
- 사용자: `chosooyeon-dev`
- Repository 이름: `idus-cx-poc` (Public)
- 첫 push 시점에 Claude Code가 git CLI로 처리. 인증 막히면 사용자에게 안내 (PAT 또는 `gh auth login`)

### 12-3. Vercel
- 기존 `project-oppua`는 그대로
- 신규 프로젝트 `idus-cx-poc` 생성 → GitHub OAuth로 위 repo import → 환경변수 등록

### 12-4. 환경변수 (.env.local)
- `OPENROUTER_API_KEY` (사용자가 채워 넣음)
- `OPENROUTER_BASE_URL=https://openrouter.ai/api/v1`
- `PRIMARY_MODEL=z-ai/glm-4.6` (라이브 추론, 무료 크레딧 내)
- Vercel에도 동일 변수 등록 필수

---

## 13. 첫 액션 (Phase별 시간 — 마감까지 ~8시간 빌드 가정)

각 Phase 시간 초과 시 다음 Phase로 컷오프. v0(시나리오 A·B)만 무조건 끝내고 나머지는 옵션.

### Phase 1 — 환경·데이터 (1h)
1. `~/dev/idus-cx-poc/app/`에 `openai/openai-cs-agents-demo` clone
2. README 훑고 손댈 파일 5개 추리기 (한 단락 요약)
3. `base_url`을 OpenRouter로 교체. `PRIMARY_MODEL=z-ai/glm-4.6`
4. Node 의존성 설치 + 로컬 실행 확인 (기본 챗봇 응답 뜨는지)
5. shadcn/ui + 테마 1개 설치 (Tweakcn에서 1클릭)
6. **합성 데이터 3개 JSON 생성** (Claude Code 자체 세션에서 직접 한 번에):
   - `data/products.json` — 50개 (도자기·가죽·캔들·뜨개 등 분포, 가격 5천~50만, 작가 ID 일관성)
   - `data/artists.json` — 10명 (정책 타입 4종 다양: full_refund / no_refund_after_start / case_by_case / partial_only, 평균 리드타임)
   - `data/conversations.json` — 30건 (환불 10·리드타임 8·추천 6·하자 4·기타 2)

### Phase 2 — 시나리오 B 백엔드 (2h, 가장 핵심)
1. `tools/refund_policy.py` 작성 — 작가 정책 4종 분기 룰엔진
2. 에이전트가 룰엔진을 tool-call로 호출하는 구조 (정책 판정은 룰엔진, 응답 작성은 LLM)
3. 응답에 `sources` 필드 강제 (참조한 정책 조항·작가 ID·주문 ID)
4. *"같은 주문 N회 환불 문의 시 사람 라우팅"* 카운터 추가 (사용자 노하우 #3)
5. 시나리오 B end-to-end 동작 확인 — *"주문 #1234 환불"* → 정책 분기 → 응답

### Phase 3 — 시나리오 A RAG (1.5h)
1. `data/products.json` 메모리 vector store 임베딩
2. 추천 에이전트: 가격·카테고리 필터 → 평점 가중 → 추천 3개 + 작가 리드타임
3. 시나리오 A 동작 확인 — *"환갑 선물 30만원대 도자기"* → 추천 3개

### Phase 4 — UI·배포·QA (1.5h)
1. 시나리오 A·B 둘 다 UI 동작 + Agent Trace 패널 작동
2. 디자인 마감 — shadcn 테마 적용, 모바일 Safari 깨짐 없음 확인
3. `git init` → first commit → GitHub repo 생성·push
4. Vercel 신규 프로젝트 import → 환경변수 등록 → 배포
5. **시크릿 모드에서 외부 접근 + 콜드스타트 3초 이내 검증**

### (옵션) Phase 5 — 시나리오 C VLM (1h)
- 시간 남으면 GLM-4V로 이미지 업로드 + 하자 판정 추가

### Phase 6 — 영상·메모·KPI·Transcript (2h)
1. **3분 영상** (Loom + CapCut) — §10 #2 포맷
2. **아키텍처 메모** 1-2p — Mermaid + 비용 표 + 한계 + 다음 단계
3. **KPI 시트** Notion DB — 자동해결률·Safety Rate·Escalation Precision·Eval(LLM judge + GT 20개) + Klarna 맥락 표
4. **Raw Transcript** — 이 세션 JSONL export + "막힌 순간 Top 5" 정제 .md
5. API 키·민감정보 grep 1회 마스킹 (`sk-or-` → `sk-or-XXXX`)

### Phase 7 — 제출 (마감 2시간 전)
- 5개 제출물 모두 시크릿 모드 외부 접근 확인
- 23:59 **2시간 전** 제출 (23:57 같은 막판 X)

---

## 14. 마감 QA 체크리스트

### 라이브 URL
- [ ] 시크릿 모드 3초 이내 응답
- [ ] iPhone Safari 안 깨짐
- [ ] 시나리오 A·B end-to-end
- [ ] Agent Trace 보임
- [ ] 환경변수 누락 없음

### 3분 영상
- [ ] 2:50~3:00 (3:01 X)
- [ ] 1080p 60fps
- [ ] BGM·FX 없음
- [ ] 파일명 `조수연_AX_Consultant_demo.mp4` / <100MB

### Raw Transcript
- [ ] JSONL 원본 + 정제 .md 함께
- [ ] "막힌 순간 Top 5"
- [ ] API 키 grep 마스킹 완료
- [ ] GitHub Gist public 또는 노션 public 링크

### 아키텍처 메모
- [ ] 1-2p, Mermaid 1개, 비용 4단계, 한계 3개, 다음 단계 한 단락

### KPI 시트
- [ ] 7개 KPI: 자동해결률·CSAT·First Response Time·Safety Rate·Escalation Precision·Meta-loop Conversion·멀티모달 Resolution
- [ ] 각 KPI: 정의·공식·베이스라인·목표·근거
- [ ] Klarna 반면교재 맥락 표

---

## 부록 A · 마일로 인용구 (영상·메모 활용)

> *"망치를 든 이성적 낙관주의자."*

> *"AI의 한계를 정확히 이해하면서도 그 한계로 스스로를 설득하지 않는 사람."*

> *"작은 실험을 빠르게 쌓아, 데모가 아니라 운영을 바꾸는 변화로."*

> *"컨설턴트 일은 종종 '기술'보다 '정리'에 가깝습니다."*

> *"AI를 전제로 사업이 어떻게 다시 짜여야 하는지."* (2026 북극성)

---

## 부록 B · KPI 시트 후보 7개

| # | KPI | 정의 | 베이스라인 | 목표 | 근거 |
|---|---|---|---|---|---|
| 1 | 자동해결률 | 인간 개입 없이 종결 | ALF 48-70% | 55% | Klarna 반면교재 |
| 2 | CSAT | 상담 만족도 | 4.1-4.5 | 4.4 | 자동해결률과 쌍 |
| 3 | First Response Time | 첫 응답 초 | 3s-2h | 5s 이내 | ALF 수준 |
| 4 | **Safety Rate** ⭐ | 민감건 중 적절 이관 | 표준 없음 | 95% | Klarna 놓친 지점 |
| 5 | **Escalation Precision** ⭐ | 이관 적절성 | 없음 | 80% | 과민/둔감 균형 |
| 6 | **Meta-loop Conversion** ⭐ | 제품 개선 전환 | 없음 | 30% | 6개월 |
| 7 | **멀티모달 Resolution** ⭐ | 이미지건 해결률 | 없음 | 60% | 시나리오 C |

---

## 부록 C · Klarna 반면교재

- 2024: AI Assistant 상담 2/3 처리, *"700명 분량"* 발표
- 2025: CSAT 22% 하락, CEO *"AI 너무 밀어붙였다"* 인정, 인간 재고용
- 교훈: **자동해결률만 KPI로 잡으면 망함. Safety Rate 쌍으로.**

URL: https://fortune.com/2025/05/09/klarna-ai-humans-return-on-investment/

---

## 부록 D · 결제·환불 실 처리 X (시연 범위 명시)

PoC는 "환불 정책 분기 + 안내"까지. 실제 결제·환불 트랜잭션 X (PG 인증·전자금융거래법상 별도 협의 필요).

---

## 부록 E · 참고 리서치 (`research/` 폴더)

- `research/00_summary.md` v2 — 통합 요약
- `research/04_channeltalk_context.md` — ALF 갭 분석 + 마일로 인터뷰 원문
- `research/06_bryan_and_competitors.md` — 브라이언 프로파일 + 경쟁 4 페르소나
- `research/07_korea_reality.md` — 한국 PG·법무·합성 데이터 + ALF 고객사 디테일
- `research/08_deliverables_playbook.md` — 5개 제출물 구체 전략
- `research/10_overseas_experts.md` — OpenAI FDE 영상 포맷·Shopify Sidekick Eval

---

**문서 끝. 새 세션 첫 응답: §6 v0 한 줄 + Phase 1 시작 선언 + 즉시 실행.**
