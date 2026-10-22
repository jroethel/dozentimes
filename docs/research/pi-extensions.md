# pi extension reference for pi-time

Verified against pi 1.3.0 on 2026-10-22 (node v26.12.0, macOS).
Doc paths are relative to `/opt/homebrew/lib/node_modules/@earendil-works/pi-coding-agent/docs/`.
Types are in `dist/core/extensions/types.d.ts` (cited as types.d.ts).
"Verified" means I ran it in a scratch agent dir.
"Doc" means read in the docs only.

## 1. Isolated config dir and auth

- `PI_CODING_AGENT_DIR` overrides the agent dir, default `~/.pi/agent` (environment-variables.md:81, configuration.md:9). Verified.
- Sessions follow the agent dir unless `PI_CODING_AGENT_SESSION_DIR`, `--session-dir` or `sessionDir` is set (environment-variables.md:82, cli.md:96).
- The agent dir holds settings.json, auth.json, models.json, mcp.json, AGENTS.md or CLAUDE.md, SYSTEM.md, APPEND_SYSTEM.md, extensions/, skills/, prompts/, themes/ (configuration.md:11-24).
- auth.json is read from `<agent-dir>/auth.json` (configuration.md:17). A symlink to `~/.pi/agent/auth.json` worked and authenticated provider zai. Verified.
- Credential precedence is `--api-key`, then auth.json, then models.json apiKey, then provider env vars (models.md:23). Env vars must be in the pi process (models.md:201).
- Alternative to a symlink: set the provider key via env var, for example the zai key env var in providers.md.
- `/login` writes to the agent dir auth.json. With a symlink, refreshed OAuth tokens write through to the real file.
- Project config lives in `<cwd>/.pi/` and loads only after project trust (configuration.md:3, 26-37).
- Project `.pi/extensions`, `.pi/skills`, `.pi/settings.json`, `.pi/SYSTEM.md` and project `.agents/skills` are trust-gated (security.md:37-43).
- A bare `.pi` dir needs no trust (security.md:45).
- Print, JSON and RPC modes cannot prompt. Without a decision they load project resources only if `defaultProjectTrust` is `"always"` (security.md:77-80).
- `-a/--approve` trusts the project for one process, `-na` ignores it (cli.md:237-240). Verified: with `-a`, `<cwd>/.pi/extensions/proj.ts` loaded alongside the agent-dir extension.
- `defaultProjectTrust` can only be set in agent-dir settings (settings.md:36). Saved decisions live in `<agent-dir>/trust.json` (security.md:70).
- Context files (AGENTS.md, CLAUDE.md) in cwd and parents load regardless of trust, plus the one in the agent dir (configuration.md:43-47, security.md:57). Verified: cwd AGENTS.md reached the model.
- To avoid leaking the user's real context, use `-nc/--no-context-files` (cli.md:214), `-ne -e <path>` for extensions only from you (cli.md:196), and `-ns` for skills (cli.md:202).
- Skills: `<agent-dir>/skills/`, `.pi/skills/`, and the shared `~/.agents/skills/`, `.agents/skills/` (skills.md:61). Use `-ns` for a hermetic run.

## 2. Tools, commands, UI

Tool (extensions.md:133-141, hello.ts example):

- Schema is TypeBox. Import `Type` from `@earendil-works/pi-ai` as the shipped hello.ts does. The package depends on `typebox` 1.3.27 (package.json) as well.
- `defineTool({ name, label, description, parameters, execute })`, then `pi.registerTool(tool)`.
- Signature (types.d.ts:514): `execute(toolCallId, params, signal, onUpdate, ctx) => Promise<{ content: (text|image)[], details }>`.
- `content` is what the model sees. `details` is for rendering and branch state, use `undefined` if none (extensions.md:136-137).
- Throw to signal an error. Returning an object never marks an error. Use `isError: true` for data-carrying failures (extensions.md:139, 147).
- Optional `promptSnippet` and `promptGuidelines` add text to the default system prompt while the tool is active (types.d.ts:461-463).
- Optional `exposure` (`direct` default, `model-only`, `codemode`, `deferred`, `hidden`) at extensions.md:153-165.

Slash command (types.d.ts:1171-1177, 1231):

- `pi.registerCommand("name", { description, handler: async (args, ctx) => {} })`. `args` is the raw string after the command.
- Command ctx adds `waitForIdle`, `reload`, session switching (extensions.md:217-218).
- Commands run in interactive and RPC. I did not run a command in print mode (not verified).

UI (types.d.ts around 80-111, extensions.md:245-256):

- `ctx.ui.notify(msg, "info"|"warning"|"error")` for a startup message, called from `session_start`.
- `ctx.ui.setStatus(key, text|undefined)` for a footer status entry.
- `ctx.ui.setWidget(key, string[] | factory)` for a widget, `ctx.ui.setFooter(factory)` to replace the footer.
- Also dialogs (`confirm`, etc.), `setTitle`, `custom()`.
- JSON and print modes have no UI. Guard with `ctx.hasUI` or `ctx.mode === "tui"` (extensions.md:253-254). Verified: in json mode `ctx.mode="json"` and `ctx.hasUI=false`, and `notify` and `setStatus` did not throw. Their text appeared on neither stdout nor stderr.
- For anything a test must see, write to stderr (`console.error`) or a file. Stdout is reserved for JSONL in json and rpc modes (json.md:19).

## 3. Lifecycle events

Subscribe with `pi.on(event, async (event, ctx) => result)`. It returns an unsubscribe function. Handlers run in load order (extensions.md:98).
Full list is at types.d.ts:1187-1227. The relevant ones:

| Event               | Use                                                                          |
|---------------------|------------------------------------------------------------------------------|
| `session_start`     | `reason`: startup, reload, new, resume, fork. Start resources here, not in the factory (extensions.md:58-59) |
| `session_shutdown`  | Idempotent cleanup (extensions.md:60)                                       |
| `input`             | Raw user input, can transform                                                |
| `before_agent_start`| Gets `prompt`, `systemPrompt`, `systemPromptOptions`. Returns `{ systemPrompt?, message? }` (types.d.ts:1125-1129) |
| `context`           | Returns `{ messages }` to transform the conversation per request (extensions.md:116, types.d.ts:1082) |
| `context_with_system` | Same, but owns the whole transcript, keep a system message at index 0      |
| `turn_start`, `turn_end` | `turn_end` can return `{ entries, continue: true }` for one more request (extensions.md:118, types.d.ts:792) |
| `tool_call`         | Returns `{ block, reason }`, mutate `event.input` in place to change args (types.d.ts:1089-1098) |
| `tool_result`       | Returns `{ content, details, isError }`, handlers compose (types.d.ts:1114, extensions.md:106) |
| `tool_execution_start/update/end` | Notification only                                              |
| `agent_end`, `agent_before_settle`, `agent_settled` | Settled is final and notification only (extensions.md:67-68) |
| `message_end`       | Can replace a finalized message                                              |

Injecting context:

- Per turn system prompt: return `systemPrompt` from `before_agent_start`. It replaces the complete prompt for that turn, so append to `event.systemPrompt`. Verified: the model repeated the marker I appended.
- Per turn conversation message: return `message: { customType, content, display, details }` from `before_agent_start` (added to the run, extensions.md:104).
- Persistent messages: `pi.sendMessage()`, `pi.sendUserMessage()`. Non-context data: `pi.appendEntry()` (extensions.md:229-233).
- Static additions need no code: `APPEND_SYSTEM.md` or `--append-system-prompt <text|path>` (cli.md:231).

## 4. Imports, local modules, node:sqlite

- Extensions are loaded with jiti, no compile step (extensions.md:38).
- A file `extensions/x.ts` or a dir `extensions/x/index.ts` is auto-discovered (extensions.md:46).
- Local relative imports work: `./clock.ts` from `extensions/pi-time/index.ts`. Verified. Use the explicit `.ts` extension.
- `@earendil-works/pi-coding-agent` and `@earendil-works/pi-ai` resolve from inside an extension without installing them. Verified.
- npm deps: put a `package.json` and `node_modules` next to the extension. Reference is `examples/extensions/with-deps/` (`pi.extensions: ["./index.ts"]` plus dependencies, extensions.md:48). Not run by me.
- `node:sqlite` works (`DatabaseSync`, in-memory db, exec, prepare/get) on node v26.12.0. Verified. Older node versions need checking, since pi is launched by whatever node `pi` resolves to.

## 5. Non-interactive runs and asserting on tool calls

Working command (verified, exit 0, tool executed, rc=0):

```sh
cd <project-dir> && PI_CODING_AGENT_DIR=<agent-dir> PI_OFFLINE=1 \
  pi --mode json --provider zai --model glm-5.3 --no-session -a \
  "Call the echo_time tool with label 'hi'" < /dev/null > out.jsonl 2> err.txt
```

- Always redirect stdin: `< /dev/null`. My first attempt without it hung with no output for 3 minutes when launched from a non-TTY harness (docs say piped stdin is prepended to the prompt, cli.md:36). Cause inferred, not isolated.
- Modes: `-p/--print` prints final assistant text only (cli.md:45). `--mode json` emits JSONL events then exits (cli.md:47, json.md). `--mode rpc` is a long-lived stdin/stdout JSONL protocol (cli.md:48, rpc.md:1-20).
- `--provider` requires `--model` and restricts the lookup (cli.md:63-66). `--model` also accepts `provider/id` and a `:thinking` suffix.
- JSON mode first line is a session header, then `agent_start`, `turn_*`, `message_*`, `tool_execution_*`, `agent_end`, `agent_settled` (json.md:21-46).
- Tool call assertion records (json.md:105-107): `tool_execution_start {toolCallId, toolName, args}` and `tool_execution_end {toolName, result, isError, durationMs}`.
- Actual record from the run: `{"type":"tool_execution_end","toolName":"echo_time","result":{"content":[{"type":"text","text":"hi @ 2026-10-22T04:03:05.571Z (sqlite ok 42 b.ts)"}],"details":{"label":"hi"}},"isError":false,"durationMs":2}`.
- Assert with jq: `jq -c 'select(.type=="tool_execution_end" and .toolName=="echo_time" and .isError==false)' out.jsonl`.
- Final text: `jq -r 'select(.type=="agent_end")|.messages[-1].content[]?|select(.type=="text")|.text' out.jsonl`.
- Parse by splitting on LF only, not Node readline (json.md:17).
- Extension handler errors appear as `extension_error` in RPC mode (json.md:190). In json mode check stderr.
- Limit tools with `-t read,echo_time`, `-nbt`, `-nt` (cli.md:119-126). Extension tools are allowed in `--tools` lists.
- Use `--no-session` to avoid writing sessions, or `--session-dir` to isolate them (cli.md:96-99).
- Other useful flags: `--offline` or `PI_OFFLINE=1` (cli.md:241), `PI_SKIP_VERSION_CHECK` (environment-variables.md:85), `-e <path>` to load one extension (cli.md:194), `--thinking <level>` (cli.md:69).

## Hello-world extension (verified)

Layout: `<agent-dir>/extensions/pi-time/index.ts` and `clock.ts`.

`clock.ts`:

```ts
import { DatabaseSync } from "node:sqlite";
import { basename } from "node:path";
export function nowIso(): string { return new Date().toISOString(); }
export function sqliteProbe(): string {
  const db = new DatabaseSync(":memory:");
  db.exec("create table t(x)"); db.exec("insert into t values (42)");
  const row = db.prepare("select x from t").get() as { x: number };
  return `sqlite ok ${row.x} ${basename("/a/b.ts")}`;
}
```

`index.ts`:

```ts
import { Type } from "@earendil-works/pi-ai";
import { defineTool, type ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { nowIso, sqliteProbe } from "./clock.ts";

const echoTime = defineTool({
  name: "echo_time",
  label: "Echo time",
  description: "Returns the current ISO time and echoes the given label.",
  parameters: Type.Object({ label: Type.String({ description: "Label to echo" }) }),
  async execute(_id, params, _signal, _onUpdate, _ctx) {
    return {
      content: [{ type: "text", text: `${params.label} @ ${nowIso()} (${sqliteProbe()})` }],
      details: { label: params.label },
    };
  },
});

export default function (pi: ExtensionAPI) {
  pi.registerTool(echoTime);
  pi.registerCommand("time", {
    description: "Show current time",
    handler: async (_args, ctx) => ctx.ui.notify(`now: ${nowIso()}`, "info"),
  });
  pi.on("session_start", async (e, ctx) => {
    ctx.ui.notify(`pi-time loaded (${e.reason}) mode=${ctx.mode}`, "info");
    ctx.ui.setStatus("pi-time", "pi-time on");
    console.error(`[pi-time] session_start mode=${ctx.mode} hasUI=${ctx.hasUI}`);
  });
  pi.on("before_agent_start", async (e) => ({
    systemPrompt: e.systemPrompt + "\nPI_TIME_MARKER: always call echo_time when asked.",
  }));
  pi.on("tool_call", async (e) => { console.error(`[pi-time] tool_call ${e.toolName}`); });
}
```

Scratch setup used: agent dir with `auth.json` symlinked to `~/.pi/agent/auth.json`, and `settings.json` = `{"defaultProvider":"zai","defaultModel":"glm-5.3","defaultProjectTrust":"never"}`.
The scratch project had `AGENTS.md` and `.pi/extensions/proj.ts`.
Result: stderr showed `[proj-ext] loaded`, `[pi-time] session_start mode=json hasUI=false`, `[pi-time] tool_call echo_time`.

## Not verified

- The `/time` slash command and interactive rendering of notify and status (needs a TTY).
- `defaultProjectTrust: "never"` without `-a` skipping project extensions (doc only, security.md:77-80).
- RPC mode (read only).
- Whether a symlinked auth.json survives an OAuth refresh write (zai used an API key here).
