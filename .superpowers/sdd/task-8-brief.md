### Task 8: Docs + Gmail scope + agent briefing

**Files:**
- Modify: `docs/underwriting-inbox.md` â€” scopes include `gmail.send`; env `UNDERWRITING_ELAVON_DOCS_TO`; W-9 send flow pointer to spec
- Modify: `AGENTS.md` â€” short subsection under Merchant Center / Deal Room
- Append: `AI_CHANNEL.md` â€” entry that W-9 UW request shipped in plan
- Optional vault: amend `Cliqbux Second Brain/specs/merchant-center.md` Constraints/Behavior with link to repo spec (no live data)

- [ ] **Step 1: Update docs.**

- [ ] **Step 2: Checklist for Teddy:** republish entity; re-consent Gmail; set env vars; redeploy both functions; smoke one test MID.

- [ ] **Step 3: Commit**

```bash
git add docs/underwriting-inbox.md AGENTS.md AI_CHANNEL.md
git commit -m "docs(uw): W-9 underwriting request and Gmail send scopes"
```

---

