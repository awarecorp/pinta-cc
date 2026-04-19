import type { PintaConfig } from "../core/config.js";
import type { SessionEvent } from "../core/types.js";
import type { IdentityResolver } from "../core/identity.js";
export declare function handleSession(event: SessionEvent, config: PintaConfig, identityResolver: IdentityResolver): Promise<number>;
