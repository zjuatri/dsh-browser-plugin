# dsh-browser-plugin

[中文](./README.md) · **English**

A browser plugin for DeepSeek Harness (DSH). It adds an interactive browser to the right sidebar and gives every conversation its own Chrome process and browser profile.

In practice, you can sign in to a site, fill in a form, or finish a human-verification step in the sidebar. The agent then continues in the **same browser for the same conversation**. Other conversations cannot access that signed-in state.

## Highlights

- Adds a **Browser** tab to the DSH right sidebar with clicking, scrolling, typing, an address bar, and tabs.
- Gives each conversation an isolated Chrome and profile by default, so cookies, local storage, and logins are not shared.
- Exposes 15 `browser_*` tools, including `browser_goto`, `browser_click`, `browser_read`, and `browser_screenshot`.
- Keeps the sidebar view and agent actions live and in sync. Human and agent actions in one conversation are queued to avoid fighting over a page.
- Switches between a standard headless mode and a visible stealth mode, while attempting to restore the current page on a switch.
- Opens DevTools for **the page in the view** from a right-click, in a new tab of your own browser.
- Denies browser access to subagents by default, so delegated work cannot access signed-in sessions without explicit permission.

## Installation

### Option 1: local `file://` reference

Add the following to `$DSH_HOME/profiles/<profile>/cordis.patch.yml`. Build files under `lib/` are committed, so a checkout can be used directly without an initial build.

```yaml
- insert:
    - id: dsh-browser-plugin
      name: "file:///D:/desktop/repos/dsh-browser-plugin/lib/index.js"
    # Recommended: an additional serialisation and subagent-safety gate for browser_* tools
    - id: dsh-browser-gate
      name: "file:///D:/desktop/repos/dsh-browser-plugin/lib/gate.js"
```

Replace the paths with this checkout's actual absolute paths.

### Option 2: install through DSH

```bash
dsh plugin add --profile web /path/to/dsh-browser-plugin
# or
dsh plugin add --profile web git+https://github.com/zjuatri/dsh-browser-plugin.git
```

Restart `dsh web` after installing or updating host code. If you only changed the client UI, refresh the DSH page instead.

## Quick start

1. Open a DSH conversation.
2. Open **Browser** in the right sidebar. Chrome starts for that conversation on first use.
3. Use the live view to open a site, sign in, or finish any step that needs a person.
4. Ask the agent to continue with `browser_*` tools; it uses that conversation's same browser.

When the sidebar says that the agent is using the conversation's browser, your manual actions wait until its current tool call finishes. This prevents competing navigations and form input.

## Browser modes

| Mode | Best for | Behaviour |
| --- | --- | --- |
| Headless (default) | Normal automation | Starts quickly and does not show a Chrome window. Set `headed` to `true` to show one. |
| Stealth | Sites that need a more browser-like session | Always launches a real window. It removes some obvious automation signals, but cannot guarantee that a site will accept the session. |

Both modes use the conversation's same profile, so logins persist. Switching modes restarts that conversation's browser and tries to open the current URL in the new instance; existing tabs are not fully migrated.

## Picture quality

Next to the browser modes, the pane's footer has a **Performance | HD** switch that decides how many pixels each frame carries:

| Level | How frames are captured | On a 2× display | Measured frame rate | Measured bandwidth |
| --- | --- | --- | --- | --- |
| Performance (default) | CDP screencast (`Page.startScreencast`), one point per CSS pixel | The bitmap is interpolated up 2×, softer than the surrounding UI text | 60 fps | 264 KB/s |
| HD | A 2× screenshot on every change (`clip.scale = 2`), one point per physical pixel | Frame width equals the pane's physical width, so the upscale factor is **1.00** and it is as crisp as the surrounding UI | 14 fps | 198 KB/s |

(Both measured on a 567×642 pane with a continuously animating page. An HD frame needs a fresh rasterization plus a JPEG encode — roughly 30–70 ms — which caps it at a dozen-odd fps; frames are larger but far fewer, so its **per-second bandwidth is actually lower**. Neither level sends anything on a static page.)

**The choice is remembered.** It is stored in your browser's `localStorage`, so it survives page reloads, new windows, and new conversations; after a `dsh web` restart the view hands the remembered level back to the host as soon as it connects. The level is a **global** preference (not per conversation): change it in any window and every other open window follows.

Use the `paneQuality` setting to choose which level a **newly opened** view starts at; set it to `'hd'` for a deployment where nobody wants to click.

> HD is not for watching video: 14 fps is fine for reading and clicking, visibly choppy for continuous animation. Performance, in turn, is always soft on a 2× display. That is why there are two levels.

> One implementation trap worth recording: **`Page.startScreencast` cannot produce 2× pixels.** Raising `deviceScaleFactor` to 2 or passing `maxWidth`/`maxHeight` changes nothing (those are caps; they can only shrink), and screencast frames are always exactly the CSS viewport size. So HD does not reuse the screencast frame: it uses it only as a "the picture changed" signal and then takes a `Page.captureScreenshot` with `clip.scale = 2` (`clip` is in page coordinates, so the scroll offset has to be added). Taking that screenshot makes the compositor dirty, which makes the screencast emit the same picture again — without comparing content this becomes a self-feeding loop (33 frames in 2 s on a static page, measured), so a capture happens only when the content actually changed.

## DevTools

Right-click the live view and choose **Open DevTools for this page**. DevTools opens in a new tab of your own browser and attaches to the page shown in the view. This works in headless mode too.

- It debugs **the plugin's Chrome**, not the DSH page you are looking at; for that one, use your browser's own DevTools (F12).
- The URL comes from Chrome itself (`chrome-devtools-frontend.appspot.com/serve_rev/…`) — the same remote-debugging frontend `chrome://inspect` uses.
- The launch flags allow exactly that frontend origin (`--remote-allow-origins=…`). The debugging port only listens on loopback, but a wildcard would let any web page in your browser attach to it and drive the signed-in Chrome, so no wildcard is used.
- In stealth mode you can also press F12 in the real window; the result is the same.
- That frontend is hosted by Chrome and needs internet access. When it is unreachable, the new tab shows the failure reason.

## Common configuration

Every option is optional. See [`src/config.ts`](./src/config.ts) for the complete definition.

| Option | Default | Description |
| --- | --- | --- |
| `chromePath` | system Chrome path on Windows | Absolute path to the Chrome or Chromium executable. |
| `isolation` | `'session'` | `'session'` gives every conversation a browser; `'shared'` makes all conversations share one. |
| `userDataDir` | `''` | In session mode, the parent directory for conversation profiles; empty uses `~/.dsh/browser-profiles`. |
| `maxBrowsers` | `4` | Number of browsers kept alive; the least recently used idle browser is closed first. |
| `idleTimeoutMs` | `600000` | Idle time before a browser closes, in milliseconds. Closing keeps its profile. Set `0` to disable cleanup. |
| `stealth` | `false` | Start in stealth mode by default. |
| `headed` | `false` | Show a Chrome window in headless mode; stealth mode always shows one. |
| `pane` | `true` | Enable the sidebar's live browser view. |
| `paneQuality` | `'perf'` | Initial picture quality for new views: `'perf'` (one point per CSS pixel, cheapest) or `'hd'` (one point per physical pixel, 2× capture). The in-pane switch overrides it and remembers the choice. |
| `allowSubagents` | `false` | Allow subagents and workflow children to use the browser. |
| `queueTimeoutMs` | `30000` | Maximum milliseconds for a sidebar action to wait for the agent to release the browser. |
| `navTimeoutMs` | `45000` | Page-navigation timeout in milliseconds. |
| `timeoutMs` | `60000` | Timeout for one browser tool call in milliseconds. |

Example: configure a Chrome path, lower the browser cap, and start in stealth mode for the web profile.

```yaml
- insert:
    - id: dsh-browser-plugin
      name: 'dsh-browser-plugin'
      config:
        chromePath: 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe'
        maxBrowsers: 2
        stealth: true
```

## Important limitations

- **Isolation means separate logins.** Each conversation has its own profile. You cannot directly reuse cookies from another conversation or an existing Chrome profile, and Chrome's cookie encryption makes copying cookies unreliable.
- **Browsers use memory and disk.** An active Chrome usually uses about 150–250 MB; each retained profile is typically about 10–40 MB. Deleting a conversation's profile directory clears its browser data and signs it out.
- **Do not open the same conversation in two `dsh web` instances at once.** They contend for the same profile, and the later Chrome may fail to start.
- **Stealth is not an anti-detection guarantee.** It removes only some automation signals; a website may still require verification for other reasons.
- **The DevTools UI comes from the network.** The context menu opens Chrome's hosted DevTools frontend; without access to `chrome-devtools-frontend.appspot.com` it fails (the host serves a readable error page).
- **Prefer manual interaction in the sidebar.** The real Chrome window opened by stealth mode bypasses the plugin's serial queue. Clicking in it can conflict with an action the agent is currently running.

## Development

Requires Node.js 20 or later.

```bash
npm run build      # Build lib/index.js, lib/gate.js, and lib/client.js
npm test           # Run the test suite
npm run link-deps  # Use only when a local development setup lacks DSH dependencies
```

`lib/` contains the build artifacts used by publishing and local `file://` installs. After changing `src/`, run `npm run build` and commit the corresponding artifacts.

Main directories:

```text
src/       Plugin host, browser runtime, sidebar client, and configuration
skills/    Browser-operation instructions supplied to the model
scripts/   Build and local-development helper scripts
test/      Automated tests
lib/       Committed build artifacts
```

## License

MIT; see [`package.json`](./package.json). The runtime uses `puppeteer-core`.
