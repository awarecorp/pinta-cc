import type { PintaConfig } from "../core/config.js";
import type { SubagentEvent } from "../core/types.js";
import type { IdentityResolver } from "../core/identity.js";
export declare function handleSubagent(event: SubagentEvent, config: PintaConfig, identityResolver: IdentityResolver): Promise<number>;
