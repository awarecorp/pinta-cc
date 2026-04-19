import type { PintaConfig } from "../core/config.js";
import type { PreToolUseEvent, HookBlockOutput } from "../core/types.js";
import type { IdentityResolver } from "../core/identity.js";
export interface PreToolUseResult {
    exitCode: number;
    output: HookBlockOutput | null;
}
export declare function handlePreToolUse(event: PreToolUseEvent, config: PintaConfig, identityResolver: IdentityResolver): Promise<PreToolUseResult>;
