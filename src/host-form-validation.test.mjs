import assert from "node:assert/strict";
import test from "node:test";
import { validateHostForm } from "./host-form-validation.mjs";

const base = {
  name: "demo",
  healthUrl: "",
  sshAlias: ""
};

test("host form points each invalid value back to its field", () => {
  const result = validateHostForm({ name: "", healthUrl: "https://user:pass@example.test/health?token=x", sshAlias: "-unsafe" });
  assert.equal(result.valid, false);
  assert.deepEqual(Object.keys(result.errors), ["name", "healthUrl", "sshAlias"]);
});

test("a clean HTTP target enables add and check", () => {
  const result = validateHostForm({ ...base, healthUrl: "http://127.0.0.1:4328/api/status" });
  assert.equal(result.valid, true);
  assert.equal(result.canCheckAfterCreate, true);
});

test("SSH enables the first check only when collection is enabled", () => {
  assert.equal(validateHostForm({ ...base, sshAlias: "my-server" }).canCheckAfterCreate, false);
  assert.equal(validateHostForm({ ...base, sshAlias: "my-server" }, { sshCollectionEnabled: true }).canCheckAfterCreate, true);
});

test("name-only configuration stays an explicit add without check", () => {
  const result = validateHostForm(base);
  assert.equal(result.valid, true);
  assert.equal(result.canCheckAfterCreate, false);
});
