# Merchant Onboarding

Cliqbux's merchant onboarding and management center: one boarding engagement at a time, tying together sales, legal, locations, and payment processing into a single experience for merchants and Cliqbux staff.

HubSpot company north-star (see ADR-0001): Parent Company → Legal Entity → Location. Cash Discount fee→tiered math (see ADR-0002).

The boarding experience is optimized for the **sales agent** and the **Signer** — org structure choices should reduce redundant entry and confusion for those two roles.

## Language

### Org structure

**Parent Company**:
The durable operator identity in HubSpot — ownership (and brand as a label/naming on this record, not a separate company tier). Child records hang under it. During sales, Location companies may sit directly under Parent until Legal Entity is known.
_Avoid_: Corporate Profile (that's deal-scoped), Customer, Brand (as a required HubSpot company tier)

**Legal Entity**:
A taxable business unit with its own EIN (or equivalent), ownership type, and legal details — learned in onboarding. In boarding it lives on the Corporate Profile. North-star HubSpot shape inserts it as a company tier: Parent Company → Legal Entity → Location (sales may skip this tier until EIN is known, then create/link and reparent).
_Avoid_: Corporation (unless that is the ownership type), Company (ambiguous), Parent Company, HubSpot Location Company

**HubSpot Location Company**:
A HubSpot company representing one physical Location / merchant site. North-star: child of a Legal Entity company. Today in sales: often child of Parent Company directly because Legal Entity is not known yet.
_Avoid_: Legal Entity, Brand

**Deal**:
A boarding event or phase — the commercial engagement under which locations and MIDs are signed and boarded. Creating a new Deal starts a new signing cycle; past Deals stay closed for prior locations/MIDs. Multiple Deals can belong to the same Parent Company.
_Avoid_: Customer, account, corporation (as the Deal itself)

**Corporate Profile**:
The deal-scoped container for one boarding engagement. It can hold multiple Legal Entities, Locations, and MIDs. Its identifier is the Deal's ID — it is not a durable customer or Parent Company record.
_Avoid_: Merchant (as the profile), Customer, Parent Company

**Location**:
A portal/HubSpot convenience for grouping MIDs that share a physical address so merchants aren't re-entering the same street/city/state/ZIP. Owners/Signers often say "location"; we treat that as intent to board a MID. Not the primary boarding object — MIDs are. Every MID must belong to exactly one Location; every Location has at least one MID (creating a Location implies adding a MID — no empty Locations, even in draft). Each Location belongs to exactly one Legal Entity — if two EINs share an address, that is two Locations (and typically two MIDs), even when the street address text matches. Only Locations belonging to the current Deal are editable in that Deal's boarding; Prior Locations are read-only portfolio context.
_Avoid_: Store (as the formal boarding unit), Site, Branch, Concept

**Prior Location**:
A Location (and its MIDs) from an earlier Deal under the same Parent Company, shown read-only on a later Deal so the merchant can see their growing portfolio. Not re-signed; not editable in the new boarding. May sit under a different Legal Entity than the new MIDs.
_Avoid_: Legacy location (ambiguous), Archived location (implies gone)

**MID**:
One merchant processing account (Elavon merchant ID / MSPWare application). Each MID has a **DBA**, belongs to a **Legal Entity**, and must belong to exactly one **Location** (even if that Location has only this MID). Creating a Location always creates or implies at least one MID. DBA and legal name are sometimes the same, usually slightly or wholly different. One Location may group several MIDs that share an address (e.g. bakery and cafe under one roof).
_Avoid_: Concept (retired early term — never use), Application (ambiguous — prefer MSPWare Application when meaning the boarding form), Merchant Account (unless speaking to merchants in plain language)

**Legal Business Name**:
The registered name of the Legal Entity (TIN/EIN owner). Distinct from DBA even when they match by coincidence.
_Avoid_: DBA, Company name (ambiguous)

**DBA**:
The "doing business as" name on a MID — what appears for that processing application (statements/terminals). Belongs to the MID, not the Location.
_Avoid_: Legal Business Name, Concept

**Signer**:
A person who owns or is authorized to sign for boarding (beneficial owner and/or primary signer). One human is one Signer record — reusable across Legal Entities and Deals under the same Parent Company (no duplicate rows for the same person). A single MSPWare application package (one MID) may include multiple Signers; one Signer may appear on multiple packages. When personnel change (e.g. a CFO leaves), the former Signer must not be shown — with name or PII — to people on a later Deal.
_Avoid_: User (portal login), Contact (HubSpot-only), Owner (ambiguous — prefer beneficial owner when meaning equity)

**Former Signer**:
A Signer who is no longer active for this Parent Company (left the business, replaced role, etc.). Retained for audit/history where required, but never presented in a later Deal's roster or UI with identifying PII to current participants. For now, only Cliqbux staff (admin/agent) may mark a Signer as Former.
_Avoid_: Deleted signer (may still exist for compliance), Inactive contact

**MSPWare Application Package**:
The signing package for one MID in MSPWare/BoldSign. One package may require multiple Signers; completing the Deal may mean many packages (one per MID being boarded).
_Avoid_: Application (alone — ambiguous), Envelope (BoldSign implementation detail unless debugging)

**Bank Account**:
The settlement account used for deposits. Usually belongs to the **Legal Entity** — many Locations and MIDs under that entity can share one account. Inheritance: Legal Entity default → Location override → MID override (most specific wins). Sharing is common but not required.
_Avoid_: Plaid connection (that's how we collect it), Routing number (a field, not the concept)

### Pricing

**Pricing**:
The processing fee structure for boarding. Usually **Deal-scoped** on the Corporate Profile — one Pricing for the MIDs in that engagement. Rarely, a single MID may override with MID-specific Pricing; that exception is **staff-only** (merchants always work from Deal Pricing). Distinct from Quote.
_Avoid_: Quote (equipment/HubSpot quote), Template (MSPWare template is how Pricing is applied downstream)

**Quote**:
The HubSpot equipment/hardware offer the merchant signs and pays (usually after application signing). Not processing Pricing — a Deal may have one, both, or (edge cases) either alone.
_Avoid_: Pricing, Invoice (informal for the pay step of a signed Quote)

**Cash Discount**:
Cliqbux's fixed cash-discount program — the only published self-serve CD offer. **Cardholder Card Fee 3.5%** → tiered pricing **3.3816%** (via fee/(100+fee)). Merchants may choose it self-serve.
_Avoid_: Clear and Simple (MSPWare method Cliqbux never uses), Surcharge program (related idea, not our product name), Custom Cash Discount

**Custom Cash Discount**:
Sales-assisted cash-discount pricing where the merchant picks a **Cardholder Card Fee** between 3% and 3.99%. Staff configures that fee; not self-serve. Same product family as Cash Discount (not Flat or Interchange Plus).
_Avoid_: Cash Discount (the fixed public offer), Clear and Simple

**Custom Flat Rate**:
Sales-assisted flat processing rate negotiated per Deal. Always requires three values: **markup %**, **per-transaction fee**, and **auth per card**. Staff only. An agent preset (e.g. 2.5% + $0.10 + $0.10) is a shortcut into this product — not a separate product name.
_Avoid_: Swipe/Keyed Flat Rate (planned published menu — not available)

**Custom Interchange Plus**:
Sales-assisted interchange-plus pricing negotiated per Deal. Always requires the same three values: **markup %**, **per-transaction fee**, and **auth per card**. Staff only. No off-the-shelf self-serve version.
_Avoid_: Traditional, Standard, Premium (legacy labels for the same idea)

**Swipe/Keyed Flat Rate**:
A published Cliqbux flat-rate menu with separate prices for card-present (swipe) vs keyed entry. Distinct from Custom Flat Rate. **Not available** to self-serve or staff until Elavon support lands — planned product only.
_Avoid_: Custom Flat Rate, Self_Swiped / Self_Keyed (legacy enum labels)

**Cardholder Card Fee**:
The percent fee the merchant passes to customers who pay by card under a Cash Discount program. Fixed Cash Discount uses **3.5%** only. Custom Cash Discount allows **3%–3.99%**. The MSPWare tiered pricing rate is derived, not independently negotiated: **tiered % = fee / (100 + fee)** (e.g. 3.5% → 3.3816%, 3.99% → 3.8369%).
_Avoid_: Markup (that's Flat/IC+ language), Surcharge (informal — prefer this term when precise)
