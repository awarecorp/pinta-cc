"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.PintaIdentityResolver = void 0;
const child_process_1 = require("child_process");
const CLI_TIMEOUT_MS = 2000;
function runCli(arg) {
    try {
        const r = (0, child_process_1.spawnSync)("pinta", ["identity", arg], {
            timeout: CLI_TIMEOUT_MS,
            encoding: "utf-8",
        });
        if (r.error)
            return null;
        if (r.status !== 0)
            return null;
        const out = (r.stdout ?? "").trim();
        return out.length === 0 ? null : out;
    }
    catch {
        return null;
    }
}
class PintaIdentityResolver {
    async resolve() {
        const id = runCli("id");
        const email = runCli("email");
        if (!id || !email)
            return null;
        return { id, email };
    }
}
exports.PintaIdentityResolver = PintaIdentityResolver;
//# sourceMappingURL=pinta-identity.js.map