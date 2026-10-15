# commanddeck

Mods for [Claude Code](https://claude.com/claude-code), installable on any machine (Windows, macOS, Linux) with no paths to configure.

| Mod | What it does |
|---|---|
| **command-deck** | One band above the prompt: session, git, context and plan-limit meters, cost, and your mods, model and effort controls. |
| **github-issues** | A `/issues` pane listing the repo's open GitHub issues; click one to open it, or send it to the prompt. |
| **prompt-upgrade** | Turns a rough prompt into a better one before it is sent: a few quick questions, a rewrite, and a side-by-side review. |
| **auto-model** | Picks the right model for each prompt you type, quietly, when switched on. |

## Install

In Claude Code:

```
/plugin marketplace add clafronteaccnts/commanddeck
/plugin install command-deck@commanddeck
```

Install any of the others the same way (`github-issues@commanddeck`, `prompt-upgrade@commanddeck`, `auto-model@commanddeck`), then restart Claude Code.

## Update

```
/plugin marketplace update commanddeck
```

## Requirements

- **command-deck**: `git` on your PATH for the git meter (it shows nothing in folders that aren't repos), and `curl` for the dev-server status (shown when the project's `dev` script names a port).
- **github-issues**: the [GitHub CLI](https://cli.github.com/) (`gh`), signed in with `gh auth login`.
- **prompt-upgrade**, **auto-model**: nothing extra.
