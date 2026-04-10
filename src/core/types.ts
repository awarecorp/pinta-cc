// --- Claude Code hook event types ---

export interface BaseEvent {
  session_id: string;
  transcript_path: string;
  cwd: string;
  permission_mode: string;
  hook_event_name: string;
}

export interface PreToolUseEvent extends BaseEvent {
  hook_event_name: "PreToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_use_id: string;
}

export interface PostToolUseEvent extends BaseEvent {
  hook_event_name: "PostToolUse";
  tool_name: string;
  tool_input: Record<string, unknown>;
  tool_response: unknown;
  tool_use_id: string;
}

export interface UserPromptSubmitEvent extends BaseEvent {
  hook_event_name: "UserPromptSubmit";
  prompt: string;
}

export interface SessionEvent extends BaseEvent {
  hook_event_name: "SessionStart" | "SessionEnd";
}

export type HookEvent =
  | PreToolUseEvent
  | PostToolUseEvent
  | UserPromptSubmitEvent
  | SessionEvent
  | BaseEvent;

// --- Type guards ---

export function isPreToolUseEvent(event: BaseEvent): event is PreToolUseEvent {
  return event.hook_event_name === "PreToolUse";
}

export function isPostToolUseEvent(event: BaseEvent): event is PostToolUseEvent {
  return event.hook_event_name === "PostToolUse";
}

export function isUserPromptSubmitEvent(event: BaseEvent): event is UserPromptSubmitEvent {
  return event.hook_event_name === "UserPromptSubmit";
}

export function isSessionEvent(event: BaseEvent): event is SessionEvent {
  return event.hook_event_name === "SessionStart" || event.hook_event_name === "SessionEnd";
}

// --- Server communication types ---

export interface PintaEvent {
  eventId: string;
  traceId: string;
  timestamp: string;
  sessionId: string;
  eventType: string;
  toolName?: string;
  payload: HookEvent;
}

// --- Rule types ---

export interface Rule {
  id: string;
  action: "block" | "allow";
  toolName: string;
  condition?: string;
  reason: string;
}

export interface RuleCache {
  rules: Rule[];
  lastSynced: string;
  serverVersion: string;
}

// --- Health types ---

export interface HealthState {
  serverUp: boolean;
  lastChecked: string;
  consecutiveFailures: number;
}

// --- Hook output types ---

export interface HookBlockOutput {
  hookSpecificOutput: {
    hookEventName: "PreToolUse";
    permissionDecision: "deny";
    permissionDecisionReason: string;
  };
}
