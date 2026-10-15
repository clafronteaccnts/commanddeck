# commanddeck

Mods for [Claude Code](https://claude.com/claude-code), installable on any machine (Windows, macOS, Linux) with no paths to configure.

**command-deck** is the main mod: one band above the prompt that shows your session at a glance and gives you buttons for the other mods. The other four are separate mods you add only if you want them. Each one adds its own slash command, and the deck shows a button for it only when it is installed.

| Mod | What it does | Command |
|---|---|---|
| **command-deck** | The band above the prompt. | `/deck` |
| **github-issues** | A pane listing the repo's open GitHub issues. | `/issues` |
| **prompt-upgrade** | Turns a rough prompt into a better one before it is sent. | `/better` |
| **auto-model** | Picks the right model for each prompt you type. | `/automodel` |
| **dev-server** | Starts, stops and restarts the project's dev server. | `/dev` |

## Install

In Claude Code, add the marketplace once:

```
/plugin marketplace add clafronteaccnts/commanddeck
```

Then install the deck:

```
/plugin install command-deck@commanddeck
```

Restart Claude Code. The deck works on its own, with its meters and the model and effort selectors.

### Add the other mods

Install any of these the same way, then restart Claude Code. Each one is optional.

```
/plugin install github-issues@commanddeck
/plugin install prompt-upgrade@commanddeck
/plugin install auto-model@commanddeck
/plugin install dev-server@commanddeck
```

## What each mod does

### command-deck

One band above the prompt, with:

- **Where you are:** the folder, its `package.json` version, the git branch, how many files changed, and commits ahead or behind.
- **Session:** how long it has run, the number of prompts and the cost so far.
- **Meters:** how full the context window is, and your 5-hour and weekly plan limits with their reset countdowns. A short notice appears once when a limit passes 80% and again at 95%.
- **Dev server:** `dev :9002 up` or `down`, shown when the project's `dev` script names a port (for example `next dev -p 9002`).
- **Mod buttons:** Issues, Start dev or Stop dev, Prompt Upgrade and Auto Model. A button appears only when its mod is installed (and, for Issues, the repo is on GitHub).
- **Model and effort:** selectors that apply to the main conversation's requests.

Run `/deck` to collapse the band to a single line, and again to expand it.

### github-issues

`/issues` opens a pane with the repo's open GitHub issues. Click one to open it in the browser, or press **Ask** to put "Work on issue #N" in the prompt. Needs the GitHub CLI (see Requirements).

### prompt-upgrade

`/better <prompt>` turns a rough prompt into a better one: it asks a few quick questions, rewrites the prompt and shows a side-by-side review before anything is sent.

- `/better on` and `/better off` turn the automatic mode on and off.
- `/better history` shows earlier upgrades.

The deck's **Prompt Upgrade** button arms it for your next prompt.

### auto-model

`/automodel on` picks the right model for each prompt you type, quietly. `/automodel off` returns to the model you started on, and `/automodel status` shows the current state. The deck's **Auto Model** button toggles it, and the model selector gains an Auto choice.

### dev-server

`/dev start`, `/dev stop`, `/dev restart` and `/dev status` run the project's `package.json` `dev` script (`npm run dev`) and show its output in a pane. Plain `/dev` toggles it and opens the pane. Stopping also ends whatever is still listening on the dev port. It only stops a server it started itself; one started in a terminal has to be stopped there. The deck's **Start dev** and **Stop dev** button does the same.

## Update

```
/plugin marketplace update commanddeck
```

Restart Claude Code afterwards. Updates only arrive when a mod's version number changes.

## Remove

```
/plugin uninstall command-deck@commanddeck
```

Use the same form for the other mods, for example `github-issues@commanddeck`.

## Requirements

- **command-deck**: `git` on your PATH for the git meter (it shows nothing in folders that aren't repos), and `curl` for the dev-server status (shown when the project's `dev` script names a port).
- **github-issues**: the [GitHub CLI](https://cli.github.com/) (`gh`), signed in with `gh auth login`.
- **dev-server**: `npm` on your PATH, and a `dev` script in the project's `package.json`. To stop the server it uses `netstat` and `taskkill` on Windows, or `lsof` and `kill` on macOS and Linux.
- **prompt-upgrade**, **auto-model**: nothing extra.
