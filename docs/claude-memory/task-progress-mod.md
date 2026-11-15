---
name: task-progress-mod
description: The owner's task-progress mod (card above the prompt with steps, live actions, code snippets) loads in every session from ~/.claude/mods/task-progress via CLAUDE_CODE_PLUGIN_DIRS
metadata:
  type: project
---

26 Oct 2026: the owner asked for the task-progress mod to be open by default in all sessions, with a taller, better card that shows what each step is doing (code snippets for edits). The one copy is `~/.claude/mods/task-progress`, loaded by `env.CLAUDE_CODE_PLUGIN_DIRS` in `~/.claude/settings.json` (backup `settings.json.bak-task-progress`). Older per-session copies were moved to `~/.claude/dev-mods-disabled/task-progress-old/`; session 4ddf4421's mods folder links to the shared copy.

**Why:** separate per-session copies drifted and would draw two cards next to the global one.
**How to apply:** edit `~/.claude/mods/task-progress`, never a session copy; don't write a new task-progress into a session's mods folder. This is separate from the disabled MedSync mod ([[medsync-mod-build]]).

26 Oct 2026, later: the boxed per-step look was rejected; the owner picked **Version A** from the prototype canvas https://claude.ai/artifact/UHEdQrv3ndK1THWqzfuBtz (boards Main, Running, Done, Navy) and it is now the mod's render. It has a completion ring (an Svg on desktop, a bold percent in the terminal) with the stations beside it; a Now section with tokens per action; a typing code card, or a `$ cmd` box for Bash; background agents (ring, actions, time, tokens); and a Done card (time taken, agents used, hardest step, and "For you to run" shell blocks with Copy buttons). Same day the owner asked for Claude's design system instead of Tide: the accent is the theme key `'claude'`, the ring Svg uses Claude's brand hexes (clay #d97757, ink #141413/#faf9f5, track #e8e6dc/#3d3d3a), labels are sentence case, the current station is ✻, and the outer border is `promptBorder`. Versions B–D on the canvas were not picked.
