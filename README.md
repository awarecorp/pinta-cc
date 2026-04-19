# Pinta

Claude Code 보안 모니터링 플러그인 — Claude Code hook 이벤트를 OTLP span으로 변환해 trace endpoint로 전송합니다. 정책 평가·issue detection은 서버 측에서 비동기로 수행됩니다.

## 주요 기능

- **OTLP 전송**: 11종 hook 이벤트를 OTLP/HTTP `resourceSpans`로 변환해 `POST {endpoint}/traces` 전송
- **Bronze 평탄화**: hook event의 모든 top-level 필드를 `cc.<key>` 속성으로 평탄화 (서버 parser가 그대로 소비)
- **Identity-only fail-close**: Pinta CLI identity가 해결되지 않으면 PreToolUse는 exit 2(deny), 그 외 hook은 exit 1
- **트레이스 추적**: 사용자 턴 단위로 ULID 기반 `traceId`를 부여 (UserPromptSubmit이 새 trace 시작)
- **재전송 큐**: 전송 실패 시 `.plugin-data/failed-spans.jsonl`에 적재(cap 1000), 다음 hook 호출이 batch flush

## 인증

이 플러그인은 Pinta CLI를 통해 member identity를 해결합니다. 사용 전에 CLI 설치·로그인이 필요합니다:

```bash
curl -fsSL https://raw.githubusercontent.com/awarecorp/aware-cli/main/install.sh | sh
pinta login
pinta identity id     # (선택) 확인
```

CLI가 없거나 로그인되지 않으면 PreToolUse는 차단(deny)되고, 그 외 hook은 stderr 안내 메시지 + exit 1 처리됩니다.

## 설치

### GitHub에서 설치

```bash
claude plugin install github:your-org/pinta-cc
```

### 로컬 디렉토리로 설치

```bash
claude --plugin-dir /path/to/pinta-cc
```

## 설정

플러그인 설치 후 Claude Code에서 설정값을 입력합니다:

| 설정 | 설명 | 필수 |
|------|------|------|
| `endpoint` | 보안 서버 URL (e.g. `https://security.company.com`) | O |
| `api_key` | 서버 API 키 | O |

## 아키텍처

```
src/
├── index.ts              # 엔트리포인트 (stdin 파싱 → DI 와이어링 → 핸들러 라우팅)
├── core/                 # OSS-reusable
│   ├── types.ts          # hook event 타입, 타입 가드, skip-list
│   ├── config.ts         # 환경변수 로드
│   ├── identity.ts       # IdentityResolver 인터페이스
│   ├── otlp.ts           # OTLP payload 빌더 + Bronze 평탄화 + ULID→traceId
│   ├── transport.ts      # POST {endpoint}/traces (timeout 5s) + retry-queue 글루
│   ├── retry-queue.ts    # 파일 기반 JSONL 큐 (cap 1000, 30s stale lock TTL)
│   └── trace.ts          # traceId 관리 (ULID 생성, 파일 기반 공유)
├── enterprise/           # Pinta 전용 (DI 시점에만 import)
│   └── pinta-identity.ts # PintaIdentityResolver — `pinta identity id/email` 호출
├── handlers/
│   ├── auth-message.ts   # 영문 안내 메시지 (auth 미해결 시)
│   ├── pre-tool-use.ts   # identity 검증 → 미해결 시 deny + exit 2
│   ├── post-tool-use.ts  # PostToolUse + PostToolUseFailure
│   ├── user-prompt.ts    # newTrace() + 전송
│   ├── session.ts        # SessionStart/SessionEnd
│   ├── subagent.ts       # SubagentStart/SubagentStop
│   ├── stop.ts           # Stop
│   ├── permission.ts     # PermissionRequest/PermissionDenied
│   └── default.ts        # skip-list (Notification 등) — 즉시 exit 0
```

### 이벤트 흐름

```
UserPromptSubmit (새 traceId 생성 → POST /traces)
  → PreToolUse (identity 확인 → POST /traces)
  → PostToolUse (POST /traces)
  → PreToolUse → PostToolUse → ...
UserPromptSubmit (다음 턴, 새 traceId)
  → ...
```

각 hook 호출은 새 Node 프로세스로 spawn되며, 1 hook = 1 OTLP span = `resourceSpans[0].scopeSpans[0].spans[0]`.

### 캡처 이벤트 목록

PreToolUse, PostToolUse, PostToolUseFailure, UserPromptSubmit, SessionStart, SessionEnd, PermissionRequest, PermissionDenied, SubagentStart, SubagentStop, Stop. (Notification, TaskCreated, TaskCompleted는 skip-list에서 즉시 exit 0)

## 개발

### 사전 요구사항

- Node.js 18+
- TypeScript 5.7+

### 빌드

```bash
npm install
npm run build
```

### 개발 모드

```bash
npm run dev  # tsc --watch
```

### Mock 서버로 테스트

1. 환경변수 설정 (둘 중 택일):

```bash
# 방법 A: direnv 사용 (.envrc 파일 생성 후 direnv allow)
echo 'export CLAUDE_PLUGIN_OPTION_ENDPOINT=http://localhost:3000
export CLAUDE_PLUGIN_OPTION_API_KEY=test-token' > .envrc
direnv allow

# 방법 B: 인라인 환경변수
CLAUDE_PLUGIN_OPTION_ENDPOINT=http://localhost:3000 \
CLAUDE_PLUGIN_OPTION_API_KEY=test-token \
claude --plugin-dir .
```

2. Mock 서버 실행:

```bash
npm run mock-server
```

3. 브라우저에서 `http://localhost:3000` 접속하여 이벤트 로그 확인

4. 다른 터미널에서 Claude Code를 플러그인과 함께 실행:

```bash
claude --plugin-dir /path/to/pinta-cc
```

Mock 서버 웹 UI에서 세션별, 트레이스별로 그룹핑된 이벤트를 확인하고, 각 이벤트 클릭 시 상세 정보(도구 입력/응답, 페이로드, Raw JSON)를 볼 수 있습니다.

## 서버 API

Pinta가 기대하는 endpoint:

| Method | Path | 설명 |
|--------|------|------|
| `POST` | `/traces` | OTLP/HTTP JSON `resourceSpans` 본문, `x-api-key: <api_key>` 헤더 |

요청 본문은 표준 OTLP traces 포맷이며, 서버는 `resourceSpans[].scopeSpans[].spans[]`를 순회해 trace 저장소에 적재한 뒤 비동기 issue detection을 수행합니다. 단일 hook 호출 = `resourceSpans` 1개 = span 1개. Retry-queue가 flush할 때는 여러 span이 단일 본문에 batched됩니다.

### Span attribute 규약

- `service.name = "claude-code"`, `service.version = <Claude Code CLI 버전>`
- `telemetry.sdk.name = "pinta-cc"`, `telemetry.sdk.version = <플러그인 버전>`
- `member.identity.id`, `member.identity.email` — Pinta CLI가 반환한 값
- `cc.hook = <HookEventName>`, 그 외 hook event의 모든 top-level 필드는 `cc.<key>`로 평탄화 (Bronze)

## 라이선스

MIT
