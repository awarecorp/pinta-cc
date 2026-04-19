"use strict";
// --- Claude Code hook event types ---
Object.defineProperty(exports, "__esModule", { value: true });
exports.isPreToolUseEvent = isPreToolUseEvent;
exports.isPostToolUseEvent = isPostToolUseEvent;
exports.isUserPromptSubmitEvent = isUserPromptSubmitEvent;
exports.isSessionEvent = isSessionEvent;
exports.isSubagentEvent = isSubagentEvent;
exports.isStopEvent = isStopEvent;
exports.isPermissionEvent = isPermissionEvent;
exports.isSkippedHook = isSkippedHook;
// --- Type guards ---
function isPreToolUseEvent(event) {
    return event.hook_event_name === "PreToolUse";
}
function isPostToolUseEvent(event) {
    return (event.hook_event_name === "PostToolUse" || event.hook_event_name === "PostToolUseFailure");
}
function isUserPromptSubmitEvent(event) {
    return event.hook_event_name === "UserPromptSubmit";
}
function isSessionEvent(event) {
    return event.hook_event_name === "SessionStart" || event.hook_event_name === "SessionEnd";
}
function isSubagentEvent(event) {
    return event.hook_event_name === "SubagentStart" || event.hook_event_name === "SubagentStop";
}
function isStopEvent(event) {
    return event.hook_event_name === "Stop";
}
function isPermissionEvent(event) {
    return (event.hook_event_name === "PermissionRequest" || event.hook_event_name === "PermissionDenied");
}
// --- Skip-list (route to default no-op handler) ---
const SKIP_HOOKS = new Set(["Notification", "TaskCreated", "TaskCompleted"]);
function isSkippedHook(event) {
    return SKIP_HOOKS.has(event.hook_event_name);
}
//# sourceMappingURL=types.js.map