# dsh-browser-plugin

[中文](./README.md) · **English**

A DeepSeek Harness (DSH) sidebar browser plugin. Each conversation gets its own Chrome and profile: after you sign in or complete a form in the pane, the agent continues in that same browser while other conversations cannot access its signed-in state.

## Features

- An interactive browser in the right sidebar with clicking, scrolling, typing, an address bar, and tabs.
- Fifteen `browser_*` tools for agent browsing, reading, and page interaction.
- Live synchronisation and queued human/agent actions within a conversation.
- Headless and stealth modes; stealth mode opens a real Chrome window.
- Performance/HD picture quality controls and DevTools for the displayed page from its context menu.

## Install

Add the following to `$DSH_HOME/profiles/<profile>/cordis.patch.yml`, replacing the paths with this checkout's absolute paths:

```yaml
- insert:
    - id: dsh-browser-plugin
      name: "file:///D:/desktop/repos/dsh-browser-plugin/lib/index.js"
    - id: dsh-browser-gate
      name: "file:///D:/desktop/repos/dsh-browser-plugin/lib/gate.js"
```

Or install the repository:

```bash
dsh plugin add --profile web /path/to/dsh-browser-plugin
```

Restart `dsh web` after installing or updating. Refresh the DSH page when only the client UI changes.

## Use

1. Open a DSH conversation and select **Browser** in the right sidebar.
2. Visit a site, sign in, or finish any step that needs a person.
3. Ask the agent to continue with `browser_*` tools in the same page.

When the status bar shows that the agent is using the browser, pane actions wait for its current call to finish so the two sides do not overwrite one another.

## Common configuration

See [`src/config.ts`](./src/config.ts) for every option.

| Option | Default | Description |
| --- | --- | --- |
| `chromePath` | system Chrome path | Path to the Chrome/Chromium executable. |
| `isolation` | `'session'` | One browser per conversation; use `'shared'` to share one browser. |
| `maxBrowsers` | `4` | Maximum number of browsers kept alive. |
| `stealth` | `false` | Start in stealth mode by default. |
| `paneQuality` | `'perf'` | Initial picture quality: `'perf'` or `'hd'`. |
| `allowSubagents` | `false` | Allow subagents to use the browser. |

## Notes

- Isolated conversations require separate logins.
- Stealth mode reduces only some automation signals; it cannot guarantee that a site accepts the session.
- Prefer interacting in the sidebar. Direct clicks in the Chrome window opened by stealth mode bypass the serial queue.
- The context-menu DevTools needs network access to Chrome's hosted frontend.

## Development

Requires Node.js 20 or later.

```bash
npm run build
npm test
```

After changing `src/`, rebuild and commit the `lib/` artifacts.

## License

MIT; see [`package.json`](./package.json).
