# Underwriting inbox sync (Deal Room phase 2)

Pulls mail from **underwriting@cliqbux.com** into per-MID threads, matched by **Elavon AWB**.

## Agent flow after signing

1. Merchant finishes signing in the portal.
2. **Agent submits** the application to Elavon via MSPWare (`submitToMSP` with `MSP_SUBMIT_ENABLED=true`).
3. Elavon **pre-screens** — may **auto-approve in ~15 minutes** or route to **underwriting**.
4. **AWB** should be retrievable from MSPWare (`GET /applications/{no}/status` + application). Stored on `MerchantMID.elavonAwb` by:
   - `submitToMSP` (best-effort right after submit)
   - `pollMSPStatus` (while `Pending MID`)
   - Deal Room **From MSP** (`refreshAwbFromMsp`)
5. Use AWB for **ApplicationStatus@elavon.com** status inquiries (subject = AWB).

Manual paste remains a fallback until the live MSP field name is confirmed and pinned.

## Elavon status inquiry process (effective for apps submitted after 2026-07-07)

From Elavon Credit & Underwriting:

| Need | Action |
|---|---|
| **Standard status** | Email **ApplicationStatus@elavon.com** with the **AWB in the subject line**. Automated reply within minutes. |
| **Escalation / no AWB** | **MSPFulSer@elavon.com** or **FulSerCenter@elavon.com** |
| **Multiple applications** | **One AWB per email chain** — never batch AWBs in one thread |

**Automated replies will not include** DBA, legal name, MID, or data-entry technical pends. Data Entry still emails directly when action is needed.

Deal Room **Request status** builds that email (subject = AWB), opens compose, and logs an outbound entry on the MID thread.

## What agents do

1. Open Deal room → **Underwriting by MID**
2. Select a MID → **From MSP** (or wait for poll / auto-fill after submit) → confirm AWB
3. **Request status** (ApplicationStatus@) — one MID / one AWB at a time
4. **Sync inbox** to pull the automated reply onto the thread  
   — or **Log email** if pasting manually

## Gmail setup (Google Workspace)

Create an OAuth client that can read the shared mailbox (or a refresh token for that user).

Set in Base44 env:

| Var | Purpose |
|---|---|
| `UNDERWRITING_GMAIL_CLIENT_ID` | OAuth client id |
| `UNDERWRITING_GMAIL_CLIENT_SECRET` | OAuth client secret |
| `UNDERWRITING_GMAIL_REFRESH_TOKEN` | Refresh token for underwriting@ |
| `UNDERWRITING_GMAIL_USER` | Optional; default `underwriting@cliqbux.com` |
| `UNDERWRITING_GMAIL_QUERY` | Optional Gmail search override |
| `UNDERWRITING_GMAIL_ACCESS_TOKEN` | Optional short-lived token (skips refresh; testing only) |
| `UNDERWRITING_ELAVON_DOCS_TO` | Optional override default **To** for Deal Room **Send to Elavon**. Built-in presets (no env required): `FulSerCenter@elavon.com`, `MSPFulSer@elavon.com`. Agents may also type an assigned Elavon rep. **Never** use `ApplicationStatus@elavon.com` for document packages — that inbox is status-inquiry only. |

**OAuth scopes (re-consent required when adding send):**

- `https://www.googleapis.com/auth/gmail.readonly` — inbound sync (`syncUnderwritingMail`)
- `https://www.googleapis.com/auth/gmail.send` — outbound W-9 forward to Elavon (`manageUnderwritingRequest` action `sendToElavon`)

After upgrading scopes, generate a **new refresh token** for underwriting@ and update `UNDERWRITING_GMAIL_REFRESH_TOKEN` in Base44. A token minted with readonly-only consent will fail `sendToElavon` with an insufficient-scope error; the Deal Room panel surfaces that banner.

Default search (when query unset) includes mail to underwriting@ **and** from Elavon status/escalation addresses:

`to:underwriting@cliqbux.com OR from:(ApplicationStatus@elavon.com OR MSPFulSer@elavon.com OR FulSerCenter@elavon.com) newer_than:90d`

Then redeploy `syncUnderwritingMail`. From Deal Room, **Sync inbox** matches by AWB on the current deal’s MIDs.

## W-9 underwriting requests (outbound send)

Deal Room **Underwriting requests** (per selected MID) lets agents request a signed IRS Form W-9 from a merchant contact (email and/or SMS), collect an in-house e-sign at `/uw/:token`, then **Send to Elavon** from underwriting@ with the signed PDF attached.

| Step | Who | What |
|---|---|---|
| 1 | Agent | Deal Room → select MID → **Underwriting requests** → New W-9 → pick legal entity + recipient → Send |
| 2 | Merchant | Opens magic link → reviews/edits prefilled fields → signs → download confirmation |
| 3 | Agent | **Download** signed PDF; **Send to Elavon** — To presets: FulSer Center / MSP FulSer, or type assigned Elavon rep; Subject prefilled with AWB when set. Not ApplicationStatus@ (use **Request status** for that). |
| 4 | System | Gmail send logs an outbound row on the MID `UnderwritingMessage` thread |

**Functions:** `manageUnderwritingRequest` (admin: list / create / send / resend / cancel / getSignedUrl / sendToElavon), `completeUnderwritingRequest` (token: get / saveDraft / submitSignature).

**Entity:** `UnderwritingRequest` — **republish in Base44** before live use (undeclared fields strip on save).

**Design spec (canonical):** `docs/superpowers/specs/2026-08-07-underwriting-w9-request-design.md`  
**Implementation plan:** `docs/superpowers/plans/2026-08-07-underwriting-w9-request.md`

Inbound AWB status sync and W-9 outbound send share the same underwriting@ OAuth client but use different Gmail API methods (list/get vs send).

## Matching rules

1. Parse AWB-like tokens from subject/body — **subject-line AWB is the primary Elavon signal**
2. Also substring-match any known `MerchantMID.elavonAwb` (≥6 chars)
3. Dedup by Gmail message id → `UnderwritingMessage.externalId`
4. Unmatched messages are reported in the sync response (not stored) — set AWB on the MID and re-sync

## Entities / functions

- `MerchantMID.elavonAwb`
- `UnderwritingMessage`
- `UnderwritingRequest` — MID-scoped W-9 (and future doc types)
- `manageApplicationDesk` — `setMidAwb`, `logUwMessage`, `deleteUwMessage`, `requestStatusInquiry`, `refreshAwbFromMsp`
- `manageUnderwritingRequest` — W-9 create/send/resend/cancel; Gmail `sendToElavon` with PDF attachment
- `completeUnderwritingRequest` — merchant token page `/uw/:token`
- `submitToMSP` / `pollMSPStatus` — capture `elavonAwb` from MSP after submit
- `syncUnderwritingMail` — Gmail pull (readonly scope)
