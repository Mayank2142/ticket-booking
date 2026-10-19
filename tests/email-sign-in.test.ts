import assert from "node:assert/strict";
import test from "node:test";
import { signInWithEmail } from "../apps/web/src/auth/email-sign-in";

test("the shared email form preserves existing customer, admin and organiser sessions without calling Firebase", async () => {
  for (const role of ["CUSTOMER", "ADMIN", "ORGANISER"]) {
    const session = { token: `existing-${role}`, user: { role } };
    const result = await signInWithEmail("existing@example.com", "existing-password", {
      existingAccount: async (email, password) => { assert.equal(email, "existing@example.com"); assert.equal(password, "existing-password"); return session; },
      verifiedEmail: async () => { assert.fail("Existing passwords must not be sent to Firebase after a successful login."); },
      verifiedEmailEnabled: async () => { assert.fail("Existing logins do not depend on Firebase availability."); },
      invalidCredentials: () => false,
    });
    assert.equal(result, session);
  }
});

test("the shared email form tries verified-email authentication after an ordinary credential rejection", async () => {
  const rejected = new Error("Invalid credentials");
  const session = { token: "verified-session", user: { role: "CUSTOMER" } };
  const calls: string[] = [];
  const result = await signInWithEmail("verified@example.com", "verified-password", {
    existingAccount: async () => { calls.push("existing"); throw rejected; },
    verifiedEmailEnabled: async () => { calls.push("configured"); return true; },
    invalidCredentials: (error) => error === rejected,
    verifiedEmail: async (email, password) => { calls.push("verified"); assert.equal(email, "verified@example.com"); assert.equal(password, "verified-password"); return session; },
  });
  assert.equal(result, session);
  assert.deepEqual(calls, ["existing", "configured", "verified"]);
});

test("network, throttling and server failures never send a password to another provider", async () => {
  for (const failure of [new TypeError("Failed to fetch"), Object.assign(new Error("Rate limit"), { status: 429 }), Object.assign(new Error("Unavailable"), { status: 503 })]) {
    await assert.rejects(signInWithEmail("existing@example.com", "password", {
      existingAccount: async () => { throw failure; },
      invalidCredentials: () => false,
      verifiedEmailEnabled: async () => { assert.fail("Configuration must not be consulted after an operational failure."); },
      verifiedEmail: async () => { assert.fail("Passwords must not be forwarded after operational failures."); },
    }), (error) => error === failure);
  }
});

test("unconfigured verified-email sign-in preserves the original credential error", async () => {
  const rejected = new Error("Invalid credentials");
  await assert.rejects(signInWithEmail("existing@example.com", "password", {
    existingAccount: async () => { throw rejected; },
    invalidCredentials: () => true,
    verifiedEmailEnabled: async () => false,
    verifiedEmail: async () => { assert.fail("An unconfigured provider cannot receive credentials."); },
  }), (error) => error === rejected);
});

test("verification requirements and provider failures never create a fallback application session", async () => {
  const verification = new Error("Verify your email first");
  let attempts = 0;
  await assert.rejects(signInWithEmail("unverified@example.com", "password", {
    existingAccount: async () => { attempts++; throw new Error("Invalid credentials"); },
    invalidCredentials: () => true,
    verifiedEmailEnabled: async () => true,
    verifiedEmail: async () => { throw verification; },
  }), (error) => error === verification);
  assert.equal(attempts, 1);
});
