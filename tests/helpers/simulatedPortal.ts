/**
 * In-memory portal + MSPWare draft simulator.
 *
 * Models CURRENT production behavior after the 2026-07-13 MCC hardening:
 * - No silent 5999 fallback (require real MCC / reject 5999)
 * - Draft deferred until MCC is set on MID add
 * - Re-fill on MID boarding-field update
 * - signApplication forces refill on MCC mismatch even at 100%
 *
 * Remaining known gap (still WARN in stress suite): state × MCC liquor
 * underwriting (e.g. CA/NY + 5813) is not enforced in the portal.
 */

import {
  resolveMccForPayload,
  uiCanSaveMid,
  slugifyCorporateId,
  hubspotBypassForCorporateId,
  productionStateMccViolation,
  desiredStateMccViolation,
} from './productionLogic';

export type MidRecord = {
  id: string;
  locationId: string;
  corporateId: string;
  merchantName: string;
  dbaName: string;
  mccCode: string;
  industryType: string;
  monthlyCardSales: number;
  avgSaleAmount: number;
  highestTicketAmount: number;
  cardPresentPct: number;
  applicationStepStatus: string;
  mspApplicationNo: string | null;
};

export type LocationRecord = {
  id: string;
  corporateId: string;
  dbaName: string;
  businessStreet: string;
  businessCity: string;
  businessState: string;
  businessZip: string;
  bankDetails?: { routingNumber: string; accountNumber: string } | null;
};

export type ProfileRecord = {
  corporateId: string;
  legalName: string;
  mccCode?: string;
  pricingTier: string;
  applicationStatus: string;
  customMarkupPercentage?: number | null;
  customPerTxFee?: number | null;
  customAuthPerCard?: number | null;
};

export type DraftRecord = {
  appNo: string;
  midId: string;
  corporateId: string;
  mcc: string;
  state: string;
  percentComplete: number;
  formErrors: string[];
  createdAt: number;
  lastFilledAt: number;
  lastFillSource: 'create' | 'refill' | 'none';
};

export type HubSpotCallLog = {
  fn: 'syncFromHubspot' | 'getHubspotQuote' | 'pushStatusToHubspot';
  corporateId: string;
  attemptedApi: boolean;
  hubspotBypass: boolean;
};

let seq = 1;
const nextId = (prefix: string) => `${prefix}_${seq++}`;

const LOCKED = ['Pending MID', 'Active', 'Active (Existing)'];

export class SimulatedPortal {
  profiles = new Map<string, ProfileRecord>();
  locations = new Map<string, LocationRecord>();
  mids = new Map<string, MidRecord>();
  drafts = new Map<string, DraftRecord>(); // keyed by midId
  hubspotCalls: HubSpotCallLog[] = [];
  validationWarnings: Array<{ midId?: string; locationId?: string; message: string; at: number }> = [];

  createLocalStage(businessName: string) {
    const corporateId = slugifyCorporateId(businessName);
    const profile: ProfileRecord = {
      corporateId,
      legalName: businessName,
      pricingTier: 'SELF_SERVE_CASH_DISCOUNT',
      applicationStatus: 'Incomplete',
    };
    this.profiles.set(corporateId, profile);
    return { corporateId, profile, hubspotBypass: true };
  }

  addLocation(corporateId: string, data: Partial<LocationRecord> & { dbaName: string; businessState: string }) {
    const id = nextId('loc');
    const loc: LocationRecord = {
      id,
      corporateId,
      dbaName: data.dbaName,
      businessStreet: data.businessStreet || '100 Main St',
      businessCity: data.businessCity || 'Testville',
      businessState: data.businessState,
      businessZip: data.businessZip || '90001',
      bankDetails: data.bankDetails ?? null,
    };
    this.locations.set(id, loc);
    return loc;
  }

  /**
   * Mirrors manageMerchantID action=add — allows empty mccCode but defers
   * submitToMSP until a real MCC is present.
   */
  addMid(corporateId: string, locationId: string, data: Partial<MidRecord> = {}) {
    const loc = this.locations.get(locationId);
    if (!loc) throw new Error('location not found');

    if (String(data.mccCode || '').trim() === '5999') {
      throw new Error('MCC 5999 is not allowed (restricted merchant category — rejected in CA/CO/NY)');
    }

    const mid: MidRecord = {
      id: nextId('mid'),
      locationId,
      corporateId,
      merchantName: data.merchantName || loc.dbaName,
      dbaName: data.dbaName || data.merchantName || loc.dbaName,
      mccCode: data.mccCode || '',
      industryType: data.industryType || '',
      monthlyCardSales: data.monthlyCardSales ?? 0,
      avgSaleAmount: data.avgSaleAmount ?? 0,
      highestTicketAmount: data.highestTicketAmount ?? 0,
      cardPresentPct: data.cardPresentPct ?? 100,
      applicationStepStatus: 'In Review',
      mspApplicationNo: null,
    };
    this.mids.set(mid.id, mid);

    const hasMcc = Boolean(String(mid.mccCode || '').trim()) && mid.mccCode !== '5999';
    if (hasMcc) {
      try {
        this.submitToMSP(corporateId, [mid.id]);
      } catch {
        /* non-fatal — same as manageMerchantID */
      }
    }

    return mid;
  }

  /**
   * UI gate for MidCard Save — production blocks when MCC empty.
   */
  uiSaveMid(midId: string, form: Partial<MidRecord> & { mccCode?: string; cardPresentPct?: number; internetPct?: number; motoPct?: number }) {
    if (!uiCanSaveMid({
      mccCode: form.mccCode,
      cardPresentPct: form.cardPresentPct ?? 100,
      internetPct: form.internetPct ?? 0,
      motoPct: form.motoPct ?? 0,
    })) {
      return { blocked: true as const, reason: 'UI: Fill MCC & card split to save' };
    }
    return this.updateMid(midId, form);
  }

  /**
   * Mirrors manageMerchantID action=update — persists boarding fields and
   * re-invokes submitToMSP when MCC/volume/etc. change.
   */
  updateMid(midId: string, data: Partial<MidRecord>) {
    const mid = this.mids.get(midId);
    if (!mid) throw new Error('mid not found');
    const loc = this.locations.get(mid.locationId);

    if (data.mccCode !== undefined && String(data.mccCode).trim() === '5999') {
      return {
        blocked: true as const,
        reason: 'MCC 5999 is not allowed',
        mid,
        draftUnchanged: this.drafts.get(midId) || null,
        locationState: loc?.businessState,
      };
    }

    Object.assign(mid, {
      ...(data.merchantName !== undefined ? { merchantName: data.merchantName, dbaName: data.merchantName } : {}),
      ...(data.mccCode !== undefined ? { mccCode: data.mccCode } : {}),
      ...(data.industryType !== undefined ? { industryType: data.industryType } : {}),
      ...(data.monthlyCardSales !== undefined ? { monthlyCardSales: Number(data.monthlyCardSales) } : {}),
      ...(data.avgSaleAmount !== undefined ? { avgSaleAmount: Number(data.avgSaleAmount) } : {}),
      ...(data.highestTicketAmount !== undefined ? { highestTicketAmount: Number(data.highestTicketAmount) } : {}),
      ...(data.cardPresentPct !== undefined ? { cardPresentPct: Number(data.cardPresentPct) } : {}),
    });

    const boardingKeys: (keyof MidRecord)[] = [
      'mccCode', 'industryType', 'monthlyCardSales', 'avgSaleAmount',
      'highestTicketAmount', 'cardPresentPct', 'merchantName', 'dbaName',
    ];
    const touchedBoarding = boardingKeys.some((k) => data[k] !== undefined);
    if (touchedBoarding && mid.mccCode && mid.mccCode !== '5999' && !LOCKED.includes(mid.applicationStepStatus)) {
      try {
        this.submitToMSP(mid.corporateId, [mid.id]);
      } catch {
        /* non-fatal */
      }
    }

    return { blocked: false as const, mid, draftUnchanged: this.drafts.get(midId) || null, locationState: loc?.businessState };
  }

  updateLocationState(locationId: string, newState: string) {
    const loc = this.locations.get(locationId);
    if (!loc) throw new Error('location not found');
    const prev = loc.businessState;
    loc.businessState = newState;

    const warnings: string[] = [];
    const mids = [...this.mids.values()].filter((m) => m.locationId === locationId);
    for (const mid of mids) {
      const desired = desiredStateMccViolation(newState, mid.mccCode);
      const production = productionStateMccViolation(newState, mid.mccCode);
      if (desired && !production) {
        warnings.push(`GAP: ${desired}`);
      } else if (production) {
        const msg = production;
        this.validationWarnings.push({ midId: mid.id, locationId, message: msg, at: Date.now() });
        warnings.push(msg);
      }
    }

    return { prev, next: newState, warnings, inlineWarningFired: warnings.some((w) => !w.startsWith('GAP:')) };
  }

  /**
   * Mirrors submitToMSP — skips MIDs without MCC / with 5999; never invents MCC.
   */
  submitToMSP(corporateId: string, midIds?: string[]) {
    const profile = this.profiles.get(corporateId);
    if (!profile) throw new Error('profile not found');

    const targets = midIds?.length
      ? midIds.map((id) => this.mids.get(id)!).filter(Boolean)
      : [...this.mids.values()].filter((m) => m.corporateId === corporateId);

    const results = [];
    for (const mid of targets) {
      const loc = this.locations.get(mid.locationId)!;
      let mcc: string;
      try {
        mcc = resolveMccForPayload(mid, profile);
      } catch {
        // Production: skipped with reason — no draft created
        continue;
      }

      const appNo = mid.mspApplicationNo || nextId('msp');
      mid.mspApplicationNo = appNo;

      let percentComplete = 100;
      const formErrors: string[] = [];

      const desired = desiredStateMccViolation(loc.businessState, mcc);
      if (desired) {
        percentComplete = 79;
        formErrors.push(desired);
      }

      const prev = this.drafts.get(mid.id);
      const draft: DraftRecord = {
        appNo,
        midId: mid.id,
        corporateId,
        mcc,
        state: loc.businessState,
        percentComplete,
        formErrors,
        createdAt: prev?.createdAt || Date.now(),
        lastFilledAt: Date.now(),
        lastFillSource: prev ? 'refill' : 'create',
      };
      this.drafts.set(mid.id, draft);
      results.push(draft);
    }
    return results;
  }

  /**
   * Mirrors signApplication: refill when not 100% OR MCC mismatch vs portal.
   */
  signApplication(corporateId: string, midId: string) {
    const mid = this.mids.get(midId);
    if (!mid) throw new Error('mid not found');
    const loc = this.locations.get(mid.locationId)!;
    const profile = this.profiles.get(corporateId)!;

    let draft = this.drafts.get(midId);
    if (!draft) {
      const created = this.submitToMSP(corporateId, [midId]);
      draft = created[0];
      if (!draft) {
        return {
          before: null,
          after: null,
          skippedRefill: false,
          refilled: false,
          blocked: true,
          signingAllowed: false,
          error: 'MCC required before draft/sign',
        };
      }
    }

    const before = { ...draft };
    let skippedRefill = false;
    let refilled = false;

    const expectedMcc = String(mid.mccCode || profile.mccCode || '').trim();
    const mccMismatch = Boolean(expectedMcc && draft.mcc && draft.mcc !== expectedMcc);
    const needsRefill = draft.percentComplete !== 100 || mccMismatch;

    if (!needsRefill) {
      skippedRefill = true;
    } else {
      const mcc = resolveMccForPayload(mid, profile);
      const desired = desiredStateMccViolation(loc.businessState, mcc);
      draft.mcc = mcc;
      draft.state = loc.businessState;
      draft.lastFilledAt = Date.now();
      draft.lastFillSource = 'refill';
      refilled = true;
      if (desired) {
        draft.percentComplete = 79;
        draft.formErrors = [desired];
      } else {
        draft.percentComplete = 100;
        draft.formErrors = [];
      }
    }

    const blocked = draft.percentComplete < 100;
    return {
      before,
      after: { ...draft },
      skippedRefill,
      refilled,
      blocked,
      signingAllowed: !blocked,
    };
  }

  syncFromHubspot(corporateId: string) {
    const bypass = hubspotBypassForCorporateId(corporateId);
    this.hubspotCalls.push({
      fn: 'syncFromHubspot',
      corporateId,
      attemptedApi: !bypass,
      hubspotBypass: bypass,
    });
    return { success: true, synced: false, hubspotBypass: bypass, corporateId };
  }

  pushStatusToHubspot(corporateId: string, milestone: string) {
    const bypass = hubspotBypassForCorporateId(corporateId);
    this.hubspotCalls.push({
      fn: 'pushStatusToHubspot',
      corporateId,
      attemptedApi: !bypass,
      hubspotBypass: bypass,
    });
    return { success: true, synced: false, hubspotBypass: bypass, corporateId, milestone };
  }

  getHubspotQuote(corporateId: string) {
    const bypass = hubspotBypassForCorporateId(corporateId);
    this.hubspotCalls.push({
      fn: 'getHubspotQuote',
      corporateId,
      attemptedApi: !bypass,
      hubspotBypass: bypass,
    });
    return { success: true, hubspotBypass: bypass, corporateId };
  }

  completeBanking(locationId: string) {
    const loc = this.locations.get(locationId)!;
    loc.bankDetails = { routingNumber: '121000248', accountNumber: '123456789' };
    return loc;
  }

  /** Backend refusal check — production refuses empty / 5999 MCC (2026-07-13). */
  backendRefuseEmptyMidCompile(mid: MidRecord): { refused: boolean; reason?: string; compiledMcc?: string } {
    try {
      const compiledMcc = resolveMccForPayload(mid, this.profiles.get(mid.corporateId) || {});
      return { refused: false, compiledMcc };
    } catch (e: any) {
      return { refused: true, reason: e?.message || 'MCC required' };
    }
  }

  getDraft(midId: string) {
    return this.drafts.get(midId) || null;
  }
}
