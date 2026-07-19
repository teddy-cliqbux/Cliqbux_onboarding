# Underwriting inbox sync (Deal Room phase 2)

Pulls mail from **underwriting@cliqbux.com** into per-MID threads, matched by **Elavon AWB**.

## What agents do today (no Gmail yet)

1. Open Deal room → **Underwriting by MID**
2. Select a MID → paste **Elavon AWB** → Save AWB
3. **Log email** (paste subject/body) onto that MID’s thread  
   — or click **Sync inbox** once Gmail env is configured

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

Then redeploy `syncUnderwritingMail`. From Deal Room, **Sync inbox** calls it scoped to the current deal’s MIDs that have an AWB set.

## Matching rules

1. Parse AWB-like tokens from subject/body (`AWB: …`, `Application #…`, etc.)
2. Also substring-match any known `MerchantMID.elavonAwb` (≥6 chars)
3. Dedup by Gmail message id → `UnderwritingMessage.externalId`
4. Unmatched messages are reported in the sync response (not stored) — set AWB on the MID and re-sync

## Entities / functions

- `MerchantMID.elavonAwb`
- `UnderwritingMessage`
- `manageApplicationDesk` — `setMidAwb`, `logUwMessage`, `deleteUwMessage`
- `syncUnderwritingMail` — Gmail pull
