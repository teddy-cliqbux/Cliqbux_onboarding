# Legacy POS schemas — Cliqbux migration reference

This document covers (1) the Base44 entity that stores connection intents/credentials and
(2) the **provider-side data shapes** we expect when migrating menus, items, and locations
from each supported POS. Use this when wiring OAuth or ETL jobs — do not invent field names.

---

## 1. Base44 entity: `MerchantPOSConnection`

**File:** `base44/entities/MerchantPOSConnection.jsonc`

**Must be published in Base44** (Data → Entities / schema sync) or creates fail with:
`Entity schema MerchantPOSConnection not found in app`.

| Field | Type | Notes |
|---|---|---|
| `corporateId` | string | HubSpot dealId / profile key |
| `connectionMethod` | enum | `oauth` \| `access_account` \| `credential_vault` |
| `provider` | enum | `clover` \| `square` \| `lightspeed` \| `shopify` \| `toast` \| `other` |
| `username` | string | Option C only |
| `passwordCiphertext` | string | RSA-OAEP ciphertext only — never plaintext |
| `consentAccepted` | boolean | Required true for vault |
| `consentTextVersion` | string | e.g. `2026-07-13-v1` |
| `consentTimestamp` | string | ISO |
| `authorizedUserEmail` | string | Server-derived from JWT/profile |
| `ipAddress` | string | Server-derived from headers |
| `status` | enum | `pending_review` \| `connected` \| `rejected` |
| `notes` | string | OAuth intent / AM notes |

Write path: `submitLegacyPOSConnection` (portal `getPortalActor`).

---

## 2. Provider migration schemas (canonical objects we care about)

Cliqbux migrates **locations**, **menus/catalog**, and **modifiers** into storefront setup.
Below are the stable identifiers / objects each API exposes. Confirm against current
provider docs before coding an ETL — versions change.

### Clover (`clover`)

| Cliqbux concept | Clover object / endpoint family | Key fields |
|---|---|---|
| Location | Merchant / `m` (merchant id) | `id`, `name`, `address` |
| Catalog item | `/v3/merchants/{mId}/items` | `id`, `name`, `price` (cents), `sku`, `categories` |
| Category | `/v3/merchants/{mId}/categories` | `id`, `name`, `sortOrder` |
| Modifier | `/v3/merchants/{mId}/modifier_groups` + modifiers | `id`, `name`, `price` |
| Auth | OAuth 2.0 (Clover App Market) or API token | scopes: `ITEMS_R`, `INVENTORY_R`, `MERCHANT_R` |

### Square (`square`)

| Cliqbux concept | Square object | Key fields |
|---|---|---|
| Location | `Location` | `id`, `name`, `address`, `status` |
| Catalog item | `CatalogObject` type `ITEM` | `id`, `item_data.name`, `item_data.variations[]` |
| Variation | `ITEM_VARIATION` | `id`, `item_variation_data.price_money`, `sku` |
| Category | `CATEGORY` | `id`, `category_data.name` |
| Modifier | `MODIFIER_LIST` / `MODIFIER` | `id`, `modifier_data.name`, `price_money` |
| Auth | OAuth 2.0 | scopes: `ITEMS_READ`, `MERCHANT_PROFILE_READ` |

### Lightspeed Restaurant / Retail (`lightspeed`)

Lightspeed has **Retail (R-Series)** and **Restaurant (L-Series / K-Series)** APIs — pick the product the merchant actually uses.

| Cliqbux concept | Typical Lightspeed object | Key fields |
|---|---|---|
| Location | Shop / Site | `id`, `name`, `address` |
| Item | Item / Product | `id`, `description`/`name`, `price`, `sku` |
| Category | Category / Group | `id`, `name` |
| Auth | OAuth 2.0 (Lightspeed) | account-specific base URL |

### Shopify (`shopify`)

| Cliqbux concept | Shopify Admin GraphQL / REST | Key fields |
|---|---|---|
| Location | `Location` | `id`, `name`, `address` |
| Product | `Product` | `id`, `title`, `status` |
| Variant | `ProductVariant` | `id`, `sku`, `price`, `barcode` |
| Collection | `Collection` (optional category map) | `id`, `title` |
| Auth | OAuth 2.0 custom app / Partner app | scopes: `read_products`, `read_locations` |

### Toast (`toast`)

| Cliqbux concept | Toast API | Key fields |
|---|---|---|
| Restaurant | Restaurant GUID | `guid`, `name` |
| Menu | Menus API | menu groups → items |
| Item | Menu item | `guid`, `name`, `price`, `sku` / PLU |
| Modifier | Modifier groups | `guid`, `name`, `price` |
| Auth | Toast partner OAuth / client credentials | partner agreement required |

---

## 3. Normalized target shape (future ETL)

When we build sync jobs, map every provider into this Cliqbux-normalized JSON (not stored yet — design target):

```json
{
  "provider": "clover",
  "externalLocationId": "…",
  "dbaName": "…",
  "categories": [{ "externalId": "…", "name": "…" }],
  "items": [{
    "externalId": "…",
    "name": "…",
    "sku": "…",
    "priceCents": 1299,
    "categoryExternalIds": ["…"],
    "modifiers": [{ "externalId": "…", "name": "…", "priceCents": 0 }]
  }]
}
```

Inventory file uploads (`MerchantInventoryAssets`) remain the manual fallback until OAuth ETLs ship.

---

## 4. Publish checklist (Teddy / Base44)

1. Push this repo (includes `MerchantPOSConnection.jsonc`).
2. In Base44: sync/publish **entity schema** `MerchantPOSConnection`.
3. Redeploy function `submitLegacyPOSConnection`.
4. Publish frontend (POS logos + friendlier error copy).
5. Confirm: click Clover on Setup preview → no “Entity schema … not found”; see Coming Soon.
