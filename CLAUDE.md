# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 정체성

이 repo는 **Claude Code 플러그인**이다. Claude Code가 정의한 hook 규격을 따르고, Claude Code marketplace + `/plugin install` 흐름으로 배포된다.

**제품 포지셔닝**: 이 repo는 **Enterprise 플러그인**이다. 사용자가 Pinta 백엔드에 붙여 사용한다. OSS 공개는 **미래에 별도 플러그인 repo**로 파생할 예정이며, 현재 enterprise 코드베이스 내에서 **OSS 재사용 가능한 core**와 **enterprise 전용 모듈**을 모듈 경계로 분리해둔다. 미래 OSS 플러그인이 core를 재활용할 수 있게 하기 위함.

- **Enterprise plugin** (현재 이 repo) — Pinta 백엔드 + Pinta CLI 기반 identity + 서버 측 issue detection에 의존.
- **OSS plugin** (미래 별도 repo) — core 모듈을 재사용. Pinta CLI 의존 없음. 사용자가 자기 OTLP collector / 자체 백엔드를 지정.

### 모듈 경계 규칙

- `src/core/`, `src/handlers/`, `src/index.ts` — **OSS-reusable**. `src/enterprise/`를 import하지 않는다.
- `src/enterprise/` — Enterprise 전용. core 인터페이스의 구현체를 제공.
- 의존 방향: `core → (nothing)`, `enterprise → core`, `index.ts → both`.
- `index.ts`는 enterprise 구현체를 core 인터페이스에 **DI 방식**으로 와이어링한다. `if (enterprise) { ... }` 같은 런타임 분기는 쓰지 않는다 — 분기 대신 와이어링 교체로 OSS 파생 준비.

## 이게 어떻게 작동하나

```
사용자 설정:  endpoint + api_key
            ↓ (every hook invocation)
플러그인:    pinta identity id/email     → resource attrs (member.identity.*)
            POST {endpoint}/traces       → OTLP resourceSpans (single span per hook)
            ↓ on transport failure
            .plugin-data/failed-spans.jsonl 에 큐잉, 다음 hook이 flush 시도

서버 측: trace 저장소에서 비동기로 issue detection 수행
```

**결론**: 플러그인은 Bronze layer 전송기다. hook event의 모든 top-level 필드를 `cc.<key>` 속성으로 평탄화해 OTLP로 보낸다. 정책 평가·issue detection은 서버 영역.

### 배포 정책

- 이 repo는 **Enterprise 플러그인만 배포**한다. OSS 플러그인은 미래에 **별도 repo**로 파생.
- 플러그인 marketplace는 startup 시 자동 업데이트 + managed settings로 버전 pinning(`sha`)을 지원 → **배포 갱신은 marketplace가 전담**
- 외부 데몬·sidecar·사용자 측 빌드 단계를 만들지 않는다.
- `dist/`는 GitHub Actions가 빌드·커밋한다 (로컬 `dist/`는 `.gitignore` 대상). 사용자 측 빌드 단계는 없다.

## 기능 범위 (현재 구현)

11종 Claude Code hook 이벤트를 OTLP span으로 변환해 `POST {endpoint}/traces`로 전송한다. 차단은 identity 미해결 시에만 발생(PreToolUse exit 2 / 그 외 exit 1).

- 이벤트 전송 (11종 hook → OTLP `resourceSpans`, hook 당 span 1개)
- skip되는 hook (Notification / TaskCreated / TaskCompleted)은 default handler에서 즉시 exit 0
- ULID 기반 traceId (UserPromptSubmit이 새 trace 시작)
- 전송 실패 시 `.plugin-data/failed-spans.jsonl` 큐에 적재 (cap 1000), 다음 hook 호출이 flush
- Pinta CLI(`pinta identity id/email`)로 member identity 해결, resource attribute로 부착

**확장 방향**:
- hook 라우팅 추가 (`hooks/hooks.json` + `src/handlers/`에 분기 추가)
- skip 목록 조정 (`src/core/types.ts`의 `SKIP_HOOKS` set)
- 새 attribute 키는 별도 enumerate 없이 hook event에 필드만 추가되면 자동 평탄화됨

## 주요 명령

```bash
npm install
npm run build         # tsc (dist/ 생성 — 로컬 검증용. repo 반영은 GitHub Actions가 담당)
npm run dev           # tsc --watch
npm run mock-server   # tools/mock-server.ts — 웹 UI로 이벤트 확인
```

테스트 프레임워크 없음. 동작 검증은 mock 서버 + `claude --plugin-dir <path>` 실행으로.

설정은 환경변수 전용(`CLAUDE_PLUGIN_OPTION_ENDPOINT`, `CLAUDE_PLUGIN_OPTION_API_KEY`). Claude Code가 `plugin.json`의 `userConfig`를 자동으로 이 환경변수에 매핑한다. 없으면 `loadConfig()`가 throw하지만 `src/index.ts`가 catch 후 exit 0으로 종료 → **조용히 비활성화**. 로컬 테스트는 direnv(`.envrc`)로 환경변수 주입.

## 아키텍처의 핵심

### 실행 모델 — "hook 호출마다 새 Node 프로세스"

Claude Code가 hook 이벤트마다 `node dist/index.js`를 새로 spawn. **in-memory 상태 공유 불가**:
- 프로세스 간 상태는 전부 파일(`.plugin-data/*.json`)
- OTLP BatchSpanProcessor 같은 장기 배치 로직 불가
- 외부 데몬·sidecar는 도입하지 않는다

### 엔트리 플로우 (`src/index.ts`)

1. stdin → JSON 파싱 → 타입 가드로 분기 (`src/core/types.ts`)
2. 매칭 handler 실행 → exit code / stdout 반환
3. 최상위 catch-all에서 exit 0 강제 — 플러그인 오류가 Claude Code UX를 깨뜨리지 않도록 fail-open. 단 PreToolUse 차단은 의도적으로 exit 2.

### Identity 검증 로직 (`src/handlers/pre-tool-use.ts`)

1. `Transport.flush()` — 큐에 쌓인 실패 payload를 best-effort로 재전송
2. `identityResolver.resolve()` — Pinta CLI 호출
   - 실패 시 stdout으로 `HookBlockOutput`(영문 안내 메시지) + exit 2
3. `buildOtlpPayload({ event, traceId, identity })` → `Transport.send()` → exit 0

서버 규칙 평가는 더 이상 클라이언트 책임이 아니다. fail-close는 identity 미해결에 한정.

### 파일 기반 상태 (`.plugin-data/`)

- `trace.json` — 현재 ULID traceId (`TraceManager`)
- `failed-spans.jsonl` — 전송 실패 OTLP payload 큐 (`RetryQueue`, JSONL, cap 1000)
- `failed-spans.jsonl.lock` — 큐 동시 접근 방지 lock (best-effort, 30초 stale TTL)

`CLAUDE_PLUGIN_DATA`로 경로 override 가능. 과거 `rules.json` / `health.json`은 더 이상 생성되지 않는다.

### Trace ID 계약

- `UserPromptSubmit` 핸들러만 `newTrace()` 호출 → 새 ULID 저장
- 이후 PreToolUse / PostToolUse는 `currentTrace()`로 동일 ID 재사용
- **한 사용자 턴 = 하나의 traceId**. 이 계약을 깨지 말 것.

### OTLP 전송 (`src/core/transport.ts`)

- `POST {endpoint}/traces` — OTLP/HTTP JSON 본문, header `x-api-key: <api_key>`, timeout 5s
- 단일 hook 이벤트 = `resourceSpans` 1개 = `scopeSpans` 1개 = `span` 1개
- 전송 실패 시 payload를 `failed-spans.jsonl`에 enqueue, 다음 hook이 batch flush
- `buildOtlpPayload()`는 hook event의 모든 top-level key를 `cc.<key>` 속성으로 평탄화 (Bronze)

서버는 `api_key`로 사용자/조직을 판정하고 trace 저장 + 비동기 issue detection을 수행한다.
플러그인은 server-side rule을 더 이상 pull하지 않는다.

## 새 기능 추가 체크리스트

기능을 구상할 때 매번 자문:

1. **이 기능은 OSS로도 재사용 가능한가, Enterprise 전용인가?** 재사용 가능이면 `src/core/` 또는 `src/handlers/`에 둔다. Enterprise 전용(예: Pinta CLI 의존, Pinta 백엔드 특정 스키마)이면 `src/enterprise/`에 둔다.
2. **Enterprise 코드가 core를 import하는 방향만 유지되는가?** `core → enterprise` 방향의 import가 생기면 미래 OSS 플러그인 파생이 깨진다.
3. **Core 인터페이스가 enterprise 구현체를 DI로 받는 형태인가?** `src/index.ts`의 와이어링 지점에서 구현체를 교체할 수 있어야 OSS 파생 시 `NoOp`/`EnvVar` 같은 대체 구현으로 자연스럽게 바꿀 수 있다.

## 새 hook 이벤트 추가

`hooks/hooks.json`의 모든 hook이 `dist/index.js`로 라우팅된다. 새 이벤트를 지원하려면 네 곳 수정:
1. `hooks/hooks.json`에 엔트리
2. `src/core/types.ts`에 interface + type guard
3. `src/handlers/`에 핸들러 (또는 `default.ts` 활용)
4. `src/index.ts`의 분기

## 배포 시 체크리스트

- [ ] `dist/`는 GitHub Actions가 push 시 자동 빌드·커밋 (로컬에서 별도 커밋 불필요)
- [ ] `plugin.json` / `marketplace.json`의 version 업데이트 (같은 버전이면 Claude Code가 업데이트로 인식하지 않음)
- [ ] README와 `src/core/transport.ts`의 endpoint 경로가 일치하는지 (과거 불일치 이력 있음)
- [ ] OTLP attribute 키 변경이 있었다면, backend parser와의 호환성을 먼저 확인

## Cross-project 맥락

상위 `pinta-ai/CLAUDE.md`의 결합 정책을 따른다. OTLP wire format은 `aware-backend`의 `/traces` 엔드포인트와 Tight하게 묶이므로 span attribute 키 변경 시 backend parser 영향을 먼저 확인할 것. `mcp-logger`와 동일 wire format을 사용한다.
