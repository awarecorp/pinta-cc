# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## 프로젝트 정체성

이 repo는 **Claude Code 플러그인**이다. Claude Code가 정의한 hook 규격을 따르고, Claude Code marketplace + `/plugin install` 흐름으로 배포된다.

**제품 포지셔닝**: OSS/Enterprise가 **같은 플러그인, 같은 바이너리**다. 단일 repo, 단일 배포 산출물. 차별화는 사용자가 연결하는 **서버 측**에서 일어난다. 따라서:

- OSS 사용자 — 임의 endpoint(`endpoint` + `api_key`)에 붙여 이벤트 전송 + 기본 rule 기반 차단을 그대로 사용
- Enterprise 사용자 — 같은 플러그인을 사내 Pinta 서버에 붙이면 고급 rule bundle / audit / SSO-scoped policy / 중앙 정책 배포 등이 자동으로 활성화됨 (전부 서버가 내려주는 데이터로 작동)

플러그인 코드에는 `if (enterprise) { ... }` 같은 tier 분기가 **없다**. 플러그인은 "서버가 내려주는 규칙/지시를 충실히 평가하는 런타임"이고, OSS와 EE의 차이는 **서버가 어떤 규칙·지시를 내려주느냐**로만 구분된다.

## 이게 어떻게 작동하나

```
사용자 설정:  endpoint + api_key
            ↓ (매 세션 / 5분 TTL)
플러그인:    GET /api/rules   → 서버가 tier에 맞는 규칙 반환
            POST /api/events → 이벤트 전송 (tier별로 서버가 후처리)
            ↓
- 기본 서버:  toolName 기반 간단 규칙만 반환
- 사내 서버:  arg regex, path 검사, 서명 bundle, audit 지시 등 풍부한 규칙 반환
```

**결론**: 플러그인 진화 = "rule/event 스키마가 풍부해지는 것" + "그 스키마를 평가할 런타임이 늘어나는 것". 기능 추가 시 항상 "서버가 이걸 내려주기만 하면 이 플러그인은 해석할 수 있다"가 되도록 설계.

### 그러므로 repo 분리 / side-by-side / 데몬 / npm 의존 분기 = 불필요

- 플러그인 marketplace는 startup 시 자동 업데이트 + managed settings로 버전 pinning(`sha`)을 지원 → **배포 갱신은 marketplace가 전담**
- 외부 데몬·sidecar·사용자 측 빌드 단계를 만들지 않는다
- `dist/`는 GitHub Actions가 빌드·커밋한다 (로컬 `dist/`는 `.gitignore` 대상). 사용자 측 빌드 단계는 없다

### 단, 민감 로직을 플러그인에 숨겨야 할 필요가 생기면

현재 정책상으로는 **없음**. 모든 차별화가 서버 데이터로 표현 가능하다는 전제. 만약 플러그인 내부에 공개 불가한 로직(예: 고유 탐지 알고리즘)이 생기면 그때 private marketplace + closed-source 배포를 검토한다. 선제적으로 repo를 쪼개지 않는다.

## 기능 범위 (현재 구현)

14종 Claude Code hook 이벤트를 캡처해 서버의 `/api/events`로 전송하고, PreToolUse에서 서버 규칙(`/api/rules`)에 따라 도구 사용을 차단한다.

- 이벤트 전송 (14종 hook → 단일 엔트리)
- toolName 기반 rule 차단 + 5분 TTL 로컬 캐시
- 서버 헬스 관리 (3회 연속 실패 시 fail-close, 모든 도구 차단)
- ULID 기반 traceId (한 사용자 턴 = 한 traceId)

**확장 방향**(전부 "서버 스키마 + 평가 런타임" 축):
- rule 스키마에 arg regex / path pattern / session context 조건 추가
- 서명된 rule bundle 검증(서명 키는 서버 소유)
- audit 전용 이벤트 타입 추가
- 전부 OSS 코드로 구현되고, OSS 서버가 안 내려주면 그냥 안 쓰일 뿐

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

### PreToolUse 차단 로직 (`src/handlers/pre-tool-use.ts`)

1. `HealthManager.isServerUp()` — 서버 다운이면 **즉시 전부 차단** (fail-close)
2. `RuleCacheManager.isExpired()` (TTL 5분) 시에만 `/api/rules` 요청
3. 매칭 규칙이 `block`이면 exit 2 + `HookBlockOutput` stdout
4. 모든 경로에서 이벤트는 `sendEventAsync`(실패 무시)로 전송

**Fail-close와 fail-open이 공존**: 차단 판단은 fail-close, 로깅은 fail-open, 최상위 예외는 fail-open.

### 파일 기반 상태 (`.plugin-data/`)

- `rules.json` — 서버 규칙 + lastSynced (`RuleCacheManager`, TTL 5분)
- `health.json` — 연속 실패 카운트 (`HealthManager`, 3회 실패 = 다운 판정)
- `trace.json` — 현재 ULID traceId (`TraceManager`)

`CLAUDE_PLUGIN_DATA`로 경로 override 가능, 기본 `<pluginRoot>/.plugin-data/`.

### Trace ID 계약

- `UserPromptSubmit` 핸들러만 `newTrace()` 호출 → 새 ULID 저장
- 이후 PreToolUse / PostToolUse는 `currentTrace()`로 동일 ID 재사용
- **한 사용자 턴 = 하나의 traceId**. 이 계약을 깨지 말 것.

### 서버 API 계약 (`src/core/client.ts`)

- `POST /api/events` — 재시도 3회 + exponential backoff
- `GET /api/rules` — `{ rules, version }` 반환
- `GET /api/health` — 서버 상태 확인
- 전 요청 5s timeout, `Authorization: Bearer <api_key>`
- `buildEvent()` 헬퍼로 모든 핸들러의 이벤트 객체를 단일 지점에서 생성

서버는 `api_key`로 사용자/조직의 tier를 판정하고 그에 맞는 rule 스키마를 내려준다. 플러그인은 tier를 묻지 않는다.

## 새 기능 추가 체크리스트

기능을 구상할 때 매번 자문:

1. **이게 플러그인 런타임 능력인가, 서버 데이터인가?** 런타임 능력(새 rule 타입 평가, 새 event 생성)은 OSS 코드에 그대로 들어간다. 데이터/정책(실제 rule 내용)은 서버 영역.
2. **OSS 서버가 안 내려줘도 플러그인이 조용히 넘어가나?** 즉 rule/event 스키마는 **addition-only**로 설계. 새 필드가 없으면 기본값·skip.
3. **서버가 내려주는 rule 없이도 플러그인이 의미 있는 일을 하나?** OSS 사용자는 자기 서버를 직접 운영하기도 하므로 기본 동작은 항상 정의.

## 새 hook 이벤트 추가

`hooks/hooks.json`의 14종 모두 `dist/index.js`로 라우팅된다. 새 이벤트를 지원하려면 네 곳 수정:
1. `hooks/hooks.json`에 엔트리
2. `src/core/types.ts`에 interface + type guard
3. `src/handlers/`에 핸들러 (또는 `default.ts` 활용)
4. `src/index.ts`의 분기

## 배포 시 체크리스트

- [ ] `dist/`는 GitHub Actions가 push 시 자동 빌드·커밋 (로컬에서 별도 커밋 불필요)
- [ ] `plugin.json` / `marketplace.json`의 version 업데이트 (같은 버전이면 Claude Code가 업데이트로 인식하지 않음)
- [ ] README와 `src/core/client.ts`의 API 경로가 일치하는지 (과거 불일치 이력 있음)
- [ ] rule/event 스키마 변경이 있었다면, 구버전 서버와도 호환되는지(addition-only) 확인

## Cross-project 맥락

상위 `pinta-ai/CLAUDE.md`의 결합 정책을 따른다. 이벤트 스키마는 `aware-backend`의 `/api/events`와 Tight하게 묶이므로 필드 변경 시 소비 측 영향을 먼저 확인할 것. 이 플러그인은 `pinta-types` 공유 타입을 쓰지 않고 자체 `src/core/types.ts`를 유지한다.
