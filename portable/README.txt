LocalOps Guardian - Windows 便携开发包

运行条件
- Windows 10 或 11
- 已安装 Node.js 22、23 或 24，并可直接运行 node
- 已安装 Microsoft Edge

开始使用
1. 把压缩包完整解压到一个普通、可写的文件夹，不要只打开压缩包内部文件。
2. 双击 “Start LocalOps Guardian.vbs”。
3. 如果还没有服务器，从桌宠打开控制台，按首页 Watch Path 逐步配置。

安全与本地数据
- 不需要管理员权限，不安装 Windows 服务，也不会自动安装依赖。
- 未明确开启前，真实 SSH 采集保持关闭。
- 配置和检查历史只保存在本文件旁边自动创建的 data 文件夹。
- 卸载前，如果开启过“登录后启动”，请先在 LocalOps 中关闭；然后退出 LocalOps 并删除整个解压文件夹。

artifact-manifest.json 记录了包内每个文件的 SHA-256，用于发现缺失、增加或被修改的文件。
这是未签名的开发包，不是正式安装器；Windows 可能显示安全提醒。
