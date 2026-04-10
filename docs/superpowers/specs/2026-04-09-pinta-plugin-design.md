# Pinta Plugin Design Spec

Claude Code 보안 플러그인. 모든 이벤트를 서버로 전송하고, 서버 관리 룰 기반으로 부적절한 도구 사용을 차단한다.

## 아키텍처 개요

```
┌─────────────────────────────────────────────────┐
│                  Claude Code                     │
│                                                  │
│  [이벤트 발생] ──→ hooks.json ──→ pinta handler  │
└──────────────────────┬──────────────────────────┘
                       │
                       ▼
              ┌─────────────────┐
              │   pinta plugin  │
              │                 │
              │  ┌───────────┐  │
              │  │ handlers/ │  │  ← 이벤트별 처리
              │  └─────┬─────┘  │
              │        │        │
              │  ┌─────▼─────┐  │
              │  │   core/   │  │  ← HTTP 전송, 룰 캐시, 헬스체크
              │  └─────┬─────┘  │
              └────────┼────────┘
                       │
          ┌────────────┼────────────┐
          ▼            ▼            ▼
   [로컬 룰 캐시]  [서버 전송]   [헬스체크]
```

### 동작 흐름

1. Claude Code에서 이벤트 발생 → hooks.json이 `node dist/index.js` 실행
2. `index.ts`가 stdin에서 이벤트를 읽고 `hook_event_name`으로 적절한 handler에 라우팅
3. **PreToolUse**: 로컬 캐시된 룰로 즉시 허용/차단 판단 + 서버에 비동기 로깅
4. **나머지 이벤트**: 서버에 비동기 전송 (fire-and-forget)
5. **서버 다운 시**: 모든 도구 차단 (fail-close)

## 디렉토리 구조

```
pinta-plugin/
├── .claude-plugin/
│   └── plugin.json              # 매니페스트
├── hooks/
│   └── hooks.json               # 이벤트 → handler 매핑
├── src/
│   ├── core/
│   │   ├── client.ts            # HTTP 클라이언트 (전송, 재시도, 타임아웃)
│   │   ├── cache.ts             # 룰 캐시 (로드, 동기화, 만료 체크)
│   │   ├── health.ts            # 서버 헬스체크 (상태 파일 관리)
│   │   └── types.ts             # 공통 타입 정의
│   ├── handlers/
│   │   ├── pre-tool-use.ts      # 차단 판단 + 로깅
│   │   ├── post-tool-use.ts     # 실행 결과 로깅
│   │   ├── user-prompt.ts       # 사용자 입력 로깅
│   │   ├── session.ts           # 세션 시작/종료
│   │   └── default.ts           # 기타 이벤트 공통 처리
│   └── index.ts                 # 엔트리포인트 (이벤트 라우팅)
├── tsconfig.json
├── package.json
├── README.md
└── LICENSE
```

## 컴포넌트 상세

### core/client.ts — HTTP 클라이언트

서버 통신 전담 모듈.

- 비동기 HTTP POST 전송 (Node.js native `fetch`)
- 재시도: 3회, exponential backoff (1s, 2s, 4s)
- 타임아웃: 5초
- 인증: `Authorization: Bearer <token>` 헤더
- 서버 URL과 토큰은 `userConfig`에서 환경변수로 주입됨
  - `${CLAUDE_PLUGIN_OPTION_SERVER_URL}`
  - `${CLAUDE_PLUGIN_OPTION_AUTH_TOKEN}`

### core/cache.ts — 룰 캐시

서버에서 관리하는 차단/허용 룰을 로컬에 캐싱.

- 저장 경로: `${CLAUDE_PLUGIN_DATA}/rules.json`
- 동기화 시점: 세션 시작 시 + 5분 간격 (이벤트 처리 시 만료 체크)
- 캐시 만료: `lastSynced`로부터 5분 초과 시

```typescript
interface RuleCache {
  rules: Rule[];
  lastSynced: string;
  serverVersion: string;
}

interface Rule {
  id: string;
  action: "block" | "allow";
  toolName: string;          // glob 패턴 ("Write", "Bash", "*")
  condition?: string;        // 선택적 조건 (경로 패턴 등)
  reason: string;            // 차단 시 사용자에게 표시할 메시지
}
```

룰 매칭 순서:
1. 도구 이름이 `toolName` 패턴과 매치되는 룰 필터링
2. `condition`이 있으면 추가 조건 체크
3. 명시적 `block` 매치 → 차단
4. 명시적 `allow` 매치 → 허용
5. 매치 없음 → 기본 허용

### core/health.ts — 헬스체크

서버 가용성 추적.

- 저장 경로: `${CLAUDE_PLUGIN_DATA}/health.json`
- 매 이벤트 전송 시 응답 결과로 상태 갱신
- 3회 연속 실패 → `serverUp = false` → 전체 차단 모드
- 세션 시작 시 즉시 헬스체크

```typescript
interface HealthState {
  serverUp: boolean;
  lastChecked: string;
  consecutiveFailures: number;
}
```

### core/types.ts — 타입 정의

이벤트별 stdin 페이로드 타입.

```typescript
// 공통 베이스
interface BaseEvent {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
}

// PreToolUse
interface PreToolUseEvent extends BaseEvent {
  hook_event_name: "PreToolUse";
  tool_name: string;
  tool_input: ToolInput;
  tool_use_id: string;
}

// PostToolUse
interface PostToolUseEvent extends BaseEvent {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_input: ToolInput;
  tool_response: unknown;
  tool_use_id: string;
}

// UserPromptSubmit
interface UserPromptSubmitEvent extends BaseEvent {
  hook_event_name: "UserPromptSubmit";
  prompt: string;
}

// SessionStart / SessionEnd
interface SessionEvent extends BaseEvent {
  hook_event_name: "SessionStart" | "SessionEnd";
}

// 도구별 input discriminated union
type ToolInput =
  | { tool: "Bash"; command: string; description?: string; timeout?: number; run_in_background?: boolean }
  | { tool: "Write"; file_path: string; content: string }
  | { tool: "Edit"; file_path: string; old_string: string; new_string: string; replace_all?: boolean }
  | { tool: "Read"; file_path: string; offset?: number; limit?: number }
  | { tool: "Glob"; pattern: string; path?: string }
  | { tool: "Grep"; pattern: string; path?: string; glob?: string; output_mode?: string }
  | { tool: "WebFetch"; url: string; prompt?: string }
  | { tool: "WebSearch"; query: string }
  | { tool: "Agent"; prompt: string; description?: string; subagent_type?: string; model?: string }
  | { tool: string; [key: string]: unknown };  // MCP 도구 등 기타

type HookEvent =
  | PreToolUseEvent
  | PostToolUseEvent
  | UserPromptSubmitEvent
  | SessionEvent
  | BaseEvent;  // 기타 이벤트 fallback
```

서버 전송 페이로드:

```typescript
interface PintaEvent {
  eventId: string;           // crypto.randomUUID()
  timestamp: string;         // ISO 8601
  sessionId: string;         // event.session_id
  eventType: string;         // event.hook_event_name
  toolName?: string;         // 도구 이벤트일 때
  payload: HookEvent;        // 이벤트 원본 데이터
}
```

## 핸들러 상세

### handlers/pre-tool-use.ts

가장 중요한 핸들러. 차단 판단 로직:

```
1. health.ts로 서버 상태 확인
   └─ serverUp === false → stdout JSON 출력 + exit 2
      { "decision": "block", "reason": "보안 서버 연결 불가" }

2. cache.ts로 룰 매칭
   ├─ block 룰 매치 → stdout JSON 출력 + exit 2
   │  { "decision": "block", "reason": "<룰의 reason>" }
   ├─ allow 룰 매치 → exit 0
   └─ 매치 없음 → exit 0

3. client.ts로 서버에 비동기 전송 (결과 기다리지 않음)
```

exit code 규칙:
- `0`: 허용 (도구 실행 진행)
- `2`: 차단 (도구 실행 중단, stdout 메시지 표시)

### handlers/post-tool-use.ts

도구 실행 결과를 서버에 비동기 전송. exit 0.

### handlers/user-prompt.ts

사용자 입력을 서버에 비동기 전송. exit 0.

### handlers/session.ts

- SessionStart: 헬스체크 + 룰 캐시 동기화 + 세션 시작 이벤트 전송
- SessionEnd: 세션 종료 이벤트 전송

### handlers/default.ts

특별한 처리 없는 이벤트들의 공통 핸들러. 서버에 비동기 전송 후 exit 0.

## 플러그인 매니페스트

```json
{
  "name": "pinta",
  "description": "Security monitoring plugin - captures all Claude Code events and enforces server-managed access rules",
  "version": "1.0.0",
  "license": "MIT",
  "userConfig": {
    "server_url": {
      "description": "보안 서버 URL (e.g. https://security.company.com)",
      "sensitive": false
    },
    "auth_token": {
      "description": "서버 인증 토큰",
      "sensitive": true
    }
  }
}
```

## hooks.json

모든 이벤트를 단일 엔트리포인트로 라우팅:

```json
{
  "hooks": {
    "PreToolUse": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "PostToolUse": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "UserPromptSubmit": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "SessionStart": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "SessionEnd": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "PostToolUseFailure": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "PermissionRequest": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "PermissionDenied": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "Notification": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "SubagentStart": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "SubagentStop": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "Stop": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "TaskCreated": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }],
    "TaskCompleted": [{ "hooks": [{ "type": "command", "command": "node ${CLAUDE_PLUGIN_ROOT}/dist/index.js" }] }]
  }
}
```

## 빌드 & 배포

- TypeScript → `dist/`로 컴파일
- `dist/`를 포함해서 배포 (사용자 환경에서 빌드 불필요)
- 의존성: Node.js native만 사용 (`fetch`, `crypto`, `fs`, `path`) — 외부 패키지 없음

## 사용자 경험

| 상황 | 사용자 경험 |
|---|---|
| 평소 사용 | 차이 없음 (로깅은 비동기) |
| 차단된 도구 실행 시 | 보안 정책에 의해 차단됨: [사유] 메시지 표시 |
| 서버 다운 시 | 보안 서버 연결 불가 — 모든 도구 사용 차단 |
| 서버 복구 시 | 자동으로 정상 모드 복귀 |

## 서버 API 요구사항 (서버가 제공해야 할 엔드포인트)

| 엔드포인트 | 메서드 | 용도 |
|---|---|---|
| `/api/events` | POST | 이벤트 수신 |
| `/api/rules` | GET | 차단/허용 룰 목록 반환 |
| `/api/health` | GET | 서버 상태 확인 |
