# dsh-browser-plugin

[English](./README.en.md) · **中文**

给 DeepSeek Harness 用的浏览器插件：把浏览器做成**右侧边栏里的一个标签页**（和飞书插件并列），
**每个对话一只 Chrome、各自一份 profile** —— A 对话登录过的站点，B 对话看不见。

- **进侧边栏**：不再是贴着右边缘、和主界面抢位置的浮层；走产品自带的标签页机制，配色跟随 DSH 亮色主题（蓝白），界面全中文。
- **按会话隔离**：键是会话 id —— 工具侧取 `exec.agent.id`，视图侧取右侧边栏槽位注入的 `sessionId`，两者是同一个值。
- **双向实时视图**：CDP `Page.startScreencast` 推帧（只在画面变化时推 JPEG），鼠标/滚轮/键盘合成输入回灌页面；视口跟着面板形状走。
- **两种启动方式**：无头与插件（隐身）一键切换，切换时当前页面会跟过去。
- **子智能体默认不能驱动浏览器**（可配置）。

---

## 目录

- [装了什么](#装了什么)
- [安装](#安装)
- [你会看到什么](#你会看到什么)
- [核心设计](#核心设计)
  - [每个会话一只 Chrome](#每个会话一只-chrome)
  - [两种模式：无头 与 插件](#两种模式无头-与-插件)
  - [串行与子智能体：两道闸门](#串行与子智能体两道闸门)
  - [实时视图是怎么来的](#实时视图是怎么来的)
  - [启动与切换的边界情况](#启动与切换的边界情况)
- [配置项](#配置项)
- [开发](#开发)
- [已知边界](#已知边界)
- [许可](#许可)

---

## 装了什么

| 半边 | 产物 | 作用 |
| --- | --- | --- |
| 宿主 | `lib/index.js` | 按会话管理 Chrome（`BrowserSessions`）；注册 15 个 `browser_*` 工具与 5 个打包技能；在共享 Web 服务器上挂实时视图路由 |
| 客户端 | `lib/client.js` | 把实时视图注册成右侧边栏的标签页类型（含指南页入口，图标为内联 Chrome 标），并把所在会话的 id 带在每次请求上 |
| 闸门 | `lib/gate.js` | **独立挂载**：按工具名拦截 `browser_*` 调用，做同会话串行 + 子智能体策略（按名字的兜底） |

**15 个工具**：`browser_goto`、`browser_evaluate`、`browser_screenshot`、`browser_click`、`browser_type`、`browser_read`、
`browser_wait_for`、`browser_back`、`browser_forward`、`browser_reload`、`browser_a11y`、`browser_tabs`、
`browser_tab_open`、`browser_tab_switch`、`browser_tab_close`。

**5 个技能**（`skills/`，给模型看的英文说明书）：`browser-interaction`、`browser-multitab`、`browser-navigation`、
`browser-search`、`browser-visual-check`。

---

## 安装

插件通过 profile 的补丁层挂载。两种方式，任选一种。

**方式一：显式 `file://` 行**（本机部署用的就是这个；产物已提交，不需要构建）

```yaml
# $DSH_HOME/profiles/<profile>/cordis.patch.yml
- insert:
    - id: dsh-browser-plugin
      name: "file:///D:/desktop/repos/dsh-browser-plugin/lib/index.js"
    # 推荐：按工具名的兜底闸门（同会话串行 + 子智能体策略）
    - id: dsh-browser-gate
      name: "file:///D:/desktop/repos/dsh-browser-plugin/lib/gate.js"
```

**方式二：`dsh plugin add`**（把包装进 profile，并挂上它自带的 bundle 补丁）

```bash
dsh plugin add --profile web /path/to/dsh-browser-plugin          # 本地目录
dsh plugin add --profile web git+https://github.com/zjuatri/dsh-browser-plugin.git
```

装完**重启 `dsh web`**：宿主半边是启动时加载的，换构建产物必须重启才生效；客户端半边（`lib/client.js`）
是按需从磁盘取的，改它只需要刷新页面。

**依赖**：`puppeteer-core`（随包安装）；`@deepseek-ai/*` 由 profile 提供。Chrome 用系统安装的那个，
路径可配（默认 `C:\Program Files\Google\Chrome\Application\chrome.exe`）。

---

## 你会看到什么

右侧边栏里多出一个「浏览器」标签页（指南页上是一张带 Chrome 标的入口卡片）：

```
┌ 标签条：[ 页面标题 × ] [ + ] ────────────────────────────┐
│  ←  →  ⟳   [ 地址栏              ] [ 打开 ]              │  ← 工具栏（三个描边图标）
│                                                          │
│                   实时画面（可点、可滚、可输入）            │
│                                                          │
│  ● 已连接  [智能体正在使用本对话的浏览器，正在排队…]  URL  │  ← 状态行
│  [ 无头 | 插件 ]                                          │  ← 模式切换
└──────────────────────────────────────────────────────────┘
```

- **状态行**：连接状态、当前地址，以及「智能体正在使用本对话的浏览器」——出现它说明智能体正持有这把锁，你的点击在排队。
- **模式切换**：`无头` / `插件`，见下节对比。
- 画面上的点击/滚动/输入会**真的送进页面**（CDP 合成输入），因此你可以在侧边栏里直接登录、填表、翻页，
  智能体接着用同一只浏览器继续干活。

---

## 核心设计

### 每个会话一只 Chrome

浏览器**不跨对话共享**。键就是会话 id：工具侧取 `exec.agent.id`，视图侧取右侧边栏槽位（`scope: 'session'`）
注入的 `sessionId`。实测两者是同一个值，所以「智能体在操作的页面」与「你在这扇窗里看到的页面」永远是同一只浏览器，
而别的对话看不到它。

- **注册表**：`src/browser-sessions.ts`。按会话懒建运行时、锁与视图控制器，并负责回收。
- **profile 按会话分目录**：`userDataDir` 留空时是 `~/.dsh/browser-profiles/<sessionId>`；填了绝对路径则用它作父目录。
  于是每个对话的 Cookie / 登录态各自独立，重启 `dsh web` 也还在。
- **无名会话**（没有 agent 上下文、或视图拿不到 `sessionId`）落到一只临时 profile 的浏览器上，不落盘。
- **空闲回收**：`idleTimeoutMs`（默认 10 分钟）内既没有视图在看、也没有调用在跑，就关掉那只 Chrome
  （profile 留在磁盘上，下次这个会话再用浏览器时重新拉起，登录态还在）。
- **并发上限**：`maxBrowsers`（默认 4），超出时先关最久未用的**空闲**那只。上限是软目标：没有空闲可关时宁可暂时超出，
  也不掐掉正在用的。
- **`isolation: 'shared'`** 可退回旧行为（所有对话共用一只 Chrome）。

**代价（都是有意的取舍）**：每个用浏览器的对话各占一只 Chrome（约 150–250MB）；
**每个对话要各自登录一次** —— 已有 profile 里的 Cookie 搬不过去，Chrome 的 App-Bound Encryption
会让拷贝过去的 Cookie 失效。

### 两种模式：无头 与 插件

同一只浏览器的两种启动方式，profile 目录相同（登录态共用），一键切换。

| | 无头（`own`） | 插件（`stealth`） |
| --- | --- | --- |
| 怎么起来 | 本插件用 puppeteer 直接 `launch` 一只 Chrome | 自己拼命令行 `spawn` 一只 Chrome，再用 CDP 挂上去 |
| 有没有窗口 | 没有（`headless: true`；配置 `headed: true` 才会出现窗口） | **一定有真实窗口**，`headed` 管不着它 |
| 自动化痕迹 | 带 `--enable-automation` → `navigator.webdriver === true` | 不带该参数，并加 `--disable-blink-features=AutomationControlled` → `navigator.webdriver === false` |
| 反爬表现 | 容易被 Cloudflare Turnstile 之类的验证页拦住 | 明显更像真人浏览器（但仍不是你本人的指纹） |
| 画面尺寸 | 完全由 CDP 视口模拟，跟着侧边栏面板形状走 | 由**窗口**尺寸决定；再叠视口模拟只会让画面和窗口对不上，因此侧边栏里可能等比缩放/留白 |
| 启动速度 | 快（不到 1 秒） | 慢一点：要等 Chrome 把调试端口写进 profile 里的 `DevToolsActivePort`，最多等 10 秒 |
| 其他 | 无头时 `--disable-gpu` | 保留 GPU；profile 被别的 Chrome 实例占用时直接报错，而不是悄悄驱动错的浏览器 |

**切换时当前页面会跟过去**：换模式等于换一个浏览器进程，标签页不会跟过去，所以插件会记下当前地址，
在新浏览器里重新导航过去（等待上限 8 秒，慢站点就让它继续在后台加载）。地址带不过去时留在空白页，
**不会**因为带地址失败而让模式切换失败。

### 串行与子智能体：两道闸门

同一个会话内，智能体的调用与人在侧边栏上的点击作用于同一只 Chrome 的同一个活动标签页。
交错执行会互相抢导航、互相覆盖表单，`browser_read` 读到的是对方刚翻到的页面 —— 静默的错误答案。
而工具层的 `exclusive` 帮不上忙：`dsh-agent-loop` 的调度器是**每个 agent 一个 scope**，不跨会话。

因此 `src/browser-queue.ts` 提供一把 FIFO、可取消的互斥锁，**每个会话一把**：

- **`src/browser-sessions.ts`（生效的一处）**：工具调用（`exec.agent.id`）与视图操作（请求上的 `?session=`）都从该会话这把锁过。
- **`src/dsh-gate.ts` + `lib/gate.js`（按名字的兜底）**：挂在 `tools/pre-execute` 上按工具名拦截，同样按会话分队列。
  它防的是「`browser_*` 由别的提供方执行」这种组合 —— 与谁注册、谁最终执行无关。
- **`src/tool-session.ts`**：把闸门套在本插件自己的工具 `execute` 上（注册点只有一处）。

**子智能体策略**：subagent / workflow 的子 agent 各有独立 session id，由 `ctx.agents.isOwnedBy(childId, parentAgent)`，
或「不在 `roots()` 名单里」，判定为委派出来的，默认**不能**驱动浏览器（`allowSubagents: false`）。
隔离之后这条已是**策略**而非必需（子 agent 本可拿到自己的一只 Chrome，碰不到主对话的登录态），
保留默认关闭是因为每委派一次就可能多起一个浏览器进程，而子 agent 背后的提示词可能来自别处。

### 实时视图是怎么来的

所有视图路由都是 `/browser-pane/…`，并接受 `?session=<sessionId>`，宿主按它分发到该会话自己的浏览器：

- `GET /browser-pane/stream?session=…` —— SSE：`state`（存活/地址/驱动者）、`frame`（JPEG + 设备尺寸）、`tabs`（标签页集合）。
- `POST /browser-pane/input?session=…` —— 合成输入；`/goto`、`/back`、`/forward`、`/reload`、`/tab-*`、`/mode`、`/viewport` 各一条。

三处细节值得一说：

- **视口跟着面板走**：视图用 `ResizeObserver` 量自己的容器（侧边栏靠拖动分隔条变宽，窗口不变，所以 `window.resize` 根本不触发），
  限流 150ms 上报，宿主防抖 200ms 后 `page.setViewport` 并重启画面流，让下一帧就是新尺寸。
  实测面板 864×897 时，浏览器视口与画面同为 864×897，比例一致、下方空白为 0。
- **地址不能只跟着画面帧**：帧只在画面变化时推，而地址变化不一定改画面（同文档锚点、只改 history 的导航），
  于是会出现「智能体已经跳到别的网站，侧边栏地址栏还停在上一页」。地址由 `PaneStream.syncUrl()` 单独维护：
  页面 `framenavigated` 事件 + 400ms 兜底轮询，变了才广播 `state`；跨文档导航时缓存帧一并作废。
- **`goto` 之后标签条会更新**：导航结束会 `notifyTabs()`，否则标签条上一直挂着上一页的名字。

### 启动与切换的边界情况

- **并发启动只起一只**：视图（SSE 一接入就开画面流）与工具调用是两个入口，都可能在「这个会话还没有浏览器」的同一刻动手。
  启动尝试因此串行化，并带一个世代号：切换模式会作废还在启动中的那一次（并把它关掉），
  避免「同时启动同一个 profile 被 Chrome 拒绝」，也避免旧模式的实例在新模式生效后被装回来。
- **模式切换失败会回滚**：新浏览器起不来时（Chrome 路径不对、profile 被别的实例占着）退回切换前的模式，
  而不是把运行时永久钉死在起不来的那一档。
- **视图路由必须等 `webServer` 就绪**：用 `ctx.inject(['webServer'], …)` 延迟注册。
  如果改用 `ctx.get('webServer')` 探一下，而插件恰好排在 Web 服务器之前被应用，就会静默丢掉整批路由 ——
  现象是工具一切正常、侧边栏里画面永远空白且没有任何报错。

---

## 配置项

见 `src/config.ts`。全部可选，下面是默认值。

| 配置 | 默认 | 说明 |
| --- | --- | --- |
| `chromePath` | Windows 上的系统 Chrome | Chrome/Chromium 可执行文件绝对路径 |
| `isolation` | `'session'` | `'session'` 每个会话一只 Chrome；`'shared'` 全部会话共用一只（旧行为） |
| `userDataDir` | `''` | 按会话隔离时是**各会话子目录的父目录**（留空 = `~/.dsh/browser-profiles`）；共享模式下就是它本身（留空 = 临时 profile） |
| `maxBrowsers` | `4` | 同时最多保留几只 Chrome，超出先关最久未用的空闲那只 |
| `idleTimeoutMs` | `600000` | 空闲多久关掉一只 Chrome（0 = 不做空闲回收） |
| `stealth` | `false` | 启动时进入插件（隐身）模式 |
| `headed` | `false` | 无头模式是否显示窗口（插件模式始终有窗口） |
| `viewport` | `{1920, 1080}` | 新页面的默认视口（视图接入后会按面板尺寸改写） |
| `pane` | `true` | 是否提供实时视图（设为 false 则不挂视图路由） |
| `allowSubagents` | `false` | 是否允许子智能体驱动浏览器 |
| `queueTimeoutMs` | `30000` | 视图操作等待该会话锁的上限；超时返回「稍后重试」而不是无限期挂住 |
| `navTimeoutMs` | `45000` | `page.goto` 超时 |
| `scriptTimeoutMs` | `20000` | `page.setDefaultTimeout`（脚本/求值通用超时） |
| `timeoutMs` | `60000` | 单个工具的执行超时 |

---

## 开发

```bash
npm run build      # lib/index.js + lib/gate.js + lib/client.js（零依赖自写打包器）
npm test           # 11 个测试文件，多数跑在构建产物上
npm run link-deps  # 一次性：把工作区缺的 @deepseek-ai/* 与 puppeteer-core 链接到 profile 的依赖树
```

产物（`lib/`）是提交进仓库的：本机部署用 `file://` 直接指向它，因此改完源码必须重新构建。

**项目结构**

```
src/
  index.ts            插件入口：注册工具与技能、挂视图路由
  browser-sessions.ts 按会话的浏览器注册表（隔离、空闲回收、上限）
  browser.ts          运行时：标签页、导航、截图、无障碍、求值
  browser-launch.ts   启动与模式切换（含并发启动串行化、地址带过去）
  browser-queue.ts    每会话一把 FIFO、可取消的互斥锁
  tool-session.ts     工具侧闸门（子智能体策略 + 按会话取锁）
  dsh-gate.ts / gate-entry.ts  按工具名的兜底闸门（独立插件）
  pane.ts             视图路由（按 ?session= 分发）
  pane-stream.ts      SSE 画面流 + 合成输入 + 驱动者广播
  pane-wire.ts        路由的请求/响应 schema
  tools.ts / skills.ts / extract.ts / url.ts / config.ts / browser-types.ts
  client/             客户端半边：标签页正文、实时视图、工具栏图标、文本与样式
test/                 11 个测试文件（多数断言构建产物）
scripts/              构建脚本 + 三个只为本机验证 GUI 而写的小工具
skills/               打包给模型的技能说明书（英文）
```

**测试**（`node --no-warnings test/run.mjs`）：

| 文件 | 守住什么 |
| --- | --- |
| `browser-sessions.test.mjs` | 按会话隔离：不同会话不同运行时/锁/profile；同一会话复用；目录名消毒；`shared` 退回一只；空闲回收只关真正空闲的；超限先关最久未用；上限是软目标；拆除全关 |
| `mode-switch.test.mjs` | 切换模式把当前地址带过去（哪些地址值得带）+ 启动并发安全（只起一只、作废的实例要关掉） |
| `gate.test.mjs` | 按名字拦截、子智能体被拒且理由可读、`allowSubagents` 放行、同会话串行且 FIFO、跨会话不阻塞、失败不锁死 |
| `browser-queue.test.mjs` | 队列本身：`dispose()` 让等待者全部失败、已中止的信号不入队 |
| `tool-session.test.mjs` | 插件自家工具上的闸门；包装不改对模型可见的工具面（名称/描述/参数/输出 schema/render 全等） |
| `pane-stream.test.mjs` | 驱动者可见；地址跟随导航（含缓存帧作废、监听与定时器清理） |
| `host-bundle.test.mjs` | 宿主接线：契约导出、路由延迟注册且齐全、工具按会话取运行时、视图按 `?session=` 分发、配置默认值 |
| `apply-wiring.test.mjs` | 在产物上真跑一遍 `apply`：闸门确实套在注册出去的工具上 |
| `client-apply.test.mjs` | 在 Node 里搭最小 lazy-CJS 宿主真跑一遍客户端 `apply`：标签页类型、指南页入口、正文与样式都注册 |
| `client-modules.test.mjs` | 自写打包器最容易出的两类错：多行 import 被截断、平台种子的具名绑定没进命名空间 |
| `client-bundle.test.mjs` | 客户端产物形状：lazy-CJS 包装、只 require 平台种子、类型语法已剥净、视图自报会话 |

**`scripts/` 里的三个本机验证工具**（与插件本身无关）：

- `mint-cookie.mjs` —— 用 `$DSH_HOME/.credentials.yaml` 里的签名密钥算出运行中 `dsh web` 所需的浏览器会话 Cookie
  （`dsh web` 打印的 `?token=` URL 是一次性的，agent 拿不到）。
- `serve-bootstrap.mjs` —— 在任意 `127.0.0.1` 端口上提供一个页面，把该 Cookie 写进浏览器再跳到 GUI。
- `link-deps.mjs` —— 把工作区缺的依赖符号链接到 profile 的依赖树，好让构建脚本能真实 import 产物。

---

## 已知边界

- **每个对话要各自登录一次**：这是隔离的代价，不是缺陷。旧共享 profile 里的 Cookie 无法迁移
  （Chrome 的 App-Bound Encryption 会让拷贝过去的 Cookie 失效）。
- **磁盘会随用过的对话数增长**：每个会话一份 profile（约 10–40MB），落在 `~/.dsh/browser-profiles/`。
  直接删掉某个会话的目录即可清理（等于那个对话登出）。
- **同时开两个 `dsh web` 实例、并在两边打开同一个对话**时，两边会争用同一个 profile 目录，
  Chrome 会拒绝启动第二个。日常单实例不受影响。
- **`navigator.webdriver === false` 不等于隐身**：它只是少了一个明显的自动化标记，
  站点仍可能用别的信号判断自动化。
- **插件模式的那个真实窗口绕不过串行锁**：你直接在那个窗口里点击不经过插件，
  智能体同时在跑调用时两边可能交错；从侧边栏画面操作才会排队。
- 同一个会话的浏览器标签页在多个窗口/浮动面板里打开时，会各自连一条 SSE，看到的是同一只浏览器（这是有意的）。

## 许可

MIT（见 `package.json`）。运行时基于 `puppeteer-core`；浏览器引擎沿用
`zenbu-labs/terminal-browser` 的结构，并替代 `@try-works/dsh-browser-agent` 的浮层方案。
