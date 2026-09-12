# dsh-browser-plugin

**中文** · [English](./README.en.md)

DeepSeek Harness（DSH）的侧边栏浏览器插件。每个对话使用独立的 Chrome 和 profile：你在边栏中登录、填写表单后，智能体会在同一浏览器中继续操作，其他对话无法访问登录状态。

## 功能

- 右侧边栏中的可交互浏览器：点击、滚动、输入、地址栏和多标签页。
- 15 个 `browser_*` 工具，供智能体浏览、读取和操作网页。
- 人工操作与智能体操作实时同步，并在同一对话中自动排队。
- 支持无头和隐身模式；隐身模式会显示真实 Chrome 窗口。
- 支持性能/高清画质切换，以及右键打开当前页面的 DevTools。

## 安装

将以下内容加入 `$DSH_HOME/profiles/<profile>/cordis.patch.yml`，并替换为仓库实际绝对路径：

```yaml
- insert:
    - id: dsh-browser-plugin
      name: "file:///D:/desktop/repos/dsh-browser-plugin/lib/index.js"
    - id: dsh-browser-gate
      name: "file:///D:/desktop/repos/dsh-browser-plugin/lib/gate.js"
```

也可以安装仓库：

```bash
dsh plugin add --profile web /path/to/dsh-browser-plugin
```

安装或更新后重启 `dsh web`；只改客户端界面时刷新 DSH 页面即可。

## 使用

1. 打开一个 DSH 对话，在右侧边栏中打开「浏览器」。
2. 手动访问网站、登录或完成需要人工确认的步骤。
3. 让智能体调用 `browser_*` 工具继续操作同一页面。

当状态栏显示智能体正在使用浏览器时，边栏操作会等待当前调用结束，避免互相覆盖。

## 常用配置

完整配置见 [`src/config.ts`](./src/config.ts)。

| 配置 | 默认值 | 说明 |
| --- | --- | --- |
| `chromePath` | 系统 Chrome 路径 | Chrome/Chromium 可执行文件路径。 |
| `isolation` | `'session'` | 每个对话独立浏览器；设为 `'shared'` 时全部对话共用。 |
| `maxBrowsers` | `4` | 同时保留的浏览器上限。 |
| `stealth` | `false` | 默认使用隐身模式。 |
| `paneQuality` | `'perf'` | 初始画质：`'perf'` 或 `'hd'`。 |
| `allowSubagents` | `false` | 是否允许子智能体操作浏览器。 |

## 注意事项

- 会话隔离意味着每个对话需要单独登录。
- 隐身模式仅减少部分自动化特征，不能保证通过网站验证。
- 请优先在侧边栏中操作；直接点击隐身模式弹出的 Chrome 窗口不会经过串行队列。
- 右键 DevTools 需要网络访问 Chrome 托管的调试前端。

## 开发

需要 Node.js 20 或更高版本。

```bash
npm run build
npm test
```

修改 `src/` 后需重新构建并提交 `lib/` 产物。

## 许可

MIT，见 [`package.json`](./package.json)。
