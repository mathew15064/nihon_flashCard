import { readFileSync } from "node:fs";
import { hashAdminPassword } from "../src/lib/admin-password";

// Read stdin only: no plaintext password in shell arguments or process list.
// Example: read -sr -p "Admin password: " P; printf '%s' "$P" | npm run admin:hash; unset P
try {
  if (process.stdin.isTTY) {
    throw new Error("Supply the password through stdin instead of typing it into this command");
  }
  const password = readFileSync(0, "utf8").replace(/[\r\n]+$/, "");
  console.log("NIHON_ADMIN_PASSWORD_HASH=" + hashAdminPassword(password));
} catch (error) {
  console.error(error instanceof Error ? error.message : "Invalid password");
  process.exitCode = 1;
}
