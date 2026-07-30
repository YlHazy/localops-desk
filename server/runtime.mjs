export const seedHosts = [
  {
    id: "lexhub-prod-01",
    name: "lexhub-prod-01",
    environment: "production",
    role: "prod ecs / zone h",
    sshAlias: "lexhub-prod-01-proxy",
    healthUrl: "https://ai2law.cn/api/v1/health/ready",
    composeProject: "lexhub-main",
    tags: ["main", "alb", "docker"]
  },
  {
    id: "lexhub-prod-02",
    name: "lexhub-prod-02",
    environment: "production",
    role: "prod ecs / zone i",
    sshAlias: "lexhub-prod-02-proxy",
    healthUrl: "https://www.ai2law.cn/api/v1/health/ready",
    composeProject: "lexhub-main",
    tags: ["main", "alb", "docker"]
  },
  {
    id: "lexhub-demo-01",
    name: "lexhub-demo-01",
    environment: "demo",
    role: "cloud demo runtime",
    sshAlias: "lexhub-demo-01-proxy",
    healthUrl: "http://182.92.161.246/api/v1/health/ready",
    composeProject: "lexhub-cloud-demo",
    tags: ["demo", "local-db", "docker"]
  }
];

const simulatedProfiles = {
  "lexhub-prod-01": {
    status: "healthy",
    httpStatus: "200 ready",
    sshStatus: "simulated ok",
    cpuPercent: 18,
    memoryPercent: 46,
    diskPercent: 52,
    dockerStatus: "compose healthy",
    summary: "生产节点健康，资源压力正常。",
    evidence: ["ALB readiness 模拟正常。", "Docker Compose Web/API/Agent/workers 模拟在线。", "磁盘低于关注阈值。"]
  },
  "lexhub-prod-02": {
    status: "warning",
    httpStatus: "200 ready",
    sshStatus: "simulated ok",
    cpuPercent: 31,
    memoryPercent: 68,
    diskPercent: 76,
    dockerStatus: "compose healthy",
    summary: "生产节点可用，但磁盘接近关注阈值。",
    evidence: ["HTTP readiness 模拟正常。", "磁盘 76%，建议关注增长趋势。", "未发现关键错误摘要。"]
  },
  "lexhub-demo-01": {
    status: "unknown",
    httpStatus: "not probed",
    sshStatus: "simulated disabled",
    cpuPercent: null,
    memoryPercent: null,
    diskPercent: null,
    dockerStatus: "not checked",
    summary: "真实 SSH 未启用，demo 节点保持未知状态。",
    evidence: ["LOCALOPS_ENABLE_SSH 未开启。", "MVP 默认不触碰真实服务器。", "可在后续只读 SSH 阶段启用真实采集。"]
  }
};

export async function collectHost(host, options) {
  if (options.mode !== "ssh-enabled") {
    return {
      hostId: host.id,
      ...simulatedProfiles[host.id]
    };
  }

  return {
    hostId: host.id,
    status: "unknown",
    httpStatus: "ssh mode adapter pending",
    sshStatus: "adapter not implemented in MVP",
    cpuPercent: null,
    memoryPercent: null,
    diskPercent: null,
    dockerStatus: "pending",
    summary: "SSH mode has been enabled, but real command adapter is intentionally deferred from the first MVP.",
    evidence: [
      "安全边界：MVP 不执行真实 SSH 命令。",
      "后续版本会添加 allowlist、timeout、concurrency、脱敏和审计。"
    ]
  };
}

