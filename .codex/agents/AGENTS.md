# AGENTS.md

This folder stores project-scoped custom Codex subagents.

## Rules

- One agent file such as `repo-recon.toml` or `security-reviewer.toml` equals one narrow role.
- Keep agents opinionated and task-bounded. Do not turn them into another general assistant.
- Default to `read-only` when an agent should inspect, review, or gather evidence without editing.
- Keep only agent-specific behavior here. Do not duplicate the whole project contract.
- Parent sessions should pick these agents when the task clearly matches the role and the delegation overhead is worth it.
- Prefer small parallel bundles when the task decomposes cleanly.
- Good defaults: `repo_recon + security_reviewer + docs_researcher`, `browser_debugger + repo_recon`, `exa_researcher + docs_researcher`, `notebooklm_summarizer + exa_researcher`.

## Editing

- First fix the job of the agent, then the model, then sandbox/tooling.
- Do not make one agent cover every adjacent workflow.
- Prefer inheriting shared defaults from `.codex/config.toml`.
- Put MCP wiring in the agent file when the integration is specific to that one role.
