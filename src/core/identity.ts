export interface Identity {
  id: string;
  email: string;
}

export interface IdentityResolver {
  /**
   * Resolve the current member identity.
   * Returns null when no identity is available — handlers translate null
   * into the appropriate hook-failure exit code.
   */
  resolve(): Promise<Identity | null>;
}

export class NoOpIdentityResolver implements IdentityResolver {
  async resolve(): Promise<Identity | null> {
    return null;
  }
}
