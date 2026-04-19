"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
exports.authRequiredMessage = authRequiredMessage;
const MESSAGE = `[pinta-cc] Authentication required: Pinta CLI identity not available.

To resolve:
  1. Install the Pinta CLI:
     curl -fsSL https://raw.githubusercontent.com/awarecorp/aware-cli/main/install.sh | sh
  2. Log in:
     pinta login
  3. (Optional) Check:
     pinta identity id

Once authenticated, retry your action.
`;
/** Returns the message with a trailing newline — suitable for stderr write or stdout body. */
function authRequiredMessage() {
    return MESSAGE;
}
//# sourceMappingURL=auth-message.js.map