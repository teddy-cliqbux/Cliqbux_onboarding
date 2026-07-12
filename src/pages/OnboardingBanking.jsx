import { useState, useEffect } from 'react';
import {
  ArrowRight, ArrowLeft, Loader2, Store, Landmark, CheckCircle2,
  MapPin, Building2, CreditCard, Banknote, Check, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

const inputCls = 'w-full bg-[#10151C] border border-white/12 rounded-xl px-3.5 py-2.5 text-sm text-white placeholder:text-gray-500 transition-colors hover:border-white/20 focus:outline-none focus:ring-2 focus:ring-amber-500/70 focus:border-transparent';
const labelCls = 'block text-[11px] font-semibold text-gray-400 uppercase tracking-wider mb-1.5';

function formatEIN(raw) {
  const d = (raw || '').replace(/\D/g, '');
  return d.length >= 9 ? `${d.slice(0, 2)}-${d.slice(2, 9)}` : raw || '';
}

// ─── Banking Panel ────────────────────────────────────────────────────────────

function BankingPanel({ location, corporateId, entityId, plaidAccounts, onAccountsConnected, bankDetails, reuseDetails, onBankSaved }) {
  const entityAccounts = plaidAccounts[entityId] || [];

  const [mode, setMode] = useState(() => {
    if (bankDetails?.authMethod === 'Manual') return 'manual';
    if (entityAccounts.length > 0 || bankDetails?.authMethod === 'Plaid') return 'plaid';
    return 'connect';
  });
  const [selectedId, setSelectedId] = useState(entityAccounts[0]?.accountId || '');
  const [routing, setRouting] = useState(bankDetails?.authMethod === 'Manual' ? (bankDetails?.routingNumber || '') : '');
  const [account, setAccount] = useState(bankDetails?.authMethod === 'Manual' ? (bankDetails?.accountNumber || '') : '');
  const [accountType, setAccountType] = useState(bankDetails?.authMethod === 'Manual' ? (bankDetails?.accountType || '') : '');
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(!!(bankDetails?.routingNumber));
  const [connecting, setConnecting] = useState(false);
  const [plaidError, setPlaidError] = useState('');

  useEffect(() => {
    if (entityAccounts.length > 0 && mode === 'connect') setMode('plaid');
  }, [entityAccounts.length]);

  const saveBank = async (details) => {
    setSaving(true);
    try {
      await invokePortalFunction('saveLocationBankDetails', { locations: [{ id: location.id, bankDetails: details }] });
      setSaved(true);
      onBankSaved(location.id, details, entityId);
    } catch (err) {
      // Never log bank field values — message only
      console.error('[BankingPanel.saveBank] failed to save bank details:', err?.message || 'Unknown error');
    }
    finally { setSaving(false); }
  };

  const handlePlaidConnect = async () => {
    setConnecting(true); setPlaidError('');
    try {
      const tokenRes = await invokePortalFunction('createPlaidLinkToken', { corporateId });
      const linkToken = tokenRes.data?.link_token;
      if (!linkToken || !window.Plaid) { setPlaidError('Bank connection unavailable.'); setConnecting(false); return; }
      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            const res = await invokePortalFunction('exchangePlaidToken', { publicToken, accountId: metadata.account_id });
            const accounts = res.data?.accounts || [];
            onAccountsConnected(entityId, accounts);
            if (accounts[0]) {
              setSelectedId(accounts[0].accountId);
              setMode('plaid');
              await saveBank({ routingNumber: accounts[0].routingNumber, accountNumber: accounts[0].accountNumber, authMethod: 'Plaid', accountNumberMasked: `••••${accounts[0].mask || ''}`, accountType: accounts[0].subtype || null });
            }
          } catch (err) {
            // Never log bank field values — message only
            console.error('[BankingPanel.handlePlaidConnect] exchange failed:', err?.message || 'Unknown error');
            setPlaidError('Failed to retrieve account from Plaid.');
          }
          finally { setConnecting(false); }
        },
        onExit: () => setConnecting(false),
      });
      handler.open();
    } catch (err) {
      console.error('[BankingPanel.handlePlaidConnect] link token request failed:', err?.message || 'Unknown error');
      setPlaidError('Connection failed.');
      setConnecting(false);
    }
  };

  const handlePlaidSelect = async (accountId) => {
    setSelectedId(accountId);
    const acct = entityAccounts.find(a => a.accountId === accountId);
    if (!acct) return;
    await saveBank({ routingNumber: acct.routingNumber, accountNumber: acct.accountNumber, authMethod: 'Plaid', accountNumberMasked: `••••${acct.mask || ''}`, accountType: acct.subtype || null });
  };

  // Saved state — show summary styled as a mini bank card
  if (saved) {
    const displayAccount = bankDetails?.accountNumberMasked || '••••';
    return (
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ duration: 0.25, ease: [0.22, 1, 0.36, 1] }}
        className="relative overflow-hidden flex items-center justify-between rounded-2xl border border-green-500/25 bg-gradient-to-br from-green-500/[0.12] via-white/[0.02] to-transparent px-4 py-3.5"
      >
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-green-500/15 border border-green-500/25 flex items-center justify-center flex-shrink-0">
            <Landmark className="w-4 h-4 text-green-400" />
          </div>
          <div>
            <p className="text-xs font-bold text-green-300 flex items-center gap-1.5">
              <CheckCircle2 className="w-3.5 h-3.5" />
              {bankDetails?.authMethod === 'Plaid' ? 'Bank Linked via Plaid' : 'Manual Bank Entry'}
            </p>
            <p className="text-[11px] text-green-400/70 font-mono mt-0.5">{displayAccount} · Routing ••••{bankDetails?.routingNumber?.slice(-4)}</p>
          </div>
        </div>
        <button onClick={() => { setSaved(false); setMode('connect'); }} className="text-[10px] font-semibold text-gray-400 hover:text-white border border-white/10 hover:border-white/25 rounded-lg px-2.5 py-1.5 transition-colors">Change</button>
      </motion.div>
    );
  }

  const canReuse = reuseDetails?.routingNumber && !bankDetails?.routingNumber;

  return (
    <div className="space-y-3">
      {/* Reuse banner */}
      {canReuse && (
        <div className="flex items-center justify-between bg-blue-500/10 border border-blue-500/20 rounded-xl px-3.5 py-2.5">
          <div className="flex items-center gap-2">
            <Banknote className="w-3.5 h-3.5 text-blue-400 flex-shrink-0" />
            <div>
              <p className="text-xs font-semibold text-blue-300">Another location in this entity uses this account</p>
              <p className="text-[11px] text-blue-400/70 font-mono">{reuseDetails.accountNumberMasked} · Routing ••••{reuseDetails.routingNumber?.slice(-4)}</p>
            </div>
          </div>
          <button onClick={() => saveBank(reuseDetails)} disabled={saving}
            className="text-xs font-bold text-blue-300 border border-blue-500/30 rounded-lg px-2.5 py-1.5 hover:bg-blue-500/15 transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Use Same'}
          </button>
        </div>
      )}

      {/* Mode toggle — segmented control */}
      <div className="flex gap-1 bg-white/[0.04] border border-white/10 rounded-xl p-1">
        <button onClick={() => setMode('connect')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-all ${mode === 'connect' || mode === 'plaid' ? 'bg-amber-500/15 border-amber-500/35 text-amber-300 shadow-sm' : 'border-transparent text-gray-400 hover:text-white'}`}>
          <Landmark className="w-3.5 h-3.5" /> Plaid (Instant)
        </button>
        <button onClick={() => setMode('manual')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-lg text-xs font-semibold border transition-all ${mode === 'manual' ? 'bg-white/10 border-white/15 text-white shadow-sm' : 'border-transparent text-gray-400 hover:text-white'}`}>
          <Banknote className="w-3.5 h-3.5" /> Manual Entry
        </button>
      </div>

      {(mode === 'connect' || mode === 'plaid') && (
        <div className="space-y-2">
          {entityAccounts.length > 0 ? (
            <select value={selectedId} onChange={e => handlePlaidSelect(e.target.value)} className={inputCls} style={{ colorScheme: 'dark' }}>
              <option value="">Select account…</option>
              {entityAccounts.map(a => <option key={a.accountId} value={a.accountId}>{a.name} — ••••{a.mask || (a.accountNumber || '').slice(-4)}</option>)}
            </select>
          ) : (
            <button onClick={handlePlaidConnect} disabled={connecting}
              className="w-full flex items-center justify-center gap-2 border border-dashed border-amber-500/40 hover:border-amber-400 hover:bg-amber-500/10 rounded-xl py-3 text-sm font-semibold text-amber-400 transition-all disabled:opacity-50">
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />}
              {connecting ? 'Connecting…' : 'Link Bank Account via Plaid'}
            </button>
          )}
          {plaidError && <p className="text-[11px] text-red-400">{plaidError}</p>}
        </div>
      )}

      {mode === 'manual' && (
        <div className="space-y-2">
          <div className="grid grid-cols-2 gap-2">
            <div>
              <label className={labelCls}>Routing # (9 digits)</label>
              <input type="text" value={routing} maxLength={9}
                onChange={e => setRouting(e.target.value.replace(/\D/g, '').slice(0, 9))}
                placeholder="021000021" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Account #</label>
              <input type="text" value={account} maxLength={17}
                onChange={e => setAccount(e.target.value.replace(/\D/g, '').slice(0, 17))}
                placeholder="000123456789" className={inputCls} />
            </div>
            <div>
              <label className={labelCls}>Account Type</label>
              <select value={accountType} onChange={e => setAccountType(e.target.value)}
                className={inputCls} style={{ colorScheme: 'dark' }}>
                <option value="">Select…</option>
                <option value="checking">Checking</option>
                <option value="savings">Savings</option>
              </select>
            </div>
          </div>
          <button onClick={() => saveBank({ routingNumber: routing, accountNumber: account, authMethod: 'Manual', accountNumberMasked: `••••${account.slice(-4)}`, accountType })}
            disabled={saving || routing.length !== 9 || account.length < 4 || !accountType}
            className="w-full flex items-center justify-center gap-2 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 text-[#0E1319] font-bold text-sm py-2.5 rounded-xl transition-all shadow-lg shadow-amber-950/20">
            {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Check className="w-4 h-4" />}
            {saving ? 'Saving…' : 'Save Bank Details'}
          </button>
        </div>
      )}
    </div>
  );
}

// ─── Location Banking Row ─────────────────────────────────────────────────────

function LocationBankingRow({ location, corporateId, merchantIDs, bankDetails, reuseDetails, plaidAccounts, onAccountsConnected, onBankSaved, isExpanded, onToggleExpand }) {
  const locMids = merchantIDs.filter(c => c.locationId === location.id);
  const hasBanking = !!(bankDetails?.routingNumber);

  return (
    <div className={`rounded-2xl border transition-all ${isExpanded ? 'border-amber-500/30 bg-[#1A212C]' : hasBanking ? 'border-green-500/20 bg-[#1A212C]' : 'border-white/10 bg-[#1A212C] hover:border-white/20'}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer" onClick={onToggleExpand}>
        <div className={`w-9 h-9 rounded-xl flex items-center justify-center flex-shrink-0 ${hasBanking ? 'bg-green-500/15' : 'bg-amber-500/10'}`}>
          {hasBanking ? <CheckCircle2 className="w-4.5 h-4.5 text-green-400" /> : <Store className="w-4.5 h-4.5 text-amber-400" />}
        </div>
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white truncate">{location.dbaName}</p>
          <p className="text-[11px] text-gray-400 truncate flex items-center gap-1">
            <MapPin className="w-3 h-3 flex-shrink-0" />{location.businessAddress}
          </p>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {locMids.length > 0 && (
            <span className="text-[10px] text-gray-500 bg-white/5 rounded-full px-2 py-0.5">
              {locMids.length} MID{locMids.length !== 1 ? 's' : ''}
            </span>
          )}
          {hasBanking ? (
            <span className="text-[10px] font-bold text-green-400 bg-green-500/10 border border-green-500/20 rounded-full px-2 py-0.5">
              {bankDetails.authMethod === 'Plaid' ? '✓ Plaid' : '✓ Manual'}
            </span>
          ) : (
            <span className="text-[10px] font-bold text-amber-400 bg-amber-500/10 border border-amber-500/20 rounded-full px-2 py-0.5">
              Needs Bank
            </span>
          )}
          <ChevronDown className={`w-4 h-4 text-gray-400 transition-transform duration-300 ${isExpanded ? 'rotate-180' : ''}`} />
        </div>
      </div>

      {/* Expanded banking panel — smooth height animation */}
      <AnimatePresence initial={false}>
        {isExpanded && (
          <motion.div
            key="panel"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-white/5 px-5 py-5">
              {/* MIDs reference */}
              {locMids.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-1.5">
                  {locMids.map(m => (
                    <span key={m.id} className="flex items-center gap-1 text-[10px] text-blue-400/70 bg-blue-500/10 border border-blue-500/15 rounded-full px-2 py-0.5">
                      <CreditCard className="w-2.5 h-2.5" /> {m.merchantName || m.dbaName} {m.mccCode && `· ${m.mccCode}`}
                    </span>
                  ))}
                </div>
              )}
              <BankingPanel
                location={location}
                corporateId={corporateId}
                entityId={location.entityId}
                plaidAccounts={plaidAccounts}
                onAccountsConnected={onAccountsConnected}
                bankDetails={bankDetails}
                reuseDetails={reuseDetails}
                onBankSaved={onBankSaved}
              />
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function OnboardingBanking({ profile, onContinue, onBack }) {
  const [entities, setEntities] = useState([]);
  const [locations, setLocations] = useState([]);
  const [merchantIDs, setMerchantIDs] = useState([]);
  const [bankDetailsByLoc, setBankDetailsByLoc] = useState({});
  const [manualBankByEntity, setManualBankByEntity] = useState({});
  const [plaidAccounts, setPlaidAccounts] = useState({});
  const [loading, setLoading] = useState(true);
  const [expandedLocId, setExpandedLocId] = useState(null);

  useEffect(() => { loadAll(); }, []);

  const loadAll = async () => {
    setLoading(true);
    try {
      // Use getMerchantData (single call) instead of manageLegalEntity + listLocations + manageMerchantID
      // to avoid hitting rate limits on the banking step mount.
      const res = await invokePortalFunction('getMerchantData', { corporateId: profile.corporateId });
      const data = res.data;

      // Always use entities from the fresh getMerchantData call to avoid stale prop data
      const loadedEntities = (data?.profile?.legalEntities || profile.legalEntities || []);

      const rawLocations = data?.locations || [];
      const loadedLocations = rawLocations.map(l => ({
        id: l.id || l.locationId, entityId: l.entityId || '',
        dbaName: l.dbaName, businessAddress: l.businessAddress,
        applicationStepStatus: l.applicationStepStatus || 'In Review',
      }));

      // Build bankDetails map
      const bdMap = {};
      rawLocations.forEach(l => {
        const id = l.id || l.locationId;
        if (l.bankDetails?.routingNumber) bdMap[id] = l.bankDetails;
        else if (l.routingNumber) bdMap[id] = { routingNumber: l.routingNumber, accountNumber: l.accountNumber, authMethod: 'Manual', accountNumberMasked: `••••${(l.accountNumber || '').slice(-4)}` };
      });

      // Build manual-bank-by-entity for reuse
      const manualByEntity = {};
      rawLocations.forEach(l => {
        const bd = l.bankDetails?.routingNumber ? l.bankDetails : (l.routingNumber ? { routingNumber: l.routingNumber, accountNumber: l.accountNumber, authMethod: 'Manual', accountNumberMasked: `••••${(l.accountNumber || '').slice(-4)}` } : null);
        if (bd?.authMethod === 'Manual' && l.entityId) manualByEntity[l.entityId] = bd;
      });

      setEntities(loadedEntities);
      setLocations(loadedLocations);
      setMerchantIDs(data?.merchantMIDs || []);
      setBankDetailsByLoc(bdMap);
      setManualBankByEntity(manualByEntity);

      // Auto-expand first location needing banking
      const needsBank = loadedLocations.find(l => !bdMap[l.id]?.routingNumber);
      if (needsBank) setExpandedLocId(needsBank.id);
    } catch (err) {
      console.error('[OnboardingBanking] loadAll failed:', err?.message || 'Unknown error');
    } finally { setLoading(false); }
  };

  const handleBankSaved = (locId, details, entityId) => {
    setBankDetailsByLoc(prev => ({ ...prev, [locId]: details }));
    if (details?.authMethod === 'Manual' && entityId) {
      setManualBankByEntity(prev => ({ ...prev, [entityId]: details }));
    }
    // Auto-advance to next location needing banking
    const nextNeedy = locations.find(l => l.id !== locId && !bankDetailsByLoc[l.id]?.routingNumber);
    if (nextNeedy) setTimeout(() => setExpandedLocId(nextNeedy.id), 400);
  };

  const handleAccountsConnected = (entityId, accounts) => {
    setPlaidAccounts(prev => ({ ...prev, [entityId]: accounts }));
  };

  const bankingComplete = locations.length > 0 && locations.every(l => bankDetailsByLoc[l.id]?.routingNumber);
  const bankingCount = Object.values(bankDetailsByLoc).filter(b => b?.routingNumber).length;

  // Group locations by entity for display
  const grouped = {};
  locations.forEach(l => {
    const key = l.entityId || 'unassigned';
    if (!grouped[key]) grouped[key] = [];
    grouped[key].push(l);
  });

  if (loading) return (
    <div className="px-8 py-8 space-y-4" aria-busy="true" aria-label="Loading banking setup">
      <div className="skeleton h-6 w-40" />
      <div className="skeleton h-9 w-2/3" />
      <div className="skeleton h-4 w-1/2" />
      <div className="skeleton h-16 w-full !rounded-2xl" />
      <div className="skeleton h-16 w-full !rounded-2xl" />
      <div className="skeleton h-14 w-full !rounded-xl" />
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-white/10">
        <div className="inline-flex items-center gap-2 bg-amber-500/10 border border-amber-500/25 text-amber-300 text-[11px] font-bold tracking-wider px-3 py-1.5 rounded-full mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse" />
          STEP 3 OF 4 — BANKING
        </div>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-2xl font-semibold tracking-tight text-white mb-1.5">Link Bank Accounts</h2>
            <p className="text-gray-400 text-sm">Connect a bank account to each location. Locations under the same legal entity can share an account.</p>
          </div>
          <button onClick={onBack}
            className="flex-shrink-0 flex items-center gap-2 text-sm font-medium text-gray-300 border border-white/15 hover:border-white/30 hover:bg-white/5 px-4 py-2 rounded-xl transition-all">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
      </div>

      {/* Progress bar */}
      <div className="px-8 py-4 border-b border-white/5">
        <div className="flex items-center justify-between mb-2">
          <p className="text-xs font-semibold text-gray-400">{bankingCount} of {locations.length} locations linked</p>
          {bankingComplete && <span className="text-xs font-bold text-green-400 flex items-center gap-1"><CheckCircle2 className="w-3.5 h-3.5" /> All done</span>}
        </div>
        <div className="w-full bg-white/10 rounded-full h-1.5 overflow-hidden">
          <motion.div
            className="bg-gradient-to-r from-amber-600 to-amber-400 h-1.5 rounded-full"
            initial={false}
            animate={{ width: `${locations.length > 0 ? (bankingCount / locations.length) * 100 : 0}%` }}
            transition={{ type: 'spring', stiffness: 90, damping: 20 }}
          />
        </div>
      </div>

      {/* Location rows, grouped by entity (or flat if no entities loaded) */}
      <div className="px-8 py-6 space-y-6">
        {entities.length > 0 ? entities.map(entity => {
          const entityLocs = grouped[entity.entityId] || [];
          if (entityLocs.length === 0) return null;
          return (
            <div key={entity.entityId}>
              {entities.length > 1 && (
                <div className="flex items-center gap-2 mb-3 px-1">
                  <Building2 className="w-3.5 h-3.5 text-amber-400/60" />
                  <span className="text-[11px] font-bold text-amber-300/80 uppercase tracking-wider">{entity.legalBusinessName}</span>
                  {entity.federalEIN && <span className="text-[10px] text-gray-600 font-mono">{formatEIN(entity.federalEIN)}</span>}
                  <span className="text-[10px] text-gray-600 ml-1">· locations in this entity can share an account</span>
                </div>
              )}
              <div className="space-y-2">
                {entityLocs.map(loc => (
                  <LocationBankingRow
                    key={loc.id}
                    location={loc}
                    corporateId={profile.corporateId}
                    merchantIDs={merchantIDs}
                    bankDetails={bankDetailsByLoc[loc.id] || null}
                    reuseDetails={manualBankByEntity[loc.entityId] || null}
                    plaidAccounts={plaidAccounts}
                    onAccountsConnected={handleAccountsConnected}
                    onBankSaved={handleBankSaved}
                    isExpanded={expandedLocId === loc.id}
                    onToggleExpand={() => setExpandedLocId(prev => prev === loc.id ? null : loc.id)}
                  />
                ))}
              </div>
            </div>
          );
        }) : (
          /* Fallback: render all locations flat when entities failed to load */
          <div className="space-y-2">
            {locations.map(loc => (
              <LocationBankingRow
                key={loc.id}
                location={loc}
                corporateId={profile.corporateId}
                merchantIDs={merchantIDs}
                bankDetails={bankDetailsByLoc[loc.id] || null}
                reuseDetails={null}
                plaidAccounts={plaidAccounts}
                onAccountsConnected={handleAccountsConnected}
                onBankSaved={handleBankSaved}
                isExpanded={expandedLocId === loc.id}
                onToggleExpand={() => setExpandedLocId(prev => prev === loc.id ? null : loc.id)}
              />
            ))}
          </div>
        )}

        {/* Unassigned */}
        {(grouped['unassigned'] || []).length > 0 && (
          <div className="space-y-2">
            {(grouped['unassigned'] || []).map(loc => (
              <LocationBankingRow key={loc.id} location={loc} corporateId={profile.corporateId} merchantIDs={merchantIDs}
                bankDetails={bankDetailsByLoc[loc.id] || null} reuseDetails={null}
                plaidAccounts={plaidAccounts} onAccountsConnected={handleAccountsConnected}
                onBankSaved={handleBankSaved}
                isExpanded={expandedLocId === loc.id}
                onToggleExpand={() => setExpandedLocId(prev => prev === loc.id ? null : loc.id)} />
            ))}
          </div>
        )}
      </div>

      {/* Footer */}
      <div className="px-8 pt-2 pb-8 border-t border-white/10 space-y-3">
        <button onClick={() => onContinue({ locations, legalEntities: entities })}
          disabled={!bankingComplete}
          className="group w-full flex items-center justify-center gap-3 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 disabled:from-gray-700 disabled:to-gray-700 disabled:text-gray-500 disabled:shadow-none text-[#0E1319] font-bold py-4 px-6 rounded-xl text-base transition-all shadow-lg shadow-amber-950/30">
          Continue to Signing <ArrowRight className="w-5 h-5 transition-transform group-hover:translate-x-1" />
        </button>
        {!bankingComplete && (
          <p className="text-center text-xs text-amber-600/80">
            {locations.length - bankingCount} location{locations.length - bankingCount !== 1 ? 's' : ''} still need{locations.length - bankingCount === 1 ? 's' : ''} a bank account.
          </p>
        )}
      </div>
    </div>
  );
}