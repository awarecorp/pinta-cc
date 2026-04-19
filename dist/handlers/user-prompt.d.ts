import type { PintaConfig } from "../core/config.js";
import type { UserPromptSubmitEvent } from "../core/types.js";
import type { IdentityResolver } from "../core/identity.js";
export declare function handleUserPrompt(event: UserPromptSubmitEvent, config: PintaConfig, identityResolver: IdentityResolver): Promise<number>;
