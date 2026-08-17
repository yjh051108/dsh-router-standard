# dsh-router-standard

> # ⚠️⚠️⚠️ 重要勘误与道歉（必读） ⚠️⚠️⚠️
>
> ## 我不需要被造神，也不配被造神
>
> 这篇 README 顶部必须放这段话：**我错了，而且错得很有代表性。**
>
> - **论文不撤回**，但其中**理论解释部分（双吸引子假设 A1–A4 及"god/ghost"、"自路由不可能"等强归因）已正式标注作废**。
> - **心路历程**：我最初把 "We need / Let me" 的差异当成"官方刻意设计的双模式"；后来才意识到那更可能是**一条原生深度路径 + 一条后压未收敛的极简路径**之间的**断层/断裂带**。这个断层**本身就像一层路由层**——我们实际做的是把它当路由层用，实现了 "Let me / We need" 自路由。
> - **我们做对了一件事，也请记住这件事**：**利用后训练的一个小缺陷（断层/断裂带），我们实现了 V4 Flash 能力的可复现提升**——这不是我聪明，是那个缺陷恰好可被工程利用。
> - **Pro 是另一场完全不同的硬仗**：雷霆大思考、工具面敏感、内部路由不稳定。**我已经找到方向**（黑盒 logprobs / 嵌入向量层逆向 / 语义锚点指纹），初步数据已在仓库。这条路我会继续用实测走，而不是用叙事走。
>
> 📄 完整勘误声明：[docs/statement.md](docs/statement.md) ｜ 道歉函：[docs/apology.md](docs/apology.md)

> **一句话**：把“首轮该用哪种人格和工具”这件事自动化——按第一条用户消息判断任务类型，锁定一个稳定行为带；第一次工具调用后恢复 Standard 全量能力。

## 两个预设是做什么的

| 预设 | 首轮行为（路径锁定前） | 第一次工具调用后 | 适合 |
|---|---|---|---|
| **Router Standard（标准接口，默认）** | 只保留 RL 训练句 + `shell` / `str_replace_editor`；想一段、做一段（实测 25 步 / 24 次工具调用 / 产出文件） | 开放 Standard 全部工具，路由不再干预 | 大多数日常任务 |
| **Router Spec（深度思考优先）** | 按任务分类注入 spec / react / weak 人格 + 对应首轮核心工具，并保留完整系统提示区；首轮超长思维链（101K 推理、0 行动）是设计特性 | 同上 | 维护、排查、需要先想清楚再动手的任务 |

两个预设都会按第一条消息做 **build / fix / 模糊** 三分类（build → react 执行带，fix → spec 规划带，模糊 → weak 模型自判）。Router Spec 把分类结果直接用于首轮人格和工具；Router Standard 首轮统一走 RL 接口，分类仍驱动模糊任务的后续引导，并体现在 `dev_router_status` 里。模式来自持久化会话事件，断线 / 重载不丢失。

## 与 DSH 自带预设的对比（Pro / Flash）

| 预设 | 首轮系统提示与工具 | V4 Pro 实测 | V4 Flash 实测 | 任务分流 |
|---|---|---|---|---|
| **DSH 标准模式** | 完整提示 + 全量工具 | 维护类 91 分（对比 minimal 99/96）；工具目录与控制面板敏感，易出现 let-me 尖峰 | 对工具目录几乎免疫，人格主导，无 let-me 尖峰 | 无 |
| **DSH 极简模式** | exact RL 句 + `bash` / `str_replace_editor`，且永远只有这两个工具 | 维护类 99/96 分；但没有自动升级路径 | 即使给全量工具目录仍保持 minimal-like | 无 |
| **Router Standard** | RL 句 + `shell` / `str_replace_editor`（首轮后自动升级） | 所有任务首轮统一走 think-act 接口（实测 25 步 / 24 工具调用）；分类只驱动 weak 引导与状态可见性 | 模糊任务自动使用 Flash 专属 weak 人格（w7 + 召回/收敛/防跑飞锚点） | 有（用于 weak 引导） |
| **Router Spec** | 完整提示 + 分类人格 + 对应首轮核心工具 | 维护 → 深度 spec，构建 → react；首轮超长思维链是特性 | 与 Pro 同套分流；模糊任务走 Flash 专属 weak 人格 | 有 |

**模型自适应，不用为 Pro / Flash 手配两套**：`personaFor(mode, modelId)` 读取当前模型路由，Pro 用实测最优 w6c（spec 句 + 分类指令，24/24 = 100% 分流），Flash 用 w7 + 召回 / 收敛 / 防跑飞锚点（96% 分流、100% 单任务完成）。

---

**Task-aware reasoning-mode router for DeepSeek Harness.** One preset, two
**routing modes** (v0.2.0 naming), plus the measured three-band axis behind them:

| routing mode | first request | thinking shape |
|---|---|---|
| **standard（标准路由预设）** | RL 接口还原：只有 RL 训练句（`You are a helpful software engineer assistant.`）+ shell/str_replace_editor | **没有雷霆大思考**：想一段做一段（实测：25 步 / 24 工具调用 / 产出文件；单步推理 ~3.9K，思考总量与其他模式相当，但分散在行动之间） |
| **spec（spec 路由预设）** | 分类 persona（spec/react/weak）+ 完整 prompt sections | **雷霆大思考**：首轮超长思维链（101K 推理 0 行动是其特征，不是缺陷） |

> 选择：安装两个预设之一（Router Standard / Router Spec，见 Usage）。
> `dev_router_status` 显示当前路由模式。

> This is a research artifact. It encodes a measured property of DeepSeek V4
> Pro / V4 Flash: model behavior along the persona axis is **not a continuum**
> — it collapses into a few stable regions separated by phase transitions.
> The router therefore quantizes to the stable regions instead of pretending
> the axis is continuously tunable.

## What it does

**standard mode**: on the first model request the system prompt is reduced to
the RL training sentence alone (identity/web/tool-guidance sections removed —
the minimal preset's `complete: true` semantics) with the RL two-tool surface
(shell + str_replace_editor). The model then works in think-act feedback loops
instead of one exhausted reasoning chain.

**spec mode**: reads the session's first user message, classifies the task, and
on the first model request injects the matching persona + first-turn core tool
set; the model reasons deeply first (the long chain is the point).

After the first durable tool call the full Standard catalog is exposed and the
router stops touching anything. The mode is derived from durable session
events, so resume/reload keeps it. The plan-mode prompt section is preserved
(standard mode keeps it alongside the RL persona), so plan boundaries do not
reset the model's focus.

## The three measured behavior bands

Fine-grained probing (21 mode points × n=2, official API, reasoning_effort=max)
on V4 Pro shows behavior along the persona axis collapses into **three bands**:

| band | mode | measured behavior |
|---|---|---|
| `spec` | 0 – 0.19 | stable plan-collective (`We` trajectories, let-me ≈ 0) |
| `mixed` | 0.2 – 0.49 | **transition trap**: unstable mixing of `We`/`The`/`Let` |
| `react` | 0.5 – 1.0 | stable doer (`The`/`Let` first-person, we ≈ 0) — 11 mode values behave alike |

V4 Flash is threshold-like (0–0.5 all spec side, jumps at 0.75+). The numeric
`dev_router_mode` interface is kept, but it quantizes to the three bands — the
transition band is never selected automatically.

## Why: dual-attractor RL policy

Evidence across projects (see `docs/paper.md` and `docs/experiments.md`):

- The **same model** reaches top-band scores under spec conditions on a
  maintenance benchmark (Project2: minimal 99/96, anchored 98/99) and under
  react/code conditions on a greenfield build task (Mario: 10/10), while the
  wrong mode scores 91 / 6 respectively — a ~10-point swing from prompt
  conditioning alone ("god/ghost duality").
- Persona is the dominant trigger (one-sentence swap flips the trajectory);
  tool-schema surface is a secondary condition; catalog text in a user message
  has no effect.
- Behavior is path-committed: once anchored, expanding the tool catalog
  perturbs at most one reasoning block and never flips the mode.
- Intermediate personas are **out-of-distribution** (training-distribution
  gap), which is the measured unstable band.

The model cannot self-route: P3 (same persona, task swap → trajectory
unchanged), P5 (router personas → doer attractor absorbs the instruction) and
P8 (domain-overlap scan) show the only internal-routing window is a WEAK
persona + few-shot routing instruction (lean, not flip; discrimination
+2.3..+3.3). There is no reward signal for switching modes mid session, and
the behavior phase transition means the model commits on the first request.
**Mode selection must come from outside** — a human (the "streamer"), a
heuristic classifier, or a learned router. This preset is the automated
version of that external routing.

## Usage

**Two presets** (v0.2.0): install one or both under `~/.dsh/.agent-presets/`:

```powershell
# 标准路由预设（RL 接口还原，默认推荐）
$target = Join-Path $env:USERPROFILE '.dsh\.agent-presets\router-standard'
Copy-Item -Recurse .\preset\router-standard $target

# spec 路由预设（深度思考优先）
$target = Join-Path $env:USERPROFILE '.dsh\.agent-presets\router-spec'
Copy-Item -Recurse .\preset\router-spec $target
# NOTE: installed copies must keep unique module filenames
# (the loader caches ESM modules by URL; do not overwrite in place)
```

Restart DSH, start a new session, pick **Router Standard (experimental)**
(RL-interface, think-act loops) or **Router Spec (experimental)**
(deep-think-first, the long first-turn chain is the point).

- `dev_router_status` — current mode, band, persona, core tools, override state
- `dev_router_mode <spec|weak|mixed|react|0-100|0.0-1.0|auto>` — explicit mode
  (numeric inputs quantize to the three bands)
- `dev_mode_subagent <spec|react|balanced> <task>` — run one task in a
  DIFFERENT reasoning mode inside a fresh isolated context (its own system
  prompt), leaving the current trajectory untouched. Mode isolation is the
  only reliable way to change modes mid-session: mid-session persona switches
  invalidate the whole prefix cache, tail personas are ineffective (P6), and
  the native subagent inherits this persona.

**One preset, auto-matched per model.** There is no Pro/Flash split to
configure: `personaFor(mode, modelId)` reads the session's model route and
selects the measured optimum automatically — Pro → w6c (spec sentence +
classify instruction, no anchors; 24/24 = 100% routing, P24), Flash → w7 +
recall/anti-runaway anchors (96% routing; 100% single-task completion, P23).
The model is fixed at the first request (path commitment), so the persona is
locked for the session; switching the GUI model starts a new session with the
matching configuration.

**Depth-adaptive guidance (v20, thinking efficiency).** Per-message guidance
is dispatched by task complexity (`isComplexTask`: length or architecture
keywords):
- **simple tasks** → fast-convergence guide (P30: 1 step, zero waste);
- **complex tasks** → decision-closure deep guide: "Think deeply about the
  architecture, edge cases, and integration points. Do not spend reasoning
  on the environment or tooling. Produce when your information is complete.
  End each reasoning block with a decision or an information need." —
  P30: depth +12% AND faster convergence (8.0 vs 8.3 steps), 3/3 completion.
- Rumination (environment suspicion / re-confirmation) is suppressed by the
  anti-runaway anchor: measured 0.0-0.3% of reasoning tokens.

## Tests

```sh
node --test router.test.mjs   # 11 tests: classification, bands, personas, plan-section survival
```

## Files

- `preset/agent.cordis.yml` — full rc.6 Standard composition + router row
- `preset/router-core.mjs` — pure routing logic (zero deps, unit-testable)
- `preset/router-bootstrap.mjs` — Cordis plugin (zero external imports)
- `router.test.mjs` — unit tests
- `docs/paper.md` — the theory + experiments write-up
- `docs/experiments.md` — full data tables

## Evidence & attribution

- Trajectory trigger matrix, dual-model matrices, and the 21-point phase probe:
  `dsh-probe` (this repo's sibling scripts live in the paper's appendix tables).
- Project2 evaluation data: [xiaobright/modeltest](https://github.com/xiaobright/modeltest)
  (V4.1b, frozen) — minimal 99/96, standard 91, PTC 92, anchored-standard 98/99.
- Two-phase anchoring preset: [xiaobright/dsh-anchored-standard](https://github.com/xiaobright/dsh-anchored-standard)
  (MIT). The router's first-turn anchoring is a plugin-level port of its
  `tool-bootstrap` mechanism.
- DeepSeek Harness official `minimal` preset snapshot
  (`sends the exact RL prompt and schemas` test) — the spec persona and the
  RL-alignment claim.

## License

MIT. `preset/agent.cordis.yml` derives from the DeepSeek Harness Standard
preset (MIT); original attribution in `NOTICE`.
