import type { PintaConfig } from "../core/config.js";
import type { PostToolUseEvent, PostToolUseFailureEvent } from "../core/types.js";
export declare function handlePostToolUse(event: PostToolUseEvent | PostToolUseFailureEvent, config: PintaConfig): Promise<number>;
