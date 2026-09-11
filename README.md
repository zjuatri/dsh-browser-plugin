# dsh-browser-plugin

**中文** · [English](./README.en.md)

给 DeepSeek Harness（DSH）使用的浏览器插件。它在右侧边栏提供一个可直接操作的浏览器，并让每个对话拥有独立的 Chrome 与浏览器资料目录。

换句话说：你可以在边栏里登录网站、填写表单或手动完成验证；智能体随后会继续使用**同一个对话、同一个浏览器**。其他对话无法访问其中的登录状态。

## 功能概览

- 在 DSH 右侧边栏增加「浏览器」标签页，支持点击、滚动、输入、地址栏和多标签页。
- 每个对话默认使用独立 Chrome 与 profile，Cookie、localStorage 和登录状态互不共享。
- 提供 `browser_goto`、`browser_click`、`browser_read`、`browser_screenshot` 等 15 个 `browser_*` 工具，供智能体操作网页。
- 边栏画面与智能体操作实时同步；同一对话内的人工与智能体操作会排队，避免互相抢页面。
- 可在普通无头模式和带真实窗口的隐身模式之间切换；切换时会尝试恢复当前页面。
- 默认拒绝子智能体使用浏览器，避免未经明确授权的委派任务访问登录态。

## 安装

### 方式一：本地 `file://` 引用

将以下内容加入 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`。仓库已提交 `lib/` 构建产物，因此直接使用本仓库时无需先构建。

```yaml
- insert:
    - id: dsh-browser-plugin
      name: "file:///D:/desktop/repos/dsh-browser-plugin/lib/index.js"
    # 建议同时启用：为 browser_* 工具提供额外的串行与子智能体保护
    - id: dsh-browser-gate
      name: "file:///D:/desktop/repos/dsh-browser-plugin/lib/gate.js"
```

请将路径替换为本机仓库的实际绝对路径。

### 方式二：通过 DSH 安装

```bash
dsh plugin add --profile web /path/to/dsh-browser-plugin
# 或
dsh plugin add --profile web git+https://github.com/zjuatri/dsh-browser-plugin.git
```

安装或更新宿主代码后，重启 `dsh web`。如果只改了客户端界面，刷新 DSH 页面即可。

## 开始使用

1. 打开一个 DSH 对话。
2. 在右侧边栏中打开「浏览器」。首次使用会为该对话启动 Chrome。
3. 在画面中手动打开网页、登录或完成需要人工确认的步骤。
4. 让智能体调用 `browser_*` 工具继续操作；它会接管此对话对应的同一浏览器。

边栏状态显示“智能体正在使用本对话的浏览器”时，手动操作会等待当前工具调用完成。这样可避免导航和表单输入交错。

## 浏览器模式

| 模式 | 适用场景 | 特点 |
| --- | --- | --- |
| 无头（默认） | 常规自动化 | 启动快；不显示 Chrome 窗口。将 `headed` 设为 `true` 可显示窗口。 |
| 隐身 / Stealth | 需要更接近真实浏览器的站点 | 总会启动一个真实窗口；会减少明显的自动化标记，但不能保证绕过网站验证。 |

两种模式使用同一对话的 profile，因此登录状态会保留。切换模式会重启该对话的浏览器，并尝试在新实例中打开当前地址；原有标签页不会完整迁移。

## 常用配置

所有配置均可选，完整定义见 [`src/config.ts`](./src/config.ts)。

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `chromePath` | Windows 系统 Chrome 路径 | Chrome 或 Chromium 可执行文件的绝对路径。 |
| `isolation` | `'session'` | `'session'` 为每个对话独立浏览器；`'shared'` 让所有对话共用一个浏览器。 |
| `userDataDir` | `''` | 会话隔离模式下是各对话 profile 的父目录；留空时使用 `~/.dsh/browser-profiles`。 |
| `maxBrowsers` | `4` | 最多保留的浏览器数；超出时优先关闭最久未使用的空闲浏览器。 |
| `idleTimeoutMs` | `600000` | 浏览器空闲多久后关闭，单位为毫秒；关闭不会删除 profile。设为 `0` 可关闭自动回收。 |
| `stealth` | `false` | 是否默认使用隐身模式。 |
| `headed` | `false` | 无头模式是否显示 Chrome 窗口；隐身模式始终显示窗口。 |
| `pane` | `true` | 是否启用右侧边栏的实时浏览器视图。 |
| `allowSubagents` | `false` | 是否允许子智能体和工作流子任务操作浏览器。 |
| `queueTimeoutMs` | `30000` | 人工边栏操作等待智能体释放浏览器的最长时间，单位为毫秒。 |
| `navTimeoutMs` | `45000` | 网页导航超时，单位为毫秒。 |
| `timeoutMs` | `60000` | 单次浏览器工具调用的超时，单位为毫秒。 |

示例：为 web profile 配置浏览器路径、降低并发上限，并默认启用隐身模式。

```yaml
- insert:
    - id: dsh-browser-plugin
      name: 'dsh-browser-plugin'
      config:
        chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        maxBrowsers: 2
        stealth: true
```

## 重要限制

- **隔离意味着要分别登录。** 每个对话有自己的 profile，不能直接复用其他对话或既有 Chrome profile 的 Cookie。Chrome 的 Cookie 加密机制也使“复制 Cookie”并不可靠。
- **浏览器会占用内存和磁盘。** 一个活跃 Chrome 通常占用约 150–250 MB；每个保留的 profile 通常占用约 10–40 MB。删除某个会话的 profile 目录即可清理它的浏览器数据，同时也会退出登录。
- **不要在两个 `dsh web` 实例中同时打开同一对话。** 两者会争用同一个 profile，后启动的 Chrome 可能无法启动。
- **隐身模式不是反检测保证。** 它只减少部分自动化特征，网站仍可能通过其他信号要求验证。
- **请优先在侧边栏中手动操作。** 隐身模式弹出的真实 Chrome 窗口不经过插件的串行队列；直接在那个窗口点击，可能与智能体当前的操作发生竞争。

## 开发

要求 Node.js 20 或更高版本。

```bash
npm run build      # 构建 lib/index.js、lib/gate.js、lib/client.js
npm test           # 运行测试
npm run link-deps  # 仅在本地开发环境缺少 DSH 依赖时使用
```

`lib/` 是发布与本地 `file://` 安装使用的构建产物，修改 `src/` 后请执行 `npm run build` 并提交相应产物。

主要目录：

```text
src/       插件宿主、浏览器运行时、边栏客户端与配置
skills/    提供给模型的浏览器操作技能说明
scripts/   构建与本地开发辅助脚本
test/      自动化测试
lib/       已构建的发布产物
```

## 许可

MIT，见 [`package.json`](./package.json)。运行时基于 `puppeteer-core`。
