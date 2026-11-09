# OmniAsk

一次提问，多模型回答，交叉验证，生成最佳答案。

基于 Chrome Extension Manifest V3 的浏览器插件：把同一个问题并行发送给你选择的多个 AI 网站，收集回答后由独立的裁决模型做结构化分析、冲突检测与事实核查，输出综合答案。

> **当前阶段：P1（项目初始化）**
> 已完成项目结构、Manifest V3、构建链路、设计系统、三个入口的基础 UI 与 UI ↔ Service Worker 消息自检。
> **尚未实现**：网站适配器、真实提问/回答提取、并发任务队列、AI 综合裁决、历史记录与设置。
> 内置站点的选择器仅为初始候选值，**未经过真实页面验证，不宣称任何站点已兼容**。

## 环境要求

- Node.js 20.19+（推荐 22.x）
- npm 10+
- Chrome / Edge 114+（`chrome.sidePanel` 最低版本要求）

## 安装与开发

```bash
npm install
npm run dev
```

`npm run dev` 启动 Vite 开发服务器，可直接访问 `/popup.html`、`/sidepanel.html`、`/app.html` 调试界面。
在普通网页中 `chrome.*` API 不可用，界面会显示「网页调试模式」，这是预期行为。

## 构建

```bash
npm run build
```

构建分三步，产物统一输出到 `dist/`：

| 步骤 | 命令 | 产物 |
|---|---|---|
| 页面 | `vite build --mode pages` | `popup.html`、`sidepanel.html`、`app.html`、`assets/`、`manifest.json`、`icons/` |
| 后台 | `vite build --mode background` | `background.js`（单文件 IIFE） |
| 内容脚本 | `vite build --mode content` | `content.js`（单文件 IIFE） |

Content Script 与 Service Worker 必须打包成单文件 IIFE：MV3 的 Content Script 不支持 ESM `import`，且扩展页 CSP 禁止远程脚本与 `eval`。`manifest.json` 由 `vite.config.ts` 中的插件依据 `src/shared/manifest.ts` 生成，版本号与 `package.json` 保持一致。

`npm run build` 末尾自动执行 `npm run verify`：静态校验 Manifest 引用文件、HTML 本地资源路径、运行时脚本的 IIFE 形态，以及四张图标的 PNG 结构与 CRC（当前 58 项），任何一项失败都会让构建以非零状态退出。

其他命令：

```bash
npm run typecheck   # 分别对浏览器端与构建配置做 TS 检查
npm run icons       # 重新生成 16/32/48/128 扩展图标
npm run verify      # 校验 dist 产物
npm run preview     # 预览构建产物（仅页面，非扩展环境）
```

## 加载扩展并自检

1. 执行 `npm run build`。
2. 打开 `chrome://extensions`（Edge 为 `edge://extensions`），开启「开发者模式」。
3. 选择「加载已解压的扩展程序」，指向项目下的 `dist/` 目录。
4. 点击工具栏 OmniAsk 图标打开 Popup：
   - 右上角状态应为 `SW v0.1.0`（绿色），表示 Service Worker 已响应。
   - 输入问题、选择模型、点击「开始提问」，会显示链路自检结果。
   - **P1 阶段不会向任何 AI 网站发送内容**，该按钮只验证消息链路。
5. 点击「完整工作台」打开独立问答页，可查看三栏布局；侧边栏通过浏览器侧边栏入口打开 `Side Panel`。
6. 点击月亮/太阳图标验证深色模式切换；深色模式偏好保存在本地。

`chrome://extensions` 的扩展详情页可点击「Service Worker」查看后台日志；在任一内置 AI 站点打开 DevTools Console，可看到 `[omniask] content script ready: ...` 日志，用于确认内容脚本注入成功。

## 目录结构

```
popup.html / sidepanel.html / app.html  三个 HTML 入口
public/icons/                           扩展图标（脚本生成，非二进制源文件）
scripts/generate-icons.mjs              纯 Node 生成 PNG
src/
  popup/ sidepanel/ app/                React 入口
  background/ content/                  MV3 运行时
  shared/    types / sites / manifest / settings / prompts / storage / messaging
  core/                                P3–P7：适配器、任务队列、裁决、历史
  components/  ui/                     基础组件与工作台界面
  lib/ styles/                        工具函数与设计令牌
vite.config.ts                         三模式构建 + Manifest 生成
```

## 隐私约定

- 不收集、不读取 AI 网站账号密码、Cookie、Session Token。
- 用户问题、模型回答、API Key 默认只保存在本地（`chrome.storage.local` / 后续 IndexedDB）。
- 裁决模型只调用用户自行配置的 OpenAI Compatible API，不存在开发者后端。
- 仅在用户明确点击「开始提问」时执行提问。

## 已知限制（浏览器 API）

- MV3 Service Worker 会被浏览器随时终止，P5 的任务队列必须把状态写入 `chrome.storage` 以支持恢复，不能依赖内存中的长任务。
- 扩展页面 CSP 禁止 `eval` / 远程脚本，所有前端代码必须本地打包。
- 自定义 AI 网站（P3）将通过 `chrome.scripting` 动态注入，避免申请 `<all_urls>` 全量权限；当前 `host_permissions` 仅包含内置站点。
- 目标站点可能使用 Shadow DOM、严格 CSP 或反自动化策略，适配器可能失效；实现时会明确报错并允许用户编辑选择器，不做静默降级。

## 开发路线

P1 初始化 → P2 基础插件界面 → P3 适配器架构 → P4 首批站点适配 → P5 并发问答 → P6 综合分析 → P7 历史与设置 → P8 测试优化 → P9 发布。

## 许可证

Apache-2.0，详见仓库根目录的 [LICENSE](LICENSE)。
