### Task 4: `manageUnderwritingRequest` (admin)

**Files:**
- Create: `base44/functions/manageUnderwritingRequest/entry.ts`

**Interfaces:**
- Auth: workspace `base44.auth.me()` only â€” reject merchant JWT (admin desk).
- Actions:
  - `list` `{ corporateId, midId? }` â†’ requests (mask TIN in list: show last 4 only via derived `tinMasked` from snapshot)
  - `create` `{ corporateId, midId, legalEntityId, recipientName, recipientEmail?, recipientPhone?, channels, agentNote? }` â†’ builds prefill (inline copy of `w9Prefill` logic), status `draft`, returns request + full prefill for UI preview
  - `send` `{ requestId }` â†’ validate channels, cancel other non-terminal same mid+type, generate 32-byte hex token, store `sha256(token + MERCHANT_JWT_SECRET)`, `tokenExpiresAt` = now+7d, send Resend and/or Quo with `${PUBLIC_APP_URL}/uw/${token}`, status `sent`, `sentAt`
  - `resend` `{ requestId }` â†’ cancel if needed + same as send on new or same row (prefer update same row with new token if still unsigned)
  - `cancel` `{ requestId }` â†’ `cancelled`
  - `getSignedUrl` `{ requestId }` â†’ `{ signedPdfUrl }` if status signed|sent_to_elavon
  - `sendToElavon` `{ requestId, to, subject, bodyText }` â†’ require signed PDF; Gmail send multipart; log `UnderwritingMessage` outbound; set `sent_to_elavon`

**Email/SMS:** Copy Resend + Quo patterns from `nudgeMerchant/entry.ts` (normalizePhone, Quo-Api-Version `2026-03-30`, Resend from `onboarding@onboarding.cliqbuxpos.com`). SMS body must not include TIN.

**Gmail send:** Reuse token refresh from `syncUnderwritingMail`; POST `https://gmail.googleapis.com/gmail/v1/users/me/messages/send` with raw RFC 2822 base64url MIME (PDF attachment). On missing scope, return 503 with hint to reconnect OAuth with `gmail.send`.

- [ ] **Step 1: Scaffold function** with action switch + admin gate + `list`/`create`/`cancel` (no email yet).

- [ ] **Step 2: Add `send`/`resend`** with Resend + Quo.

- [ ] **Step 3: Add `sendToElavon` + `getSignedUrl`.**

- [ ] **Step 4: Manual smoke** against published app after entity publish (or document blocked until publish).

- [ ] **Step 5: Commit**

```bash
git add base44/functions/manageUnderwritingRequest/entry.ts
git commit -m "feat(uw): admin manageUnderwritingRequest send and Elavon forward"
```

