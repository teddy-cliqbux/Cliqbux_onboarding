# Signer roles: Control Person, Beneficial Owner, Portal Admin

Boarding people on a Deal are not all “signers.” We distinguish three roles (a person may be Control Person and Beneficial Owner at once):

1. **Legal Signer / Control Person / Authorized Signer** — executes the merchant agreement. Exactly **one** per Deal. Included in BoldSign. On MSPWare owners payload: `principal_sign_agreement` / authorized-signer intent true. May have 0% ownership.
2. **Beneficial Owner** — ≥25% equity (or explicit flag). KYC (name, DOB, SSN, residential address) required for AML in the owners/principals payload with beneficial-owner intent. **No** BoldSign link unless also Control Person.
3. **Portal Admin** — 0% ownership, admin access only. Excluded from contract principals and signature workflow. Flagged for post-boarding payment-gateway user provisioning (Payments Insider / Converge).

Legacy bridge: existing `isPrimarySigner` is treated as Control Person when `isAuthorizedSigner` is not set. Ownership ≥25% implies Beneficial Owner. This replaces the old rule “must sign if ≥25% or primary.”

## Status

accepted
