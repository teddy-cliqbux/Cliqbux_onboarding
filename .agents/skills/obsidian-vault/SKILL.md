---
name: obsidian-vault
description: Search, create, and manage notes in the CliqBux Second Brain Obsidian vault. Use when the user wants vault decisions, specs, partner maps, or account notes — or when MSPWare / merchant-center / boarding work needs judgment beyond this repo.
---

# CliqBux Second Brain vault

## Vault location

Sibling workspace folder (preferred): **`Cliqbux Second Brain`**

Absolute path on Teddy’s machine:

`C:\Users\teddy\Documents\Cliqbux Second Brain`

Not nested inside `Cliqbux_onboarding`. Follow vault `CLAUDE.md` and `_index.md`
conventions (append-only decisions, no live-data copies, MID as join key).

## Before boarding / MSPWare / merchant-center work

1. `_index.md`
2. `partners/mspware.md` + OpenAPI pin under `partners/mspware/`
3. Relevant `decisions/` and `specs/` (e.g. `specs/merchant-center.md`)

Don’t invent API behavior — cite the pin or mark `TODO`. Durable judgment goes
back to the vault, not only chat.

## Workflows

### Search notes

Use Glob / Grep / Read against the vault workspace folder (or absolute path).

### New decision

Copy `decisions/0000-template.md`, take the next number, link from `_index.md`
and related specs. Never edit an accepted decision to change what was decided —
write a new record with `supersedes` / `superseded_by`.

### Optional MCP

With Obsidian open, Vault-as-MCP may be available (see vault
`decisions/0015-vault-mcp-clients-cursor-and-claude.md`). Still use the read
order above; fall back to filesystem reads if MCP is down.
