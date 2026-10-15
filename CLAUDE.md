# CLAUDE.md

This repo is a Claude Code plugin marketplace (`commanddeck`) holding five mods: `command-deck`, `github-issues`, `prompt-upgrade`, `auto-model` and `dev-server`. It is public on GitHub (`clafronteaccnts/commanddeck`). Other people install from it, so treat every change as published once pushed.

## Layout

- `.claude-plugin/marketplace.json` lists the mods and their versions.
- Each mod has `.claude-plugin/plugin.json` (name, version, description), `hooks/` (`hooks.json` plus `register.ts(x)` and tests) and `types/index.d.ts`.
- `README.md` holds the install steps and the per-mod requirements. Keep it in step with what the mods need.

## Rules

- **Versions:** when a mod changes, bump its `version` in `plugin.json` AND its entry in `marketplace.json`. Installed copies only pick up updates when the version changes.
- **Keep the two in sync:** the name, description and version in `marketplace.json` must match each `plugin.json`.
- **No personal data:** no user paths (`C:\Users\...`), usernames, emails, tokens or machine names in any file. Test fixtures use neutral paths such as `C:\work\my-app`.
- **Project-specific mods stay out:** `project-status` is tied to RewardsOptimizer (port 9002, Windows only) and is deliberately not in this repo.
- **Requirements:** if a mod starts needing an external tool (`git`, `gh`, a CLI), add it to the README requirements.

## Local use

This machine loads the mods straight from this folder through `CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json`, so edits take effect after a Claude Code restart. Don't also install these from the marketplace on this machine, or each mod loads twice.

## Git

Commit and push when asked. Pushes go to `origin main`.
