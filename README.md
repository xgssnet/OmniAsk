# OmniAsk

> 一次提问，多模型回答，交叉验证，生成最佳答案。

OmniAsk 是一个基于 **Chrome Extension Manifest V3** 的开源浏览器插件：把同一个问题并行发送给你选择的多个 AI 网站，收集各模型回答后，由独立的裁决模型做结构化分析、共同观点识别、冲突检测、事实核查与最终裁决，输出综合答案。

**项目状态：P1–P9 开发阶段已完成。** 代码可构建、可加载、单元测试全部通过。但请务必阅读下方的「已知限制」：内置 AI 站点的 DOM 适配器**尚未在真实登录环境中验证**，综合裁决依赖你自行配置的 API，浏览器端端到端实测需按清单手动执行。

---

## 核心特性

- **一次提问，并行多模型**：任务队列支持并发上限、超时、单任务取消、全部取消、失败重试与部分失败；某个模型失败不影响其他模型与分析。
- **网站适配器架构**：`BaseAdapter` + 9 个内置站点适配器 + `CustomAdapter`；CSS 选择器全部可编辑，支持 open Shadow DOM、textarea / contenteditable、流式提取与静默完成判定。
- **自定义 AI 网站**：添加、编辑、删除站点，配置登录/输入/发送/回答/流式/完成规则，逐项测试连接、登录状态与选择器；运行时按需申请主机权限。
- **登录检测**：基于公开页面状态与 DOM 规则，不读取密码、Cookie 或 Session Token；无法可靠判断时明确提示手动确认。
- **多模型答案展示**：三种入口（Popup / Side Panel / 完整工作台），七种任务状态、Markdown、GFM 表格、代码高亮、复制、展开折叠、耗时、错误与重新提问。
- **独立裁决模块**：五阶段流程（结构化 → 共同观点 → 冲突检测 → 事实核查 → 最终裁决），系统提示词可编辑，禁止编造来源，不靠多数投票判定事实，输出保守可信度与不确定性说明。
- **本地数据**：配置用 `chrome.storage.local`，历史记录用 IndexedDB，支持删除、清空、JSON 导入导出；无后端服务器。

## 界面

| 入口 | 用途 |
| --- | --- |
| 工具栏 Popup | 快捷输入问题、选择模型、发起任务、跳转工作台 |
| Side Panel | 浏览网页时伴随提问，窄屏单列布局 + 独立导航条 |
| 独立工作台 | 左侧导航 + 中间问答区 + 右侧裁决洞察，响应式三栏 |
| 设置页 | 通用设置、综合分析配置与连通性测试、数据管理 |

支持浅色／深色／跟随系统、响应式布局、Markdown 与代码高亮、复制、重新提问、停止任务、展开折叠。

## 环境要求

- Node.js 20.19+（推荐 22.x）、npm 10+
- Chrome / Edge 114+（`chrome.sidePanel` 最低版本）
- 各个 AI 网站需要你**用自己的账号在浏览器中登录**
- 综合分析需要你自行配置一个 OpenAI Compatible API（Base URL / API Key / Model）

## 安装与运行

### 从源码加载

```bash
npm install
npm run build
```

1. 打开 `chrome://extensions`（Edge 为 `edge://extensions`），开启「开发者模式」。
2. 选择「加载已解压的扩展程序」，指向项目下的 `dist/` 目录。
3. 点击工具栏 OmniAsk 图标，右上角应显示 `SW v0.1.0`（绿点）。

`npm run dev` 会启动 Vite，可直接访问 `/app.html`、`/popup.html`、`/sidepanel.html` 调试界面。普通网页中 `chrome.*` 不可用，界面显示「网页调试模式」，这是预期行为。

### 完整使用流程

1. **登录站点**：在浏览器中打开并登录要使用的 AI 网站。插件不代管账号。
2. **检查适配器**：进入「模型管理」，展开站点，点击「测试连接」「测试登录」「测试输入/发送/回答选择器」。结果会显示每个选择器的**匹配节点数**与**文本示例**；内置选择器只是初始候选值，请以测试结果为准自行调整。
3. **配置裁决模型**：「设置 → 综合分析设置」填写 API Base URL、API Key、Model，然后点击「**测试连接**」。测试会由后台向该 API 发送一条极短消息（`max_tokens=16`，可能产生极小费用），返回成功/失败原因、HTTP 状态码、耗时与模型返回片段；401 提示 API Key 问题、404 提示 Base URL / Model 问题、超时提示网络问题。Base URL 失焦时会弹出运行时权限请求，**必须允许**，否则后台 `fetch` 会被扩展 CSP 拦截。
4. **提问**：输入问题，勾选模型，点击「开始提问」。后台会复用或打开对应标签页，注入内容脚本并并行提问，进度实时回传；关闭页面后重新打开仍能恢复状态。
5. **查看结果**：各模型回答卡片、综合答案、右侧裁决洞察；可复制、重试单个模型、停止任务、重新分析。
6. **历史与备份**：「历史记录」查看/删除/清空，并支持 JSON 导出导入；「设置 → 数据管理」提供同样的能力。

「界面预览」按钮加载的是明确标注的示例数据，仅用于验证界面渲染，不是真实 AI 输出。

### 回答提取超时排查

`回答超时（120s），未能在页面上提取到回答内容` 表示：问题已提交，但适配器一直没抓到回答文本。现在提取分两层：

1. **配置选择器**：站点 `response` 字段支持逗号分隔的多个候选，取提交后新增节点的最深层文本，避免父子节点重复拼接。
2. **自动发现回退**：若配置选择器 15 秒内没有产生内容，改为比较「提交前后的文本快照」，从通用候选（`[data-role]`、`[class*="markdown"]`、`[class*="answer"]`、`p`、`pre` 等，含 open Shadow DOM）里找出新增或文本变化的深层文本块，并排除用户自己发出的消息与编辑框内容。

超时错误信息会附带配置选择器匹配数、通用候选数，以及「输入框是否仍保留问题文本」的判断。按顺序排查：

- 输入框仍保留问题文本 → 多半是发送没生效，校准 `sendButton` 或检查登录状态（适配器现在会等待按钮从 disabled 变为可用再点击）。
- 通用候选数为 0 → 回答可能在 `iframe` 或 closed Shadow DOM 中，当前不支持。
- 在「模型管理」点「测试选择器」，把**匹配数为 0** 的项改成页面上真实存在的选择器；可借助浏览器 DevTools 复制元素选择器后填入。
- 若自动发现抓到了无关文字，把准确的 `response` 选择器填上即可让第一层优先生效。

## 项目结构

```
popup.html / sidepanel.html / app.html   三个 HTML 入口
public/icons/                           扩展图标（脚本生成）
scripts/
  generate-icons.mjs                   生成 16/32/48/128 PNG
  verify-dist.mjs                      构建产物静态自检
  package-extension.mjs                生成商店发布 ZIP
src/
  popup/ sidepanel/ app/               React 入口
  background/                         MV3 Service Worker：唯一调度中枢
  content/                            Content Script：只做 DOM 与适配器
  core/
    adapters/   dom / BaseAdapter / builtin / CustomAdapter / AdapterManager
    queue/      TaskQueue
    judge/      prompt / Judge / parse / factcheck / permissions
    history/    HistoryStore / historyFile
    sites/      siteConfig
  state/        AppStateProvider / useTask
  shared/       types / sites / manifest / settings / prompts /
                storage / messaging / task / preview
  components/   AppShell / Workspace / ModelSelector / ResponseCard /
                MarkdownView / SitesView / SettingsView / HistoryView / ui/
  lib/ styles/  工具函数、设计令牌、Markdown 排版
vite.config.ts  vitest.config.ts  tailwind.config.ts  tsconfig*.json
```

## 命令

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | Vite 开发服务器 |
| `npm run typecheck` | 浏览器端与构建配置分别做 TypeScript 检查 |
| `npm test` | Vitest 单元测试 |
| `npm run build` | 类型检查 → 图标 → 三类产物 → dist 自检 |
| `npm run verify` | 单独运行 dist 静态自检 |
| `npm run package` | 构建并生成 `release/OmniAsk-<version>.zip` |

构建分三步写入同一个 `dist/`：多 HTML 入口（Vite ESM）、`background.js`、`content.js`（单文件 IIFE）。Content Script 不支持 ESM `import`，Service Worker 也用单文件避免模块加载差异。`manifest.json` 由 `src/shared/manifest.ts` 生成，版本号跟随 `package.json`，`host_permissions` 由内置站点 URL 推导为最小权限。

## 测试

**单元测试**（`npm test`）：任务队列并发/超时/重试/取消/部分失败、裁决提示词与 Markdown 解析、事实核查分类、URL 提取防编造、站点配置校验、任务状态工具函数。共 22 项。

**构建自检**（`npm run build` 自动执行）：Manifest 引用文件、HTML 本地资源、动态 import chunk、运行时脚本 IIFE 形态、图标 PNG 结构与 CRC，全部通过才算构建成功。

**浏览器手动测试清单**（尚未自动执行，需在有登录账号的浏览器中逐项验证）：

1. 加载 `dist/`，确认无 Manifest / CSP 报错，Popup 显示 SW 绿点。
2. 「模型管理」对每个要用的站点执行三类测试，按实际 DOM 调整选择器。
3. 发起 1 个模型的任务，验证输入注入、发送、流式提取、完成判定与耗时。
4. 发起 3 个模型的任务，验证并发上限、部分失败、停止任务、单模型重试。
5. 关闭并重新打开工作台，验证任务进度可恢复。
6. 配置裁决 API 并允许权限请求，验证综合答案、冲突、事实核查与右侧洞察。
7. 验证历史记录保存、删除、清空、导出 JSON 与导入恢复。
8. 验证深浅色主题、Popup / Side Panel / 工作台三种布局、复制与折叠交互。

## 发布

```bash
npm run package
```

产物：`release/OmniAsk-<version>.zip`，`manifest.json` 位于 ZIP 根目录。

**Chrome Web Store**：在 [Chrome Web Store Developer Dashboard](https://chrome.google.com/webstore/devconsole) 新建商品 → 上传 ZIP → 填写商店描述、分类、截图 → 在「权限」中逐项说明 `storage`（本地配置）、`tabs` / `scripting`（打开站点并注入适配器）、`sidePanel`（侧边栏）、内置站点 `host_permissions`（仅用于在这些站点提问）、`optional_host_permissions`（用户显式授权自定义站点与自配 API）→ 提交审核。

**Edge Add-ons**：在 [Microsoft Edge Add-ons 开发者中心](https://partner.microsoft.com/dashboard/microsoftedge/overview) 上传同一 ZIP（Chromium MV3 兼容），填写相同材料后提交。

商店材料建议：说明插件不收集账号密码/Cookie、问题与回答仅存本地、裁决 API 由用户自配、需用户自行登录各 AI 网站、内置适配器可能需要按网站 DOM 变化调整。

CI 会在 `main` 分支与 PR 上自动执行类型检查、单元测试与完整构建，并上传 `dist/` 作为 artifact。

## 隐私

- 不收集、不读取 AI 网站账号密码、Cookie、Session Token。
- 用户问题、模型回答、API Key 默认只保存在本机（`chrome.storage.local` / IndexedDB）。
- 裁决请求只发往你自行填写的 API 地址，不存在开发者后端。
- 仅在用户明确点击「开始提问」时执行提问。
- Markdown 中的外部图片不会自动加载（扩展 CSP 与隐私考虑），渲染为可点击链接。

## 已知限制（务必阅读）

1. **站点适配器未经真实验证**：9 个内置站点的选择器是初始候选值，网站 DOM 随时可能变化。本项目没有在这些站点的真实登录环境中做过端到端验证，**不宣称任何站点已兼容**。已针对实测反馈扩展 ChatGPT / Claude / 豆包的多候选选择器，并加入不依赖具体 DOM 的自动发现回退；仍请使用「模型管理」的测试功能确认并编辑选择器，无法适配时会显示明确错误，不会静默失败。
2. **浏览器端到端测试未执行**：单元测试与构建自检已通过，但真实扩展加载、登录、提问、回答提取与裁决 API 调用尚未在浏览器中实测，需按上面的清单手动验证。
3. **MV3 Service Worker 会被终止**：所有任务状态写入 `chrome.storage.local`，内容脚本每 10 秒发送心跳降低终止概率；若仍被终止，重启时会把残留任务明确标记为「后台服务中断，请重新提问」，**不做无缝续跑**。
4. **综合分析依赖自配 API**：未配置 API Key 时不会生成综合裁决，界面会显示明确错误；插件本身不具备模型推理能力。
5. **没有独立联网检索源**：「联网核查」只指示裁决模型优先核验；来源只能取自模型回答中真实出现的网址，其余结论一律标记「尚未验证」，绝不编造引用。综合答案的置信度不会给出 `high`，不代表绝对正确。
6. **扩展 CSP**：禁止远程脚本与 `eval`，所有代码本地打包；跨域 `fetch` 需要 `optional_host_permissions` 的显式授权。
7. **Shadow DOM / 反自动化策略**：适配器支持 open Shadow DOM，但 closed Shadow DOM、iframe 隔离或站点反自动化措施可能导致失败。
8. **登录判断**：没有配置可靠 DOM 规则时无法自动判断登录状态，界面会提示手动确认，不会猜测。

## 开发路线

P1 初始化 ✅ → P2 基础界面 ✅ → P3 适配器架构 ✅ → P4 首批站点适配（代码完成，未实测）✅ → P5 并发问答 ✅ → P6 综合分析 ✅ → P7 历史与设置 ✅ → P8 单元测试与优化 ✅（浏览器实测待手动）→ P9 发布准备 ✅

## 许可证

Apache-2.0，详见仓库根目录的 [LICENSE](LICENSE)。
