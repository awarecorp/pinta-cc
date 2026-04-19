"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.handleDefault = handleDefault;
/**
 * Catch-all for hooks we explicitly skip (Notification, TaskCreated, TaskCompleted)
 * and any future hook event we have not yet routed. Exits 0 silently.
 */
async function handleDefault(_event) {
    return 0;
}
//# sourceMappingURL=default.js.map