import type { PintaConfig } from "../core/config.js";
import type { SessionEvent } from "../core/types.js";
export declare function handleSession(event: SessionEvent, config: PintaConfig): Promise<number>;
