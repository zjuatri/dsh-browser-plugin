# dsh-browser-plugin

**English** · [中文](./README.md)

A browser plugin for DeepSeek Harness: the browser becomes **a tab in the right sidebar** (next to the Feishu plugin),
and **every conversation gets its own Chrome with its own profile** — what conversation A logged into, conversation B
cannot see.

- **Lives in the sidebar**: no more overlay pinned to the right edge fighting the main UI. It uses the product's own tab
  mechanism, follows the DSH light theme (blue on white), and its UI is in Chinese.
- **Per-conversation isolation**: the key is the session id — the tool side reads `exec.agent.id`, the view side reads the
  `sessionId` injected by the right-sidebar slot, and the two are the same value.
- **Two-way live view**: frames stream over CDP `Page.startScreencast` (JPEG only when the picture changes), synthetic
  mouse/wheel/keyboard input goes back into the page, and the viewport follows the panel's shape.
- **Two launch modes**: headless and stealth, switchable at runtime; the current page is carried across the switch.
- **Subagents cannot drive the browser by default** (configurable).

---

## Contents

- [What is in the package](#what-is-in-the-package)
- [Install](#install)
- [What it looks like](#what-it-looks-like)
- [Design](#design)
  - [One Chrome per conversation](#one-chrome-per-conversation)
  - [Two modes: headless and stealth](#two-modes-headless-and-stealth)
  - [Serialisation and subagents: two gates](#serialisation-and-subagents-two-gates)
  - [How the live view works](#how-the-live-view-works)
  - [Edge cases around launching and switching](#edge-cases-around-launching-and-switching)
- [Configuration](#configuration)
- [Development](#development)
- [Known boundaries](#known-boundaries)
- [License](#license)

---

## What is in the package

| Half | Artifact | Role |
| --- | --- | --- |
| Host | `lib/index.js` | Manages one Chrome per session (`BrowserSessions`); registers 15 `browser_*` tools and 5 bundled skills; serves the live-view routes on the shared web server |
| Client | `lib/client.js` | Registers the live view as a right-sidebar tab type (with a guide-page entry and an inline Chrome glyph) and stamps every request with its conversation's session id |
| Gate | `lib/gate.js` | **Mounted separately**: intercepts `browser_*` calls by tool name — per-session serialisation and the subagent policy, as a name-based backstop |

**15 tools**: `browser_goto`, `browser_evaluate`, `browser_screenshot`, `browser_click`, `browser_type`, `browser_read`,
`browser_wait_for`, `browser_back`, `browser_forward`, `browser_reload`, `browser_a11y`, `browser_tabs`,
`browser_tab_open`, `browser_tab_switch`, `browser_tab_close`.

**5 skills** (`skills/`, English instructions written for the model): `browser-interaction`, `browser-multitab`,
`browser-navigation`, `browser-search`, `browser-visual-check`.

---

## Install

The plugin is mounted through a profile patch layer. Pick either route.

**Route 1: explicit `file://` rows** (what this checkout uses; the build artifacts are committed, so no build is needed)

```yaml
# $DSH_HOME/profiles/<profile>/cordis.patch.yml
- insert:
    - id: dsh-browser-plugin
      name: "file:///D:/desktop/repos/dsh-browser-plugin/lib/index.js"
    # Recommended: the name-based backstop gate (per-session serialisation + subagent policy)
    - id: dsh-browser-gate
      name: "file:///D:/desktop/repos/dsh-browser-plugin/lib/gate.js"
```

**Route 2: `dsh plugin add`** (installs the package into the profile and mounts its bundled patch)

```bash
dsh plugin add --profile web /path/to/dsh-browser-plugin          # local directory
dsh plugin add --profile web git+https://github.com/zjuatri/dsh-browser-plugin.git
```

Then **restart `dsh web`**: the host half is loaded at boot, so a new build only takes effect after a restart.
The client half (`lib/client.js`) is read from disk on demand — a page refresh is enough for it.

**Dependencies**: `puppeteer-core` (installed with the package); `@deepseek-ai/*` comes from the profile.
Chrome is the system installation, path configurable (default `C:\Program Files\Google\Chrome\Application\chrome.exe`).

---

## What it looks like

A new "浏览器" (Browser) tab in the right sidebar, with a Chrome-glyph entry card on the guide page:

```
┌ tab strip: [ page title × ] [ + ] ───────────────────────┐
│  ←  →  ⟳   [ address bar          ] [ Go ]               │  ← toolbar (three stroked icons)
│                                                          │
│                   live view (click, scroll, type)         │
│                                                          │
│  ● Connected  [agent is using this conversation's …] URL  │  ← status line
│  [ Headless | Stealth ]                                   │  ← mode switch
└──────────────────────────────────────────────────────────┘
```

- **Status line**: connection state, the current URL, and "the agent is using this conversation's browser" — when that
  badge shows up, the agent holds this session's lock and your clicks are queued.
- **Mode switch**: `Headless` / `Stealth`, compared below.
- Clicks, scrolling and typing on the frame are **injected into the page for real** (CDP synthetic input), so you can log
  in, fill forms and paginate from the sidebar, and the agent continues in the same browser afterwards.

---

## Design

### One Chrome per conversation

The browser is **not shared across conversations**. The key is the session id: the tool side reads `exec.agent.id`, the view
side reads the `sessionId` injected by the right-sidebar slot (`scope: 'session'`). They are the same value (verified at
runtime), so "the page the agent drives" and "the page you see in this pane" are always the same browser, and no other
conversation can see it.

- **Registry**: `src/browser-sessions.ts` lazily creates a runtime, a lock and a view controller per session, and reclaims them.
- **One profile directory per session**: `~/.dsh/browser-profiles/<sessionId>` when `userDataDir` is empty; if you set an
  absolute path, it becomes the parent directory. Cookies and logins of each conversation are therefore independent and
  survive a `dsh web` restart.
- **Nameless sessions** (no agent context, or a view that cannot read `sessionId`) land on a browser with a temporary
  profile that is never written to disk.
- **Idle reclamation**: a Chrome is closed after `idleTimeoutMs` (10 minutes by default) with no view watching and no call
  running. The profile stays on disk, so the next use of that conversation relaunches Chrome with its logins intact.
- **Concurrency cap**: `maxBrowsers` (4 by default). Beyond it, the least recently used **idle** browser is closed first.
  The cap is a soft target: if nothing is idle, it is exceeded rather than killing a browser in use.
- **`isolation: 'shared'`** reverts to the old behaviour (one Chrome for every conversation).

**Costs (deliberate trade-offs)**: each conversation that uses a browser holds its own Chrome (roughly 150–250 MB), and
**each conversation must log in separately** — cookies cannot be migrated from an existing profile, because Chrome's
App-Bound Encryption invalidates copied cookies.

### Two modes: headless and stealth

Two ways to start the same browser. They share the same profile directory (so logins carry over) and switch at runtime.

| | Headless (`own`) | Stealth (the "plugin" mode) |
| --- | --- | --- |
| How it starts | The plugin `launch`es Chrome through puppeteer | The plugin `spawn`s Chrome itself and attaches over CDP |
| Window | None (`headless: true`; set `headed: true` to show one) | **Always a real window** — `headed` does not apply |
| Automation footprint | Includes `--enable-automation` → `navigator.webdriver === true` | Omits it and adds `--disable-blink-features=AutomationControlled` → `navigator.webdriver === false` |
| Anti-bot behaviour | Easily stopped by Cloudflare Turnstile-style challenges | Looks much more like a real browser (still not your own fingerprint) |
| Frame size | Purely CDP viewport emulation, following the sidebar panel's shape | Determined by the **window** size; adding viewport emulation on top would desynchronise frame and window, so the pane may letterbox |
| Startup | Fast (well under a second) | Slower: waits for Chrome to write its debugging port into `DevToolsActivePort` inside the profile (up to 10 s) |
| Notes | `--disable-gpu` when headless | Keeps the GPU; if the profile is already held by another Chrome it fails loudly instead of silently driving the wrong browser |

**The current page is carried across a switch.** Switching modes replaces the browser process, so tabs do not follow — the
plugin therefore remembers the current URL and navigates the new browser to it (capped at 8 seconds; a slow site is left
loading in the background). If the URL cannot be restored the new browser stays on a blank page: a failed carry never fails
the switch itself.

### Serialisation and subagents: two gates

Within one conversation, the agent's calls and your clicks in the pane act on the same tab of the same Chrome. Interleaving
them would fight over navigation and overwrite each other's form input, and `browser_read` would return whatever the other
side just navigated to — a silently wrong answer. The tool layer's `exclusive` scheduling does not help:
`dsh-agent-loop` builds one scheduler scope **per agent**, so it never serialises across sessions.

`src/browser-queue.ts` therefore provides a FIFO, cancellable mutex — **one per session**:

- **`src/browser-sessions.ts` (the one that is in force)**: agent calls (`exec.agent.id`) and pane operations (the
  `?session=` query parameter) both go through that session's lock.
- **`src/dsh-gate.ts` + `lib/gate.js` (name-based backstop)**: subscribes to `tools/pre-execute` and intercepts by tool
  name, with one queue per session. It covers the case where `browser_*` is executed by a different provider — it does not
  care who registered or who ends up running the call.
- **`src/tool-session.ts`**: wraps this plugin's own tool `execute` (there is exactly one registration site).

**Subagent policy**: subagents and workflow children have their own session ids; `ctx.agents.isOwnedBy(childId, parentAgent)`
— or simply "not in `roots()`" — marks them as delegated, and by default they **cannot** drive the browser
(`allowSubagents: false`). After isolation this is a **policy** rather than a necessity (a subagent would get its own Chrome
and could not touch the parent's logins); it stays off by default because every delegation could spin up another browser
process, and a subagent's prompt may come from somewhere else entirely.

### How the live view works

Every view route lives under `/browser-pane/…` and accepts `?session=<sessionId>`, which is how the host dispatches to that
conversation's browser:

- `GET /browser-pane/stream?session=…` — SSE: `state` (liveness, URL, current driver), `frame` (JPEG plus device size),
  `tabs` (the tab list).
- `POST /browser-pane/input?session=…` — synthetic input; plus `/goto`, `/back`, `/forward`, `/reload`, `/tab-*`, `/mode`
  and `/viewport`.

Three details worth calling out:

- **The viewport follows the panel**: the view measures its own container with `ResizeObserver` (the sidebar widens when you
  drag its divider while the window stays the same size, so `window.resize` never fires), throttles reports to every 150 ms,
  and the host debounces for 200 ms before calling `page.setViewport` and restarting the screencast so the next frame already
  has the new size. Measured: a 864×897 panel yields an 864×897 viewport *and* frame, identical aspect ratio, zero dead space.
- **The URL cannot ride on frames alone**: frames are pushed only when the picture changes, while the URL can change without
  a repaint (same-document anchors, history-only navigations). That produced "the agent already moved to another site while
  the address bar still shows the previous page". `PaneStream.syncUrl()` maintains the address separately: the page's
  `framenavigated` event plus a 400 ms fallback poll, broadcasting `state` only on change; a cross-document navigation also
  discards the cached frame.
- **The tab strip follows navigation**: `goto` ends with `notifyTabs()`, otherwise the chip keeps the previous page's title.

### Edge cases around launching and switching

- **Concurrent launches start exactly one browser**: the view (opening the pane starts the screencast immediately) and a tool
  call are two entry points that can both notice "this session has no browser yet" at the same moment. Launch attempts are
  therefore serialised and carry a generation number: switching modes invalidates (and closes) an attempt still in flight,
  which avoids both "Chrome refuses because the profile is already running" and an old-mode browser being installed back
  after the switch.
- **A failed mode switch rolls back** to the previous mode (wrong Chrome path, profile held by another instance) instead of
  pinning the runtime to a mode that cannot start.
- **View routes must wait for `webServer`**: they are registered through `ctx.inject(['webServer'], …)`. Probing with
  `ctx.get('webServer')` instead would silently drop every route whenever the plugin is applied before the web server — the
  tools keep working, the pane stays blank forever, and nothing is logged.

---

## Configuration

See `src/config.ts`. Everything is optional; defaults below.

| Option | Default | Meaning |
| --- | --- | --- |
| `chromePath` | system Chrome on Windows | Absolute path to the Chrome/Chromium executable |
| `isolation` | `'session'` | `'session'` = one Chrome per conversation; `'shared'` = one for all (old behaviour) |
| `userDataDir` | `''` | Under session isolation this is the **parent directory of the per-session subdirectories** (empty = `~/.dsh/browser-profiles`); in shared mode it is the profile itself (empty = temporary profile) |
| `maxBrowsers` | `4` | How many Chromes to keep alive; beyond it the least recently used idle one is closed |
| `idleTimeoutMs` | `600000` | How long an idle Chrome is kept (0 disables idle reclamation) |
| `stealth` | `false` | Start in the stealth mode |
| `headed` | `false` | Whether headless mode shows a window (stealth mode always does) |
| `viewport` | `{1920, 1080}` | Default viewport for new pages (the view rewrites it to the panel size) |
| `pane` | `true` | Whether to serve the live view (set false to skip the view routes) |
| `allowSubagents` | `false` | Whether subagents may drive the browser |
| `queueTimeoutMs` | `30000` | How long a pane action waits for the session lock before answering "try again later" |
| `navTimeoutMs` | `45000` | `page.goto` timeout |
| `scriptTimeoutMs` | `20000` | `page.setDefaultTimeout` (script/evaluate timeout) |
| `timeoutMs` | `60000` | Per-tool execution timeout |

---

## Development

```bash
npm run build      # lib/index.js + lib/gate.js + lib/client.js (zero-dependency bundler)
npm test           # 11 test files, most of them asserting the build artifacts
npm run link-deps  # one-off: link the missing @deepseek-ai/* and puppeteer-core into the workspace
```

The artifacts in `lib/` are committed, because local installs point `file://` straight at them — so a source change must be
rebuilt.

**Layout**

```
src/
  index.ts            plugin entry: registers tools and skills, mounts the view routes
  browser-sessions.ts per-session browser registry (isolation, idle reclamation, cap)
  browser.ts          runtime: tabs, navigation, screenshots, a11y tree, evaluate
  browser-launch.ts   launching and mode switching (serialised launches, carrying the URL)
  browser-queue.ts    the per-session FIFO, cancellable mutex
  tool-session.ts     tool-side gate (subagent policy + the session's lock)
  dsh-gate.ts / gate-entry.ts  the name-based backstop gate (a separate plugin)
  pane.ts             view routes (dispatched by ?session=)
  pane-stream.ts      SSE frames + synthetic input + driver broadcast
  pane-wire.ts        request/response schemas for the routes
  tools.ts / skills.ts / extract.ts / url.ts / config.ts / browser-types.ts
  client/             client half: tab body, live view, toolbar icons, copy and styles
test/                 11 test files (most assert the build artifacts)
scripts/              build scripts + three small helpers used only to verify the GUI locally
skills/               skill instructions bundled for the model (English)
```

**Tests** (`node --no-warnings test/run.mjs`):

| File | What it locks down |
| --- | --- |
| `browser-sessions.test.mjs` | Per-session isolation: distinct runtimes/locks/profiles, same-session reuse, directory-name sanitising, `shared` collapsing to one, idle reclamation skipping anything in use, LRU eviction above the cap, soft cap, teardown closing everything |
| `mode-switch.test.mjs` | Carrying the current URL across a mode switch (which URLs qualify) and concurrent-launch safety (one launch, invalidated attempts closed) |
| `gate.test.mjs` | Name-based interception, subagent denial with an actionable reason, `allowSubagents` pass-through, same-session FIFO serialisation, cross-session non-blocking, failures releasing the lock |
| `browser-queue.test.mjs` | The queue itself: `dispose()` failing every waiter, aborted signals never entering the queue |
| `tool-session.test.mjs` | The gate on this plugin's own tools; the wrapper never changes the model-visible surface (name/description/parameters/output schema/render) |
| `pane-stream.test.mjs` | Driver visibility; the URL following navigation (cached frame invalidation, listener and timer cleanup) |
| `host-bundle.test.mjs` | Host wiring: contract exports, deferred route registration and route coverage, tools resolving their session's runtime, views dispatching by `?session=`, config defaults |
| `apply-wiring.test.mjs` | Runs `apply` against the real artifact: the gate really is wrapped around the registered tools |
| `client-apply.test.mjs` | Runs the client `apply` in a minimal lazy-CJS host: tab type, guide entry, body and styles all register |
| `client-modules.test.mjs` | The two mistakes the hand-written bundler makes most easily: truncated multi-line imports and platform-seed named bindings missing from the module namespace |
| `client-bundle.test.mjs` | Client artifact shape: lazy-CJS wrapper, platform seeds only, types stripped, and the view reporting its session |

**The three local GUI helpers in `scripts/`** (unrelated to the plugin itself):

- `mint-cookie.mjs` — derives the browser-session cookie a running `dsh web` expects, from the signing secret in
  `$DSH_HOME/.credentials.yaml` (the `?token=` URL `dsh web` prints is single-use, so an agent cannot use it).
- `serve-bootstrap.mjs` — serves one page on any `127.0.0.1` port that writes that cookie and redirects to the GUI.
- `link-deps.mjs` — symlinks the dependencies the workspace lacks from the profile's dependency tree so the build scripts can
  really import the artifacts.

---

## Known boundaries

- **Each conversation logs in separately.** That is the price of isolation, not a defect: cookies in an existing shared
  profile cannot be migrated (Chrome's App-Bound Encryption invalidates copied cookies).
- **Disk usage grows with the number of conversations that used the browser**: about 10–40 MB per session under
  `~/.dsh/browser-profiles/`. Deleting a session's directory is a complete cleanup (that conversation gets logged out).
- **Two `dsh web` instances with the same conversation open** would contend for the same profile directory and the second
  Chrome would refuse to start. Day-to-day single-instance use is unaffected.
- **`navigator.webdriver === false` is not invisibility**: it only removes one obvious automation flag; sites may still
  detect automation through other signals.
- **The stealth window bypasses the lock**: clicking directly in that real window does not go through the plugin, so it can
  interleave with a call the agent is running. Operating from the pane is what gets queued.
- Opening the same conversation's browser tab in several windows/floating panels connects one SSE stream per pane; they all
  show the same browser (by design).

## License

MIT (see `package.json`). The runtime is built on `puppeteer-core`; the browser engine follows the structure of
`zenbu-labs/terminal-browser`, replacing the overlay approach of `@try-works/dsh-browser-agent`.
