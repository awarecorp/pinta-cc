import type { PintaConfig } from "../core/config.js";
import type { PreToolUseEvent, HookBlockOutput } from "../core/types.js";
import type { IdentityResolver } from "../core/identity.js";
import type { GuardClient } from "../core/guard.js";
export interface PreToolUseResult {
    exitCode: number;
    output: HookBlockOutput | null;
}
export declare function handlePreToolUse(event: PreToolUseEvent, config: PintaConfig, identityResolver: IdentityResolver, guardClient: GuardClient): Promise<PreToolUseResult>;
