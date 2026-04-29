import type { PintaConfig } from "../core/config.js";
import type { PermissionEvent } from "../core/types.js";
export declare function handlePermission(event: PermissionEvent, config: PintaConfig): Promise<number>;
