# Pinta

Claude Code 보안 모니터링 플러그인 -- 모든 이벤트를 캡처하고 서버 관리 규칙으로 도구 사용을 제어합니다.

## 주요 기능

- **전체 이벤트 캡처**: 프롬프트, 도구 요청/응답, 세션, 알림 등 14종 이벤트를 보안 서버로 전송
- **도구 차단**: 서버에서 관리하는 규칙으로 특정 도구 사용을 차단 (PreToolUse hook)
- **Fail-Close**: 보안 서버 연결 불가 시 모든 도구 사용을 차단
- **트레이스 추적**: 사용자 턴 단위로 ULID 기반 `traceId`를 부여하여 이벤트 흐름 추적
- **로컬 룰 캐싱**: 서버 규칙을 5분 TTL로 로컬 캐시하여 성능 최적화

## 설치

### GitHub에서 설치

```bash
claude plugin install github:your-org/pinta-plugin
```

### 로컬 디렉토리로 설치

```bash
claude --plugin-dir /path/to/pinta-plugin
```

## 설정

플러그인 설치 후 Claude Code에서 설정값을 입력합니다:

| 설정 | 설명 | 필수 |
|------|------|------|
| `server_url` | 보안 서버 URL (e.g. `https://security.company.com`) | O |
| `auth_token` | 서버 인증 토큰 | O |

## 아키텍처

```
src/
├── index.ts              # 엔트리포인트 (stdin 파싱 → 핸들러 라우팅 → stdout/exit code)
├── core/
│   ├── types.ts          # 이벤트 타입, 타입 가드, 인터페이스
│   ├── config.ts         # 환경변수 + env.json 로드
│   ├── client.ts         # HTTP 클라이언트 (retry 3회, timeout 5s)
│   ├── health.ts         # 서버 헬스 관리 (3회 연속 실패 → 다운 판정)
│   ├── cache.ts          # 규칙 캐시 (5분 TTL, 와일드카드 매칭)
│   └── trace.ts          # traceId 관리 (ULID 생성, 파일 기반 공유)
├── handlers/
│   ├── pre-tool-use.ts   # 헬스 체크 → 규칙 매칭 → 차단/허용
│   ├── post-tool-use.ts  # 도구 실행 결과 전송
│   ├── user-prompt.ts    # 새 traceId 생성 + 이벤트 전송
│   ├── session.ts        # 세션 시작/종료 처리
│   └── default.ts        # 기타 이벤트 전송
```

### 이벤트 흐름

```
UserPromptSubmit (새 traceId 생성)
  → PreToolUse (규칙 체크 → 허용/차단)
  → PostToolUse (결과 전송)
  → PreToolUse → PostToolUse → ...
UserPromptSubmit (다음 턴, 새 traceId)
  → ...
```

### 캡처 이벤트 목록

PreToolUse, PostToolUse, PostToolUseFailure, UserPromptSubmit, SessionStart, SessionEnd, PermissionRequest, PermissionDenied, Notification, SubagentStart, SubagentStop, Stop, TaskCreated, TaskCompleted

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

1. `env.json`을 프로젝트 루트에 생성:

```json
{
  "server_url": "http://localhost:3000",
  "auth_token": "test-token"
}
```

2. Mock 서버 실행:

```bash
npm run mock-server
```

3. 브라우저에서 `http://localhost:3000` 접속하여 이벤트 로그 확인

4. 다른 터미널에서 Claude Code를 플러그인과 함께 실행:

```bash
claude --plugin-dir /path/to/pinta-plugin
```

Mock 서버 웹 UI에서 세션별, 트레이스별로 그룹핑된 이벤트를 확인하고, 각 이벤트 클릭 시 상세 정보(도구 입력/응답, 페이로드, Raw JSON)를 볼 수 있습니다.

## 서버 API

Pinta가 기대하는 서버 엔드포인트:

| Method | Path | 설명 |
|--------|------|------|
| `GET` | `/health` | 서버 헬스 체크 |
| `GET` | `/rules` | 차단 규칙 목록 반환 (`{ rules, version }`) |
| `POST` | `/events` | 이벤트 수신 |

### 규칙 형식

```json
{
  "rules": [
    { "tool": "Bash", "action": "block", "reason": "Bash 사용이 차단되었습니다" },
    { "tool": "*", "action": "allow" }
  ],
  "version": "1"
}
```

## 라이선스

MIT
