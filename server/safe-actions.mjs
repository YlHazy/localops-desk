import { createHash, timingSafeEqual } from "node:crypto";
import { redactDiagnosticText } from "./deep-diagnostics.mjs";
import { validateSshAlias } from "./input-validation.mjs";

export const NGINX_RELOAD_PHRASE = "确认重载 Nginx";
export const ACTION_APPROVAL_TTL_MS = 2 * 60 * 1000;

const nginxCommands = Object.freeze({
  preflight: "sudo -n nginx -t",
  reload: "sudo -n systemctl reload nginx"
});

export function nginxActionCommand(step) {
  const command = nginxCommands[step];
  if (!command) throw new Error(`Nginx action step is not allowlisted: ${step}`);
  return command;
}

export function actionCapability({ actionsEnabled, sshEnabled }) {
  const blockers = [];
  if (!actionsEnabled) blockers.push("变更通道未由 LOCALOPS_ENABLE_ACTIONS=1 显式开启");
  if (!sshEnabled) blockers.push("只读 SSH 未由 LOCALOPS_ENABLE_SSH=1 显式开启");
  return {
    enabled: blockers.length === 0,
    supportedActions: ["reload-nginx"],
    blockers,
    message: blockers.length === 0
      ? "Nginx 重载通道已开启；每次仍需单独准备并输入确认短语。"
      : "远程变更保持关闭；诊断、预案和复制只读命令不受影响。"
  };
}

function digestForApproval(value) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

export function createNginxReloadApproval({ host, approvalId, evidenceCheckId, now = Date.now(), ttlMs = ACTION_APPROVAL_TTL_MS }) {
  const sshAlias = validateSshAlias(host.sshAlias, { allowEmpty: false });
  const preparedAt = new Date(now).toISOString();
  const expiresAt = new Date(now + ttlMs).toISOString();
  const target = { name: host.name, environment: host.environment, role: host.role };
  const digestInput = {
    approvalId,
    hostId: host.id,
    hostUpdatedAt: host.updatedAt,
    sshAlias,
    actionKey: "reload-nginx",
    evidenceCheckId,
    preparedAt,
    expiresAt,
    target,
    commands: [nginxCommands.preflight, nginxCommands.reload]
  };
  const planDigest = digestForApproval(digestInput);
  return {
    ...digestInput,
    planDigest,
    requiredPhrase: NGINX_RELOAD_PHRASE,
    displayCommands: [
      `ssh ${sshAlias} '${nginxCommands.preflight}'`,
      `ssh ${sshAlias} '${nginxCommands.reload}'`
    ],
    impact: "重新加载 Nginx 配置；现有连接通常继续处理，但入口配置会发生变化。",
    stopCondition: "nginx -t 未通过时立即停止，不发送 reload。",
    recovery: "若重载后检查异常，不自动重复执行；保留回执并回到只读排查。"
  };
}

function equalDigest(left, right) {
  const a = Buffer.from(String(left));
  const b = Buffer.from(String(right));
  return a.length === b.length && timingSafeEqual(a, b);
}

export function validateNginxApproval(approval, input, now = Date.now()) {
  if (!approval) {
    const error = new Error("授权不存在或已经使用，请重新准备。");
    error.code = "ACTION_APPROVAL_MISSING";
    error.httpStatus = 409;
    throw error;
  }
  if (new Date(approval.expiresAt).getTime() <= now) {
    const error = new Error("本次授权已超过两分钟，请重新准备并核对目标。");
    error.code = "ACTION_APPROVAL_EXPIRED";
    error.httpStatus = 409;
    throw error;
  }
  if (input.phrase !== approval.requiredPhrase) {
    const error = new Error(`请输入完整确认短语：${approval.requiredPhrase}`);
    error.code = "ACTION_PHRASE_MISMATCH";
    error.httpStatus = 400;
    throw error;
  }
  if (!equalDigest(input.planDigest, approval.planDigest)) {
    const error = new Error("操作预案已经变化，请重新准备后再确认。");
    error.code = "ACTION_PLAN_CHANGED";
    error.httpStatus = 409;
    throw error;
  }
  return approval;
}

function stepDetail(value) {
  return redactDiagnosticText(value || "命令完成。", 600);
}

export async function executeNginxReload({ approval, runCommand, verify }) {
  const steps = [];
  try {
    const output = await runCommand("preflight");
    steps.push({ key: "preflight", status: "passed", label: "配置检查通过", detail: stepDetail(output) });
  } catch (error) {
    steps.push({ key: "preflight", status: "failed", label: "配置检查失败", detail: stepDetail(error?.message) });
    return {
      status: "failed",
      failureCode: "NGINX_PREFLIGHT_FAILED",
      summary: "Nginx 配置检查没有通过，reload 未执行。",
      verificationCheckId: null,
      steps
    };
  }

  try {
    const output = await runCommand("reload");
    steps.push({ key: "reload", status: "passed", label: "重载命令已完成", detail: stepDetail(output) });
  } catch (error) {
    steps.push({ key: "reload", status: "failed", label: "重载命令失败", detail: stepDetail(error?.message) });
    return {
      status: "failed",
      failureCode: "NGINX_RELOAD_FAILED",
      summary: "reload 命令返回失败；没有自动重试。",
      verificationCheckId: null,
      steps
    };
  }

  try {
    const verification = await verify();
    const verified = verification.status === "healthy";
    steps.push({
      key: "verify",
      status: verified ? "passed" : "warning",
      label: verified ? "重载后检查正常" : "重载后仍需关注",
      detail: stepDetail(verification.summary)
    });
    return {
      status: verified ? "succeeded" : "verification-warning",
      failureCode: verified ? null : "POST_ACTION_CHECK_NOT_HEALTHY",
      summary: verified ? "Nginx 已重载，随后检查未发现问题。" : "Nginx 已重载，但随后检查仍有异常或未知项；不要重复执行。",
      verificationCheckId: verification.checkId ?? null,
      steps
    };
  } catch (error) {
    steps.push({ key: "verify", status: "warning", label: "重载后检查未完成", detail: stepDetail(error?.message) });
    return {
      status: "verification-warning",
      failureCode: "POST_ACTION_CHECK_FAILED",
      summary: "Nginx 已重载，但随后检查没有完成；不要重复执行。",
      verificationCheckId: null,
      steps
    };
  }
}

export function publicApproval(approval) {
  return {
    approvalId: approval.approvalId,
    actionKey: approval.actionKey,
    evidenceCheckId: approval.evidenceCheckId,
    target: approval.target,
    preparedAt: approval.preparedAt,
    expiresAt: approval.expiresAt,
    planDigest: approval.planDigest,
    requiredPhrase: approval.requiredPhrase,
    commands: approval.displayCommands,
    impact: approval.impact,
    stopCondition: approval.stopCondition,
    recovery: approval.recovery
  };
}
