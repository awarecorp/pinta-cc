import type { PintaConfig } from "../core/config.js";
import type { PostToolUseEvent, PostToolUseFailureEvent } from "../core/types.js";
import type { IdentityResolver } from "../core/identity.js";
export declare function handlePostToolUse(event: PostToolUseEvent | PostToolUseFailureEvent, config: PintaConfig, identityResolver: IdentityResolver): Promise<number>;
