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
- 在画面上右键可直接打开**该页面**的开发者工具（在你自己的浏览器里新开一个标签页）。
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

## 画面画质

边栏底部除了浏览器模式，还有一个**性能｜高清**开关，决定画面以多高的分辨率抓取：

| 档位 | 抓帧方式 | 2× 屏上的观感 | 实测帧率 | 实测带宽 |
| --- | --- | --- | --- | --- |
| 性能（默认） | CDP 画面流（`Page.startScreencast`），每个 CSS 像素一个点 | 位图被插值放大 2 倍，比周围的原生文字糊 | 60 fps | 264 KB/s |
| 高清 | 每次变化补一张 2 倍截图（`clip.scale = 2`），每个物理像素一个点 | 帧宽正好等于面板的物理像素宽，**放大倍数 1.00**，和周围界面一样锐 | 14 fps | 198 KB/s |

（帧率与带宽是 567×642 的面板、持续动画下实测的：高清档每帧要重新光栅化 + 编码一次，约 30–70ms，所以帧率上限十几帧；单帧更大但帧数更少，**每秒带宽反而更低**。静态页面两档都不出帧。）

**选择会被记住**：它写在你浏览器的 `localStorage` 里，因此刷新页面、新开窗口、新开对话都还是你上次选的那一档；重启 `dsh web` 之后，视图一连上就会把记住的档位重新告诉宿主。档位是**全局**偏好（不是每个对话一份），随便哪一扇窗改了，其它已打开的窗会跟着一起变。

要改的是「新视图第一次打开时停在哪一档」，用配置项 `paneQuality`；不打算用手点的部署可以把它设成 `'hd'`。

> 高清档不适合看视频：14 fps 对读网页、点按钮足够，对连续动画会明显跳。反过来，性能档在 2× 屏上永远糊。这就是要两个档位的原因。

> 实现上有个坑值得记下来：**`Page.startScreencast` 拿不到 2 倍像素**。把 `deviceScaleFactor` 提到 2、或者给 `maxWidth`/`maxHeight` 都没用（后两者只是上限，只能缩小不能放大），画面流出来的帧永远等于 CSS 视口大小。所以高清档不复用画面流那一帧，而是拿它当「画面变了」的信号，再补一张 `Page.captureScreenshot` 带 `clip.scale = 2` 的截图（`clip` 的原点是页面坐标，因此要把滚动偏移带上）。取图本身会让合成器产生 damage、画面流随即再推一帧同样的画面 —— 不比对内容就会变成自激环（实测静态页面 2 秒 33 帧），所以只有内容真的变了才取图。

## 开发者工具

在侧边栏画面上右键，选择「打开该页面的开发者工具」，就会**在你自己的浏览器里新开一个标签页**，把 DevTools 接到画面中那一页上。无头模式下同样可用。

- 它打开的是**插件那只 Chrome** 的页面，而不是你正在看的这个 DSH 页面；后者用宿主浏览器自己的开发者工具（F12）即可。
- 地址来自 Chrome 自己给出的调试前端（`chrome-devtools-frontend.appspot.com/serve_rev/…`），也就是 `chrome://inspect` 用的同一套远程调试前端。
- 启动参数只放行了这个前端的 origin（`--remote-allow-origins=…`）。调试端口虽然只绑回环，但放行通配符会让浏览器里任意网页都能连上它、进而操作那只已登录的 Chrome，因此不使用通配。
- 隐身模式下也可以直接在那个真实窗口里按 F12，效果一样。
- 该前端由 Chrome 官方托管，需要能访问外网；无法访问时，新标签页会显示失败原因。

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
| `paneQuality` | `'perf'` | 新视图的初始画质档：`'perf'`（每个 CSS 像素，最省）或 `'hd'`（每个物理像素，2 倍抓帧）。边栏开关会覆盖它并记住选择。 |
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
- **开发者工具的界面来自外网。** 右键菜单打开的是 Chrome 托管的 DevTools 前端，无法访问 `chrome-devtools-frontend.appspot.com` 时它会失败（宿主会给出可读的错误页）。
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
