### Task 3: Entity schema `UnderwritingRequest`

**Files:**
- Create: `base44/entities/Underwriting Request.jsonc`

**Schema properties (all declared):**  
`corporateId`, `merchantAccountId`, `midId`, `legalEntityId`, `type` (enum `w9`), `status` (enum per spec), `recipientName`, `recipientEmail`, `recipientPhone`, `channels` (prefer string `email|sms|both` matching `nudgeMerchant`), `agentNote`, `prefillSnapshot` (string JSON), `tokenHash`, `tokenExpiresAt`, `signedPdfUrl`, `sentAt`, `openedAt`, `signedAt`, `sentToElavonAt`, `elavonGmailMessageId`, `createdByEmail`, `lastError`

- [ ] **Step 1: Write JSONC** matching Base44 entity style in `Underwriting Message.jsonc` (name `UnderwritingRequest`, required: `corporateId`, `midId`, `type`, `status`).

- [ ] **Step 2: Note in commit body:** Teddy must **Publish entity** in Base44 Dashboard before live create works.

- [ ] **Step 3: Commit**

```bash
git add "base44/entities/Underwriting Request.jsonc"
git commit --trailer "Co-authored-by: Cursor <cursoragent@cursor.com>" -m "feat(uw): add UnderwritingRequest entity schema"
```
