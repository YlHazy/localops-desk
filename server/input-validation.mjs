export class InputValidationError extends Error {
  constructor(message) {
    super(message);
    this.code = "INVALID_INPUT";
    this.httpStatus = 400;
  }
}

const SSH_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

export function validateSshAlias(value, { allowEmpty = true } = {}) {
  const alias = String(value ?? "").trim();
  if (!alias && allowEmpty) return "";
  if (!SSH_ALIAS_PATTERN.test(alias)) {
    throw new InputValidationError("sshAlias must contain only letters, numbers, '.', '_' or '-', and must not start with '-'.");
  }
  return alias;
}
