import type { PintaConfig } from "../core/config.js";
import type { PermissionEvent } from "../core/types.js";
import type { IdentityResolver } from "../core/identity.js";
export declare function handlePermission(event: PermissionEvent, config: PintaConfig, identityResolver: IdentityResolver): Promise<number>;
