import assert from "node:assert/strict";
import test from "node:test";
import { InputValidationError, validateSshAlias } from "./input-validation.mjs";

test("accepts ordinary SSH config aliases and an intentionally empty alias", () => {
  assert.equal(validateSshAlias("my-server-readonly"), "my-server-readonly");
  assert.equal(validateSshAlias("server_01.example"), "server_01.example");
  assert.equal(validateSshAlias(""), "");
});

test("rejects values that could be parsed as an SSH option or target expression", () => {
  for (const value of ["-oProxyCommand=calc", "alias name", "user@host", "../host"]) {
    assert.throws(() => validateSshAlias(value), InputValidationError);
  }
});

test("requires a non-empty alias immediately before SSH execution", () => {
  assert.throws(() => validateSshAlias("", { allowEmpty: false }), InputValidationError);
});
