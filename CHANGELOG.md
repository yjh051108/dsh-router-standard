# Changelog（本 fork：huozhetiaozhehuopopo/dsh-router-standard）

> 版本语义：**x.y.1 = 修复版（不含他人 PR），x.y.2 = 修复 + 吸收其他贡献者改进**。
> 上游 v0.2.0（f9667f7）仍带病，本 fork 为本地可用的修复/增强版。

## 0.2.2（2026-08-17，吸收后）

在 0.2.1 基础上吸收上游 3 个 PR（先测试后吸收：6 项回归测试先红后绿，23/23）：

- **PR #17（lapp33669）**：
  - `agent/inbox/claimed` 监听——首轮路由不依赖 `user/message` 事件时序（claim 先于 assemble，首轮即真实分类），过滤 `kind=user`
  - `sessionMode` 只分类真实用户消息（插件注入不再钉死 weak）
  - **修复其隐藏回归**：上游过滤只认顶层 `data.source.kind`，对 issue #1 嵌套形状（`data.message.source`）误杀——本版兼容两层
- **PR #21（baka-world）**：会话选择模型（`assembled.variables`）优先于 `agent.options`，用于 weak persona / `dev_router_status` / `dev_mode_subagent`（issue #9），含其回归测试
- **PR #5（Phant0Meow）**：子代理（`parentSession`）跳过 router 组装，shell-less 子代理不再崩溃（仅取修复本体 3 行，未搬其旧基线重构）

## 0.2.1（2026-08-16，吸收前，tag v0.2.1）

双预设（router-standard / router-spec）v1+v2 五个原始修复，17/17 测试：

1. **补漏导入 `extractText`**：监听器 140 行在首条真实 user/message 必抛 ReferenceError（上游 0fbe572 只修了 bandOf）
2. **`firstUserText` 类型统一**：原始文本直接进 `bandOf` → `clamp01(NaN)`=0 → spec 恒成立（简单任务误判 spec）；新增 `currentMode()` = `override ?? classifyTask(firstUserText) ?? sessionMode`
3. **装配链 v1 同步修复**：`agent.cordis.yml` 实际挂载 `router-bootstrap-v1.mjs`，v1 同病同修（修复后 v1/v2 内容一致）
4. **近场引导注入死锁**（探针实证）：监听器同步执行在 `user/message` append 派发窗口内，`session.append` reenter 保护抛错被吞 → `queueMicrotask` 延迟注入修复；真实会话三重实证注入成功（此前从未注入）
5. **测试补齐**：修复 v0.2.0 拆双预设后过时的 import 路径；装配冒烟测试（mock ctx 重放 session/event 全链路，v1+v2、复杂/简单路径）

## 上游对照

- 0.2.1 的 ①② 与 PR #6（orangeofcarl0-sys）、PR #17（lapp33669）、PR #10（YangYangaaaa）独立互证（同一批 bug 多贡献者独立发现）
- PR #29（请求剥离 AGENTS.md/技能目录注入）未吸收，另立观察项
