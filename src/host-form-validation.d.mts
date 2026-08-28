import type { HostConfigInput } from "./types";

export type HostFormField = "name" | "healthUrl" | "sshAlias";
export type HostFormErrors = Partial<Record<HostFormField, string>>;

export function validateHostForm(
  form: HostConfigInput,
  options?: { sshCollectionEnabled?: boolean }
): {
  errors: HostFormErrors;
  valid: boolean;
  canCheckAfterCreate: boolean;
};
