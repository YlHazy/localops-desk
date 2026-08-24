import { httpSignalStatus, resourceSignalStatus, runtimeSignalStatus, sshSignalStatus } from "../shared/evidence-judgment.mjs";

export function hostGuidance(host, fresh = true) {
  if (!fresh) {
    return {
      title: "重新取得证据",
      reason: "现有证据已经过期，不能继续证明当前正常或异常。",
      detail: "先运行一次单机轻巡检，再根据新证据决定是否继续排查；未知状态不按正常处理。",
      avoid: "不要沿用过期结论，也不要先重启服务。"
    };
  }

  const signals = {
    http: httpSignalStatus(host),
    ssh: sshSignalStatus(host),
    runtime: runtimeSignalStatus(host),
    resource: resourceSignalStatus(host)
  };

  if (host.status === "critical") {
    const reason = signals.http === "critical"
      ? "网页/API 入口明确失败，用户可用性可能已经受到影响。"
      : signals.resource === "critical"
        ? "资源使用率进入高风险区间，继续增长可能影响服务。"
        : "至少一类关键检查明确失败，需要先定位失败层。";
    return {
      title: "先生成只读检查预案",
      reason,
      detail: "确认失败发生在入口、管理通道、运行时还是资源层，再选择验证命令。",
      avoid: "不要直接重启、部署或修改配置。"
    };
  }

  if (host.status === "warning") {
    const reason = signals.http === "warning"
        ? "网页/API 返回了非成功状态，但还不是明确的服务端故障。"
      : signals.resource === "warning"
        ? "资源占用接近关注阈值，服务可能仍可用，但需要确认增长趋势。"
        : signals.ssh === "warning"
          ? "管理通道没有通过，只读巡检信息可能不完整。"
          : signals.runtime === "warning"
            ? "运行时或容器信号需要复核。"
            : "存在尚未归类的关注信号，需要重新取证确认。";
    return {
      title: "复核最先变黄的证据",
      reason,
      detail: "先刷新当前服务器；若信号仍在，再生成只读检查预案。",
      avoid: "不要因为黄色状态就直接重启服务。"
    };
  }

  if (host.status === "unknown") {
    return {
      title: "取得一份新证据",
      reason: "当前没有足够的新鲜观测，未知状态不能当作正常。",
      detail: "运行单机轻巡检；未知状态不按正常处理。缺少 Health URL 或 SSH alias 时，先补充需要的证据来源。",
      avoid: "不要用“没有报错”推断服务健康。"
    };
  }

  const hasUnknownSignal = Object.values(signals).includes("unknown");
  return {
    title: "保持值守",
    reason: hasUnknownSignal
      ? "已取得的证据没有显示异常；未配置或未采集的信号仍保持未知。"
      : "入口、管理通道、运行时和资源证据均未显示异常。",
    detail: "等待下一次自动巡检即可；证据过期后会自动降级为未知。",
    avoid: "没有异常证据时，不要为了安心而重启或改配置。"
  };
}
