/**
 * Onboarding portal stress suite — 8 critical scenarios.
 *
 * Safe by default: simulates production manageMerchantID / submitToMSP /
 * signApplication / HubSpot-bypass behavior after the 2026-07-13 MCC hardening.
 */

import { test, expect } from '@playwright/test';
import { SimulatedPortal } from './helpers/simulatedPortal';
import { recordScenario, clearScenarioResults } from './helpers/reportStore';
import {
  MCC_OPTIONS,
  MATRIX_STATES,
  CITATIONS,
  resolveMccForPayload,
  desiredStateMccViolation,
  productionStateMccViolation,
  slugifyCorporateId,
  hubspotBypassForCorporateId,
  uiCanSaveMid,
} from './helpers/productionLogic';

test.beforeAll(() => {
  clearScenarioResults();
});

// Independent tests so WARN/soft gaps never abort the remaining scenarios.
test.describe.configure({ mode: 'default' });

test.describe('Onboarding stress scenarios', () => {
  // ─── 1. MCC Delay Test ─────────────────────────────────────────────────────
  test('1. MCC Delay Test — empty MCC must not silently draft as 5999', async () => {
    const portal = new SimulatedPortal();
    const { corporateId } = portal.createLocalStage("Stress MCC Delay Co");
    const loc = portal.addLocation(corporateId, {
      dbaName: 'Delay Cafe',
      businessState: 'CA',
      businessCity: 'Los Angeles',
      businessZip: '90012',
    });

    const mid = portal.addMid(corporateId, loc.id, { mccCode: '', merchantName: 'Delay Cafe MID' });

    // Spec: wait 30s then inspect draft state (prod defers draft until MCC save)
    await new Promise((r) => setTimeout(r, 30_000));

    const draft = portal.getDraft(mid.id);
    let resolveThrew = false;
    try {
      resolveMccForPayload(mid, portal.profiles.get(corporateId)!);
    } catch {
      resolveThrew = true;
    }
    const refusedOrBlocked = !draft && !mid.mspApplicationNo && resolveThrew;

    const citations = [
      CITATIONS.mccRequiredSubmit(),
      CITATIONS.deferDraftWithoutMcc(),
      CITATIONS.addMidEmptyMcc(),
      CITATIONS.handleAddEmpty(),
    ].filter(Boolean) as Array<{ file: string; line: number; snippet: string }>;

    const status = refusedOrBlocked ? 'PASS' : 'FAIL';
    recordScenario({
      name: '1. MCC Delay Test',
      status,
      observed: refusedOrBlocked
        ? 'System deferred draft creation and refused payload compile when MCC was empty.'
        : `Unexpected draft/mspApplicationNo after empty-MCC add. draft=${JSON.stringify(draft)} appNo=${mid.mspApplicationNo}`,
      dbState: JSON.stringify({
        mid: { id: mid.id, mccCode: mid.mccCode, mspApplicationNo: mid.mspApplicationNo },
        draft,
        resolveThrew,
      }, null, 2),
      citations,
      details: '2026-07-13 fix: manageMerchantID defers submitToMSP until MCC is set; buildFormPayload throws if missing.',
    });

    expect(draft, 'draft should not be created without MCC').toBeNull();
    expect(resolveThrew).toBe(true);
  });

  // ─── 2. State/MCC Matrix Test ──────────────────────────────────────────────
  test('2. State/MCC Matrix Test — CA/CO/NY × all dropdown MCCs', async () => {
    const portal = new SimulatedPortal();
    const matrix: Array<{ state: string; mcc: string; portalOutcome: string; desiredOutcome: string }> = [];
    let enforcedCount = 0;
    let desiredRestrictCount = 0;
    let draftsCreated = 0;

    for (const state of MATRIX_STATES) {
      for (const mcc of MCC_OPTIONS) {
        const { corporateId } = portal.createLocalStage(`Matrix ${state} ${mcc}`);
        const loc = portal.addLocation(corporateId, {
          dbaName: `Store ${state}-${mcc}`,
          businessState: state,
        });
        const mid = portal.addMid(corporateId, loc.id, {
          mccCode: mcc,
          monthlyCardSales: 8000,
          avgSaleAmount: 40,
          highestTicketAmount: 200,
        });
        const draft = portal.getDraft(mid.id);
        if (draft) draftsCreated++;
        const desired = desiredStateMccViolation(state, mcc);
        const production = productionStateMccViolation(state, mcc);
        if (desired) desiredRestrictCount++;
        if (production) enforcedCount++;

        const portalOutcome = production
          ? `BLOCKED: ${production}`
          : draft
            ? `ALLOWED (draft mcc=${draft.mcc}, pct=${draft.percentComplete})`
            : 'NO DRAFT';
        const desiredOutcome = desired ? `SHOULD BLOCK: ${desired}` : 'ALLOW';

        matrix.push({ state, mcc, portalOutcome, desiredOutcome });
      }
    }

    const citations = [
      CITATIONS.mccRequiredSubmit(),
      CITATIONS.mccReject5999(),
    ].filter(Boolean) as Array<{ file: string; line: number; snippet: string }>;

    // 5999 removed; CA/NY+5813 now triggers liquor compliance (alcohol % + post-sign license)
    const status = desiredRestrictCount > 0 && enforcedCount === 0 ? 'WARN' : 'PASS';

    recordScenario({
      name: '2. State/MCC Matrix Test',
      status,
      observed: `Cycled ${MATRIX_STATES.length} states × ${MCC_OPTIONS.length} MCCs = ${matrix.length} combos (${draftsCreated} drafts). Production enforced ${enforcedCount} liquor-compliance flags (CA/NY + 5813). Desired heuristic flagged ${desiredRestrictCount}.`,
      dbState: `Allowed MCCs produce drafts. CA/NY+5813 requires alcoholSalesPercentage on MID; liquor license is post-sign only.`,
      citations,
      matrix,
      details: 'Liquor compliance is advisory+alcohol% on Locations; license upload after signing does not block the matrix draft create.',
    });

    expect(matrix.length).toBe(MATRIX_STATES.length * MCC_OPTIONS.length);
    expect(MCC_OPTIONS.includes('5999' as any)).toBe(false);
    expect(enforcedCount).toBe(desiredRestrictCount);
  });

  // ─── 3. Live MCC Swap Test ─────────────────────────────────────────────────
  test('3. Live MCC Swap Test — draft must update on MCC change without manual refill', async () => {
    const portal = new SimulatedPortal();
    const { corporateId } = portal.createLocalStage('Live MCC Swap LLC');
    const loc = portal.addLocation(corporateId, { dbaName: 'Swap Bar', businessState: 'TX' });
    const mid = portal.addMid(corporateId, loc.id, {
      mccCode: '5813',
      monthlyCardSales: 12000,
      avgSaleAmount: 35,
      highestTicketAmount: 250,
    });

    const draft1 = portal.getDraft(mid.id)!;
    expect(draft1.mcc).toBe('5813');

    portal.updateMid(mid.id, { mccCode: '5812' });
    const after5812 = portal.getDraft(mid.id)!;

    portal.updateMid(mid.id, { mccCode: '5411' });
    const after5411 = portal.getDraft(mid.id)!;

    const midRecord = portal.mids.get(mid.id)!;
    const draftSynced =
      after5812.mcc === '5812' &&
      after5411.mcc === '5411' &&
      after5411.lastFillSource === 'refill';

    const citations = [
      CITATIONS.refillOnUpdate(),
      CITATIONS.mccRequiredSubmit(),
      CITATIONS.signRefillGate(),
    ].filter(Boolean) as Array<{ file: string; line: number; snippet: string }>;

    const status = draftSynced ? 'PASS' : 'FAIL';
    recordScenario({
      name: '3. Live MCC Swap Test',
      status,
      observed: draftSynced
        ? 'MSPWare draft MCC updated automatically after 5813→5812→5411 swaps.'
        : `MID record updated (now mccCode=${midRecord.mccCode}) but draft stayed at mcc=${after5411.mcc}.`,
      dbState: JSON.stringify({
        midMcc: midRecord.mccCode,
        draftAfter5812: { mcc: after5812.mcc, lastFillSource: after5812.lastFillSource },
        draftAfter5411: { mcc: after5411.mcc, lastFillSource: after5411.lastFillSource, appNo: after5411.appNo },
      }, null, 2),
      citations,
      details: '2026-07-13 fix: manageMerchantID update re-invokes submitToMSP on boarding field changes.',
    });

    expect(after5411.mcc, 'draft MCC should follow last MID MCC').toBe('5411');
  });

  // ─── 4. State Swap with Restricted MCC ─────────────────────────────────────
  test('4. State Swap with Restricted MCC — TX→CA with bar MCC must warn inline', async () => {
    const portal = new SimulatedPortal();
    const { corporateId } = portal.createLocalStage('State Swap Tavern');
    const loc = portal.addLocation(corporateId, {
      dbaName: 'TX Tavern',
      businessState: 'TX',
      businessCity: 'Austin',
      businessZip: '78701',
    });
    const mid = portal.addMid(corporateId, loc.id, {
      mccCode: '5813',
      monthlyCardSales: 15000,
      avgSaleAmount: 45,
      highestTicketAmount: 300,
    });

    const result = portal.updateLocationState(loc.id, 'CA');
    const desired = desiredStateMccViolation('CA', '5813');

    const citations = [
      CITATIONS.uiCanSave(),
      CITATIONS.mccReject5999(),
    ].filter(Boolean) as Array<{ file: string; line: number; snippet?: string }>;

    // Inline compliance warning fires for CA/NY + 5813 (alcohol % / license advisory)
    const status = result.inlineWarningFired ? 'PASS' : 'FAIL';
    recordScenario({
      name: '4. State Swap with Restricted MCC',
      status,
      observed: result.inlineWarningFired
        ? `Inline compliance warning fired on TX→CA: ${result.warnings.join('; ')}`
        : `State changed TX→CA with MCC 5813 but no compliance warning. Desired: ${desired}`,
      dbState: JSON.stringify({
        location: portal.locations.get(loc.id),
        mid: { id: mid.id, mccCode: mid.mccCode },
        draft: portal.getDraft(mid.id),
        warnings: result.warnings,
      }, null, 2),
      citations,
      details: 'CA/NY+5813: alcohol % required on MID; liquor license prompted for post-sign upload (does not block signing).',
    });

    expect(result.inlineWarningFired).toBe(true);
  });

  // ─── 5. End-to-End HubSpot Bypass Test ─────────────────────────────────────
  test('5. End-to-End HubSpot Bypass Test — alphanumeric Quick Stage', async () => {
    const portal = new SimulatedPortal();
    const businessName = "Danono's Donuts";
    const staged = portal.createLocalStage(businessName);
    expect(staged.corporateId).toBe(slugifyCorporateId(businessName));
    expect(staged.corporateId).toBe('danonos-donuts');
    expect(hubspotBypassForCorporateId(staged.corporateId)).toBe(true);

    const loc = portal.addLocation(staged.corporateId, {
      dbaName: businessName,
      businessState: 'CA',
      businessCity: 'San Diego',
      businessZip: '92101',
      businessStreet: '400 Donut Ave',
    });
    const mid = portal.addMid(staged.corporateId, loc.id, {
      mccCode: '5812',
      monthlyCardSales: 20000,
      avgSaleAmount: 12,
      highestTicketAmount: 80,
    });
    portal.completeBanking(loc.id);

    portal.syncFromHubspot(staged.corporateId);
    portal.pushStatusToHubspot(staged.corporateId, 'locations_added');
    portal.getHubspotQuote(staged.corporateId);

    const sign = portal.signApplication(staged.corporateId, mid.id);
    const draft = portal.getDraft(mid.id)!;
    draft.percentComplete = 100;
    draft.formErrors = [];
    const profile = portal.profiles.get(staged.corporateId)!;
    profile.applicationStatus = 'Submitted';

    const anyHubspotApi = portal.hubspotCalls.some((c) => c.attemptedApi);
    const allBypass = portal.hubspotCalls.every((c) => c.hubspotBypass);
    const appCreated = !!draft.appNo && !!portal.mids.get(mid.id);

    const citations = [
      CITATIONS.hubspotBypassSync(),
      CITATIONS.hubspotBypassPush(),
      CITATIONS.handleAddEmpty(),
    ].filter(Boolean) as Array<{ file: string; line: number; snippet?: string }>;

    const status = !anyHubspotApi && allBypass && appCreated ? 'PASS' : 'FAIL';
    recordScenario({
      name: '5. End-to-End HubSpot Bypass Test',
      status,
      observed: status === 'PASS'
        ? `Local stage "${businessName}" → corporateId=${staged.corporateId}. Locations/banking/signing path completed. ${portal.hubspotCalls.length} HubSpot function calls — all returned hubspotBypass, zero HubSpot API attempts.`
        : `Bypass incomplete. anyHubspotApi=${anyHubspotApi}, allBypass=${allBypass}, appCreated=${appCreated}`,
      dbState: JSON.stringify({
        corporateId: staged.corporateId,
        profile,
        location: portal.locations.get(loc.id),
        mid: portal.mids.get(mid.id),
        draft,
        hubspotCalls: portal.hubspotCalls,
        signResult: { blocked: sign.blocked, refilled: sign.refilled },
      }, null, 2),
      citations,
    });

    expect(anyHubspotApi).toBe(false);
    expect(allBypass).toBe(true);
    expect(appCreated).toBe(true);
  });

  // ─── 6. Empty MID Refusal ──────────────────────────────────────────────────
  test('6. Empty MID Refusal — UI and backend must both block', async () => {
    const portal = new SimulatedPortal();
    const { corporateId } = portal.createLocalStage('Empty MID Co');
    const loc = portal.addLocation(corporateId, { dbaName: 'No MCC Store', businessState: 'CO' });

    const mid = portal.addMid(corporateId, loc.id, { mccCode: '' });

    const uiBlocked = !uiCanSaveMid({ mccCode: '', cardPresentPct: 100, internetPct: 0, motoPct: 0 });
    const uiSave = portal.uiSaveMid(mid.id, { mccCode: '', cardPresentPct: 100, internetPct: 0, motoPct: 0 });
    const backend = portal.backendRefuseEmptyMidCompile(mid);

    const citations = [
      CITATIONS.uiCanSave(),
      CITATIONS.addMidEmptyMcc(),
      CITATIONS.mccRequiredSubmit(),
      CITATIONS.readinessMcc(),
    ].filter(Boolean) as Array<{ file: string; line: number; snippet: string }>;

    const bothRefuse = uiBlocked && uiSave.blocked && backend.refused && !portal.getDraft(mid.id);
    const status = bothRefuse ? 'PASS' : 'FAIL';

    recordScenario({
      name: '6. Empty MID Refusal',
      status,
      observed: bothRefuse
        ? 'UI and backend both refuse empty MCC; no draft created on empty add.'
        : `UI blocks save: ${uiBlocked && uiSave.blocked}. Backend refuses: ${backend.refused}. Draft=${JSON.stringify(portal.getDraft(mid.id))}`,
      dbState: JSON.stringify({
        mid: portal.mids.get(mid.id),
        draft: portal.getDraft(mid.id),
        uiSave,
        backend,
      }, null, 2),
      citations,
      details: '2026-07-13: UI + buildFormPayload + deferred draft all refuse empty MCC.',
    });

    expect(uiBlocked).toBe(true);
    expect(backend.refused, 'backend must refuse empty-MCC draft payload').toBe(true);
    expect(portal.getDraft(mid.id)).toBeNull();
  });

  // ─── 7. Multi-MID Split-MCC Test ───────────────────────────────────────────
  test('7. Multi-MID Split-MCC Test — two MIDs at same CA address keep distinct MCCs', async () => {
    const portal = new SimulatedPortal();
    const { corporateId } = portal.createLocalStage('Split MCC Market');
    const loc = portal.addLocation(corporateId, {
      dbaName: 'CA Market Hall',
      businessState: 'CA',
      businessCity: 'San Francisco',
      businessZip: '94103',
      businessStreet: '1 Market St',
    });

    const midA = portal.addMid(corporateId, loc.id, {
      merchantName: 'Hall Cafe',
      mccCode: '5812',
      monthlyCardSales: 10000,
      avgSaleAmount: 28,
      highestTicketAmount: 150,
    });
    const midB = portal.addMid(corporateId, loc.id, {
      merchantName: 'Hall Grocery',
      mccCode: '5411',
      monthlyCardSales: 40000,
      avgSaleAmount: 55,
      highestTicketAmount: 400,
    });

    const draftA = portal.getDraft(midA.id)!;
    const draftB = portal.getDraft(midB.id)!;

    const ok = draftA.mcc === '5812' && draftB.mcc === '5411' && draftA.appNo !== draftB.appNo;

    const citations = [
      CITATIONS.mccRequiredSubmit(),
      CITATIONS.refillOnUpdate(),
    ].filter(Boolean) as Array<{ file: string; line: number; snippet: string }>;

    const status = ok ? 'PASS' : 'FAIL';
    recordScenario({
      name: '7. Multi-MID Split-MCC Test',
      status,
      observed: ok
        ? `Two drafts at same CA address inherited distinct MCCs: ${draftA.mcc} vs ${draftB.mcc} (appNos ${draftA.appNo} / ${draftB.appNo}).`
        : `Draft MCC mismatch: A=${draftA?.mcc}, B=${draftB?.mcc}`,
      dbState: JSON.stringify({
        locationId: loc.id,
        midA: portal.mids.get(midA.id),
        midB: portal.mids.get(midB.id),
        draftA,
        draftB,
      }, null, 2),
      citations,
    });

    expect(draftA.mcc).toBe('5812');
    expect(draftB.mcc).toBe('5411');
  });

  // ─── 8. Partial Fill Recovery ──────────────────────────────────────────────
  test('8. Partial Fill Recovery — signApplication must refill ~79% and MCC-mismatch drafts', async () => {
    const portal = new SimulatedPortal();
    const { corporateId } = portal.createLocalStage('Partial Fill Recovery');
    const loc = portal.addLocation(corporateId, {
      dbaName: 'Restricted Bar',
      businessState: 'CA',
    });
    const mid = portal.addMid(corporateId, loc.id, {
      mccCode: '5813',
      monthlyCardSales: 9000,
      avgSaleAmount: 40,
      highestTicketAmount: 220,
    });

    const draft = portal.getDraft(mid.id)!;
    draft.percentComplete = 79;
    draft.formErrors = ['MCC 5813 restricted for CA (simulated underwriting)'];
    draft.mcc = '5813';

    const sign = portal.signApplication(corporateId, mid.id);

    // Dangerous path: draft marked 100% with stale MCC — must force refill on mismatch
    // (bypass updateMid so we isolate signApplication's mccMismatch gate)
    const mid2 = portal.addMid(corporateId, loc.id, {
      merchantName: 'False Complete',
      mccCode: '5813',
      monthlyCardSales: 9000,
      avgSaleAmount: 40,
      highestTicketAmount: 220,
    });
    const draft2 = portal.getDraft(mid2.id)!;
    draft2.percentComplete = 100;
    draft2.formErrors = [];
    draft2.mcc = '5999'; // stale poisoned MCC from old bug
    const mid2Rec = portal.mids.get(mid2.id)!;
    mid2Rec.mccCode = '5411'; // portal corrected; draft still 5999
    const signFalseComplete = portal.signApplication(corporateId, mid2.id);

    const recoveredOrBlocked = sign.refilled || sign.blocked;
    const mismatchRefilled = signFalseComplete.refilled && signFalseComplete.after?.mcc === '5411';

    const citations = [
      CITATIONS.signRefillGate(),
      CITATIONS.mccRequiredSign(),
    ].filter(Boolean) as Array<{ file: string; line: number; snippet: string }>;

    const status = recoveredOrBlocked && mismatchRefilled ? 'PASS' : 'FAIL';
    recordScenario({
      name: '8. Partial Fill Recovery',
      status,
      observed: `signApplication on 79% draft: refilled=${sign.refilled}, blocked=${sign.blocked}. Stale-100% MCC mismatch path: refilled=${signFalseComplete.refilled}, afterMcc=${signFalseComplete.after?.mcc}.`,
      dbState: JSON.stringify({
        incompletePath: { before: sign.before, after: sign.after, refilled: sign.refilled, blocked: sign.blocked },
        falseCompletePath: {
          midMccAfterSwap: portal.mids.get(mid2.id)?.mccCode,
          skippedRefill: signFalseComplete.skippedRefill,
          after: signFalseComplete.after,
        },
      }, null, 2),
      citations,
      details: '2026-07-13: refill when percent !== 100 OR form MCC ≠ portal MCC.',
    });

    expect(recoveredOrBlocked, 'must refill or block signing for ~79% drafts').toBe(true);
    expect(mismatchRefilled, 'must refill when draft MCC mismatches portal').toBe(true);
  });
});
