import type { PintaConfig } from "../core/config.js";
import type { StopEvent } from "../core/types.js";
import type { IdentityResolver } from "../core/identity.js";
export declare function handleStop(event: StopEvent, config: PintaConfig, identityResolver: IdentityResolver): Promise<number>;
