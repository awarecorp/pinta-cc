import type { PintaConfig } from "../core/config.js";
import type { UserPromptSubmitEvent } from "../core/types.js";
export declare function handleUserPrompt(event: UserPromptSubmitEvent, config: PintaConfig): Promise<number>;
