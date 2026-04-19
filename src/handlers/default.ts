import type { BaseEvent } from "../core/types.js";

/**
 * Catch-all for hooks we explicitly skip (Notification, TaskCreated, TaskCompleted)
 * and any future hook event we have not yet routed. Exits 0 silently.
 */
export async function handleDefault(_event: BaseEvent): Promise<number> {
  return 0;
}
