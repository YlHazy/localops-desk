const SSH_ALIAS_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;

export function validateHostForm(form, { sshCollectionEnabled = false } = {}) {
  const errors = {};
  const name = String(form?.name ?? "").trim();
  const healthUrl = String(form?.healthUrl ?? "").trim();
  const sshAlias = String(form?.sshAlias ?? "").trim();

  if (!name) errors.name = "请填写服务器名称。";

  if (healthUrl) {
    let parsed;
    try {
      parsed = new URL(healthUrl);
    } catch {
      errors.healthUrl = "请输入完整的 http:// 或 https:// 地址。";
    }
    if (parsed && !["http:", "https:"].includes(parsed.protocol)) {
      errors.healthUrl = "地址必须以 http:// 或 https:// 开头。";
    } else if (parsed && (parsed.username || parsed.password || parsed.search || parsed.hash)) {
      errors.healthUrl = "地址不能包含账号、密码、查询参数或 # 片段。";
    }
  }

  if (sshAlias && !SSH_ALIAS_PATTERN.test(sshAlias)) {
    errors.sshAlias = "SSH 别名只能包含字母、数字、点、下划线或短横线，且不能以短横线开头。";
  }

  return {
    errors,
    valid: Object.keys(errors).length === 0,
    canCheckAfterCreate: Boolean(healthUrl || (sshCollectionEnabled && sshAlias)) && Object.keys(errors).length === 0
  };
}
