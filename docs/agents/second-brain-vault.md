# CliqBux Second Brain vault

How agents working in **this repo** should use the sibling Obsidian vault for
judgment. The vault’s own `CLAUDE.md` only applies when the agent is rooted in
the vault — product chats need these instructions here.

## Workspace setup (sibling, not nested)

Multi-root Cursor workspace:

1. This repo (`Cliqbux_onboarding`)
2. Existing folder `C:\Users\teddy\Documents\Cliqbux Second Brain`

Save as e.g. `Cliqbux-onboarding-with-vault.code-workspace`. **Do not** copy the
vault into this repo.

## Read order (boarding / MSPWare / merchant center)

When the vault folder is in the workspace:

1. `_index.md`
2. `partners/mspware.md` + OpenAPI pin under `partners/mspware/`
3. Relevant `decisions/` and specs (`specs/merchant-center.md`, etc.)

If the vault is not in the workspace: say so; use `AGENTS.md` +
`docs/mspware-field-reference.md`; mark invented gaps `TODO`. Do not invent
MSPWare API behavior from memory.

## Write-back

Durable judgment (why we chose X, partner quirks, product constraints) goes in
the vault — numbered `decisions/`, partner notes, or specs — not only chat.
Repo `docs/adr/` is historical; new decisions are canonical in the vault.

## Optional: Vault MCP

With Obsidian open, Vault-as-MCP may expose tools (vault `decisions/0015`). Still
follow the read order above. MCP does not replace having the folder in the
workspace.

## Related

- Always-on Cursor rule: `.cursor/rules/cliqbux-second-brain-vault.mdc`
- Briefing: `AGENTS.md` § CliqBux Second Brain vault
