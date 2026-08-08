# Review package Task 3
Base: 8ff982b93d2e134adcc69a0a12667a188a9c5a7c
Head: 0e3c023a217614aa162f93b13578cb0ef2e90d01
## Commits
0e3c023 feat(uw): add UnderwritingRequest entity schema

## Stat
 .superpowers/sdd/task-3-report.md          |  69 ++++++++---------
 base44/entities/Underwriting Request.jsonc | 115 +++++++++++++++++++++++++++++
 2 files changed, 145 insertions(+), 39 deletions(-)

## Diff
```diff
diff --git a/.superpowers/sdd/task-3-report.md b/.superpowers/sdd/task-3-report.md
index b41b3b2..6fe7b6e 100644
--- a/.superpowers/sdd/task-3-report.md
+++ b/.superpowers/sdd/task-3-report.md
@@ -1,74 +1,65 @@
-# Task 3 Report: Rebuild MerchantCenterShell (POS chrome)
+# Task 3 Report: UnderwritingRequest entity schema
 
 **Status:** DONE  
-**Branch:** `feature/merchant-center-pos-shell`  
-**Commit:** `e7a7e04` ΓÇö feat: rebuild MerchantCenterShell with POS-style sidebar  
-**Date:** 2026-07-24
+**Branch:** `feature/underwriting-w9-request`  
+**Date:** 2026-08-07
 
 ---
 
 ## Summary
 
-Rewrote `MerchantCenterShell.jsx` from fixed top header + `max-w-3xl` layout to POS-style chrome: fixed left sidebar (desktop), top bar, wide main canvas, and mobile bottom nav strip. All prop names unchanged; `dealHref` logic preserved.
+Added Base44 entity schema `UnderwritingRequest` for MID-scoped underwriting document requests (W-9 v1). Matches structure and description style of `Underwriting Message.jsonc`. All brief properties declared; required fields: `corporateId`, `midId`, `type`, `status`.
 
 ---
 
-## Files Modified
+## File Created
 
-| File | Change |
+| File | Purpose |
 |---|---|
-| `src/components/merchant-center/MerchantCenterShell.jsx` | Full layout rewrite |
+| `base44/entities/Underwriting Request.jsonc` | Entity schema for persistence in Base44 |
 
 ---
 
-## Layout
+## Schema highlights
 
-| Region | Classes / behavior |
+| Field | Notes |
 |---|---|
-| Outer | `portal-bg min-h-screen flex` |
-| Sidebar (md+) | `w-56 fixed`, `CliqbuxLogo`, nav links, Sign out footer |
-| Main column | `flex-1 md:pl-56 min-h-screen flex flex-col` |
-| Top bar | `h-14`, subtitle caption + title chip, Sign out on mobile |
-| Main content | `max-w-[1400px] mx-auto`, `pb-20` on mobile for bottom nav |
-| Mobile nav | Fixed bottom strip ΓÇö Setup / Locations / Account + checklist badge |
+| `type` | enum `w9` (extensible) |
+| `status` | `draft` \| `sent` \| `opened` \| `signed` \| `sent_to_elavon` \| `cancelled` \| `expired` \| `send_failed` ΓÇö default `draft` |
+| `channels` | string enum `email` \| `sms` \| `both` (matches `nudgeMerchant`, not array) |
+| `prefillSnapshot` | string (JSON blob) per brief |
+| `tokenHash` | never raw token |
+| Timestamps | `sentAt`, `openedAt`, `signedAt`, `sentToElavonAt`, `tokenExpiresAt` ΓÇö ISO strings |
 
 ---
 
-## Nav order
+## Deviations from design spec
 
-1. **Setup** ΓÇö only when `showDealLink && corporateId` (same `dealHref` as before)
-2. **Locations** ΓÇö `/locations?dealId=ΓÇª`
-3. **Account** ΓÇö `/account?dealId=ΓÇª`
-
-Active link: `bg-cb-accent-muted text-cb-accent`. Checklist badge: danger pill on Setup (sidebar + mobile).
+Design doc (`docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md`) lists `channels` as `['email']` \| `['sms']` \| `['email','sms']`. Task brief and user instruction require a **string** enum matching `nudgeMerchant`; implemented as `email` \| `sms` \| `both`.
 
 ---
 
-## Props (unchanged)
-
-`title`, `subtitle`, `corporateId`, `openChecklistCount`, `children`, `showDealLink`
-
----
+## Rollout (Teddy)
 
-## Tests
+**Publish entity** in Base44 Dashboard before live create/update works ΓÇö undeclared keys are stripped on save (AGENTS.md Lesson #4).
 
-**Manual check deferred** ΓÇö brief Step 2: verify `/locations` and `/account` after Task 5. No automated tests added.
+1. Push branch ΓåÆ GitHub Desktop as usual  
+2. Base44 Dashboard ΓåÆ Entities ΓåÆ publish `UnderwritingRequest`  
+3. Proceed to Task 4+ (`manageUnderwritingRequest`, `completeUnderwritingRequest`)
 
 ---
 
-## Lint
-
-No linter errors on `MerchantCenterShell.jsx`.
-
----
+## Commit
 
-## Concerns
+```
+feat(uw): add UnderwritingRequest entity schema
 
-- Top bar has no page-title prop yet (brief non-goal for v1); left side empty on desktop ΓÇö acceptable per spec.
-- Mobile bottom nav may overlap very tall sticky footers; `pb-20` on main should cover most cases.
+Teddy must Publish entity in Base44 Dashboard before live create works.
+```
 
 ---
 
-## Next Steps
+## Concerns / follow-ups
 
-- Task 4/5: wire dashboard content into wide canvas; browser smoke at `/locations` and `/account`.
+- None blocking. Functions in later tasks should treat `prefillSnapshot` as JSON.parse/stringify at boundaries.
+- Uniqueness rule (one non-terminal request per `midId` + `type`) is enforced in application code, not entity schema.
diff --git a/base44/entities/Underwriting Request.jsonc b/base44/entities/Underwriting Request.jsonc
new file mode 100644
index 0000000..861d7e8
--- /dev/null
+++ b/base44/entities/Underwriting Request.jsonc	
@@ -0,0 +1,115 @@
+{
+  "name": "UnderwritingRequest",
+  "type": "object",
+  "description": "MID-scoped underwriting document requests (W-9 first). Agent creates in Deal Room; merchant completes via magic link at /uw/:token.",
+  "properties": {
+    "corporateId": {
+      "type": "string",
+      "description": "FK ΓåÆ MerchantCorporateProfile.corporateId (HubSpot deal id)"
+    },
+    "merchantAccountId": {
+      "type": "string",
+      "description": "FK ΓåÆ MerchantAccount.id ΓÇö optional; set when profile is linked to an account"
+    },
+    "midId": {
+      "type": "string",
+      "description": "FK ΓåÆ MerchantMID.id ΓÇö request is scoped to one MID"
+    },
+    "legalEntityId": {
+      "type": "string",
+      "description": "entityId from profile/account legalEntities[] used for W-9 prefill"
+    },
+    "type": {
+      "type": "string",
+      "enum": ["w9"],
+      "description": "Request kind ΓÇö extensible; v1 ships w9 only"
+    },
+    "status": {
+      "type": "string",
+      "enum": [
+        "draft",
+        "sent",
+        "opened",
+        "signed",
+        "sent_to_elavon",
+        "cancelled",
+        "expired",
+        "send_failed"
+      ],
+      "default": "draft",
+      "description": "Lifecycle: draft ΓåÆ sent ΓåÆ opened ΓåÆ signed ΓåÆ sent_to_elavon; send_failed / cancelled / expired are terminal or retry paths"
+    },
+    "recipientName": {
+      "type": "string",
+      "description": "Display name for the merchant contact receiving the request"
+    },
+    "recipientEmail": {
+      "type": "string",
+      "description": "Email for Resend delivery ΓÇö required when channels includes email"
+    },
+    "recipientPhone": {
+      "type": "string",
+      "description": "E.164 phone for Quo SMS ΓÇö required when channels includes sms"
+    },
+    "channels": {
+      "type": "string",
+      "enum": ["email", "sms", "both"],
+      "default": "both",
+      "description": "Delivery channels ΓÇö same vocabulary as nudgeMerchant"
+    },
+    "agentNote": {
+      "type": "string",
+      "description": "Optional note shown in email/SMS and on the merchant /uw page"
+    },
+    "prefillSnapshot": {
+      "type": "string",
+      "description": "JSON string of W-9 field values at send; updated to final values on sign"
+    },
+    "tokenHash": {
+      "type": "string",
+      "description": "HMAC/SHA hash of opaque magic-link token ΓÇö never store raw token"
+    },
+    "tokenExpiresAt": {
+      "type": "string",
+      "description": "ISO 8601 expiry ΓÇö default 7 days from send"
+    },
+    "signedPdfUrl": {
+      "type": "string",
+      "description": "Base44 private file URL or id for the stamped signed W-9 PDF"
+    },
+    "sentAt": {
+      "type": "string",
+      "description": "ISO timestamp when email/SMS was dispatched"
+    },
+    "openedAt": {
+      "type": "string",
+      "description": "ISO timestamp when merchant first opened /uw/:token"
+    },
+    "signedAt": {
+      "type": "string",
+      "description": "ISO timestamp when merchant submitted signature"
+    },
+    "sentToElavonAt": {
+      "type": "string",
+      "description": "ISO timestamp when signed PDF was emailed to Elavon via Gmail"
+    },
+    "elavonGmailMessageId": {
+      "type": "string",
+      "description": "Gmail message id after successful sendToElavon (dedup / audit)"
+    },
+    "createdByEmail": {
+      "type": "string",
+      "description": "CliqBux agent workspace email that created the request"
+    },
+    "lastError": {
+      "type": "string",
+      "description": "Last channel or Gmail failure message ΓÇö ops-visible for send_failed / retry"
+    }
+  },
+  "required": [
+    "corporateId",
+    "midId",
+    "type",
+    "status"
+  ]
+}

```
