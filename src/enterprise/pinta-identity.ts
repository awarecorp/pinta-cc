import { spawnSync } from "child_process";
import type { Identity, IdentityResolver } from "../core/identity.js";

const CLI_TIMEOUT_MS = 2000;

function runCli(arg: "id" | "email"): string | null {
  try {
    const r = spawnSync("pinta", ["identity", arg], {
      timeout: CLI_TIMEOUT_MS,
      encoding: "utf-8",
    });
    if (r.error) return null;
    if (r.status !== 0) return null;
    const out = (r.stdout ?? "").trim();
    return out.length === 0 ? null : out;
  } catch {
    return null;
  }
}

export class PintaIdentityResolver implements IdentityResolver {
  async resolve(): Promise<Identity | null> {
    const id = runCli("id");
    const email = runCli("email");
    if (!id || !email) return null;
    return { id, email };
  }
}
