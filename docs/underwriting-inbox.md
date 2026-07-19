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

Scopes needed: `https://www.googleapis.com/auth/gmail.readonly`

Default search (when query unset) includes mail to underwriting@ **and** from Elavon status/escalation addresses:

`to:underwriting@cliqbux.com OR from:(ApplicationStatus@elavon.com OR MSPFulSer@elavon.com OR FulSerCenter@elavon.com) newer_than:90d`

Then redeploy `syncUnderwritingMail`. From Deal Room, **Sync inbox** matches by AWB on the current deal’s MIDs.

## Matching rules

1. Parse AWB-like tokens from subject/body — **subject-line AWB is the primary Elavon signal**
2. Also substring-match any known `MerchantMID.elavonAwb` (≥6 chars)
3. Dedup by Gmail message id → `UnderwritingMessage.externalId`
4. Unmatched messages are reported in the sync response (not stored) — set AWB on the MID and re-sync

## Entities / functions

- `MerchantMID.elavonAwb`
- `UnderwritingMessage`
- `manageApplicationDesk` — `setMidAwb`, `logUwMessage`, `deleteUwMessage`, `requestStatusInquiry`, `refreshAwbFromMsp`
- `submitToMSP` / `pollMSPStatus` — capture `elavonAwb` from MSP after submit
- `syncUnderwritingMail` — Gmail pull
