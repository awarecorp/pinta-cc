import type { Identity, IdentityResolver } from "../core/identity.js";
export declare class PintaIdentityResolver implements IdentityResolver {
    resolve(): Promise<Identity | null>;
}
