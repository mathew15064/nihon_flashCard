import { test } from "node:test";
import assert from "node:assert/strict";
import { createHash, createHmac } from "node:crypto";
import { DatabaseSync } from "node:sqlite";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { hashAdminPassword } from "../src/lib/admin-password";

test("Admin and learner sessions rotate, expire and revoke on logout in SQLite", async () => {
  const dir = mkdtempSync(join(tmpdir(), "nihon-revocable-auth-"));
  const filename = join(dir, "sessions.sqlite");
  const setup = new DatabaseSync(filename);
  for (const file of [
    "001_init.sql", "002_legacy_import.sql", "003_ai_studio.sql",
    "004_srs_learning.sql", "005_learner_accounts.sql", "006_auth_sessions.sql",
  ]) setup.exec(readFileSync(resolve("src/db/migrations", file), "utf8"));
  setup.close();

  const vars = ["DB_PATH", "AUTH_SECRET", "NIHON_ADMIN_PASSWORD_HASH",
    "NIHON_ENABLE_SIGNUP", "NODE_ENV", "PUBLIC_ORIGIN"] as const;
  const old = Object.fromEntries(vars.map(key => [key, process.env[key]]));
  process.env.DB_PATH = filename;
  process.env.AUTH_SECRET = "test-session-secret-that-is-long-enough-123456";
  process.env.NIHON_ADMIN_PASSWORD_HASH = hashAdminPassword("test-admin-password-12345");
  process.env.NIHON_ENABLE_SIGNUP = "true";
  process.env.NODE_ENV = "test";
  delete process.env.PUBLIC_ORIGIN;

  const origin = "http://localhost:80";
  const getCookie = (response: { headers: Record<string, unknown> }) => {
    const header = response.headers["set-cookie"];
    assert.ok(header);
    return (Array.isArray(header) ? header[0] : String(header)).split(";")[0] as string;
  };
  try {
    const { buildApp } = await import("../src/server/app");
    const app = await buildApp({ staticAssets: false });
    const sqlite = new DatabaseSync(filename);
    try {
      const login = (cookie?: string) => app.inject({
        method: "POST", url: "/api/v1/auth/admin/login",
        headers: { origin, ...(cookie ? { cookie } : {}) },
        payload: { password: "test-admin-password-12345" },
      });
      const first = await login();
      assert.equal(first.statusCode, 200);
      const firstCookie = getCookie(first);
      assert.match(firstCookie, /^nihon_auth=v2\./);
      const firstToken = firstCookie.slice("nihon_auth=".length);
      const digest = createHash("sha256").update("nihon-auth-session:" + firstToken).digest("hex");
      const stored = sqlite.prepare("SELECT * FROM auth_sessions").all() as {
        token_hash: string; actor_id: string; expires_at: string;
      }[];
      assert.equal(stored.length, 1);
      assert.equal(stored[0]?.token_hash, digest);
      assert.equal(stored[0]?.actor_id, "nihon-local-admin");
      assert.equal(stored[0]?.token_hash.length, 64);
      assert.ok(Date.parse(stored[0]!.expires_at) > Date.now());

      const second = await login(firstCookie);
      assert.equal(second.statusCode, 200);
      const secondCookie = getCookie(second);
      assert.notEqual(firstCookie, secondCookie);
      assert.equal((sqlite.prepare("SELECT count(*) AS n FROM auth_sessions").get() as {n:number}).n, 1);
      assert.equal((await app.inject({ method: "GET", url: "/api/v1/admin/vocabulary",
        headers: { cookie: firstCookie } })).statusCode, 401);
      assert.equal((await app.inject({ method: "GET", url: "/api/v1/admin/vocabulary",
        headers: { cookie: secondCookie } })).statusCode, 200);

      // A pre-migration stateless v1 HMAC cookie must not be accepted.
      const payload = Buffer.from(JSON.stringify({
        id: "nihon-local-admin", exp: Date.now() + 3_600_000,
      })).toString("base64url");
      const sig = createHmac("sha256", process.env.AUTH_SECRET!)
        .update("nihon-session-v1:" + payload).digest("base64url");
      const legacyCookie = "nihon_auth=v1." + payload + "." + sig;
      assert.equal((await app.inject({method:"GET",url:"/api/v1/admin/vocabulary",
        headers:{cookie:legacyCookie}})).statusCode, 401);

      const logout = await app.inject({
        method: "POST", url: "/api/v1/auth/logout",
        headers: { origin, cookie: secondCookie }, payload: {},
      });
      assert.equal(logout.statusCode, 200);
      assert.equal((sqlite.prepare("SELECT count(*) AS n FROM auth_sessions").get() as {n:number}).n, 0);
      assert.equal((await app.inject({method:"GET",url:"/api/v1/admin/vocabulary",
        headers:{cookie:secondCookie}})).statusCode, 401);

      const third = await login();
      assert.equal(third.statusCode, 200);
      const thirdCookie = getCookie(third);
      sqlite.prepare("UPDATE auth_sessions SET expires_at = '2020-01-01T00:00:00.000Z'").run();
      assert.equal((await app.inject({method:"GET",url:"/api/v1/admin/vocabulary",
        headers:{cookie:thirdCookie}})).statusCode, 401);

      const registration = await app.inject({
        method: "POST", url: "/api/v1/auth/learner/register",
        headers: { origin }, payload: {
          username: "yuki_session", displayName: "Yuki",
          password: "learner-password-1234", repeatPassword: "learner-password-1234",
        },
      });
      assert.equal(registration.statusCode, 201);
      const learner = await app.inject({
        method: "POST", url: "/api/v1/auth/learner/login",
        headers: { origin }, payload: {
          username: "yuki_session", password: "learner-password-1234",
        },
      });
      assert.equal(learner.statusCode, 200);
      const learnerCookie = getCookie(learner);
      const me = await app.inject({method:"GET",url:"/api/v1/auth/me",
        headers:{cookie:learnerCookie}});
      assert.equal(me.json().data.user.role, "learner");
      assert.equal((await app.inject({method:"POST",url:"/api/v1/auth/logout",
        headers:{origin,cookie:learnerCookie},payload:{}})).statusCode, 200);
      const after = await app.inject({method:"GET",url:"/api/v1/auth/me",
        headers:{cookie:learnerCookie}});
      assert.equal(after.json().data.user, null);
    } finally {
      sqlite.close();
      await app.close();
    }
  } finally {
    for (const key of vars) {
      const value = old[key];
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
    rmSync(dir, {recursive:true,force:true});
  }
});
