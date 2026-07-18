# HubSpot company hierarchy: Parent → Legal Entity → Location

Sales does not know Legal Entity structure during the deal cycle, so HubSpot today is often Parent Company → Location. We decided the north-star HubSpot shape is **Parent Company (operator/ownership) → Legal Entity (EIN, once known) → Location (physical site)**. Brand is a label/naming on the Parent Company, not a required company tier. After onboarding learns EINs, create or link Legal Entity companies and reparent Location children under them — do not keep Legal Entity as HubSpot-property-only, and do not insert a separate Brand company tier.

## Status

accepted

## Considered Options

- **Parent → Location forever; Legal Entity only in boarding (Base44)** — simplest for sales, but never gives HubSpot a true tax/ownership tree for multi-EIN operators.
- **Parent → Brand → Location** — matches older docs and some multi-brand groups, but Brand is not what boarding signs against; Legal Entity (EIN) is.
- **Parent → Legal Entity → Location** (chosen) — aligns CRM with boarding once EINs exist; allows sales to temporarily skip the Legal Entity tier until onboarding fills it.
