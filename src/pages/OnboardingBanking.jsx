import { useState, useEffect } from 'react';
import {
  ArrowRight, ArrowLeft, Loader2, Landmark,
  CreditCard, Banknote, Check, ChevronDown
} from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

const inputCls = 'w-full bg-cb-bg border border-cb-border rounded-cb px-3 py-2.5 text-cb-body text-white placeholder:text-gray-500 transition-colors hover:border-cb-border-strong focus:outline-none focus:ring-2 focus:ring-cb-accent focus:border-transparent';
const labelCls = 'block text-cb-caption uppercase text-gray-500 mb-1.5';

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
  const [justSaved, setJustSaved] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [plaidError, setPlaidError] = useState('');

  useEffect(() => {
    if (entityAccounts.length > 0 && mode === 'connect') setMode('plaid');
  }, [entityAccounts.length]);

  const saveBank = async (details) => {
    setSaving(true);
    try {
      await invokePortalFunction('saveLocationBankDetails', { locations: [{ id: location.id, bankDetails: details }] });
      setJustSaved(true);
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

  // Saved state — quiet summary row; spring check only when the merchant just linked
  if (saved) {
    const displayAccount = bankDetails?.accountNumberMasked || '••••';
    return (
      <motion.div
        className="flex items-center justify-between rounded-cb border border-cb-border bg-cb-bg px-4 py-3.5"
        initial={justSaved ? { opacity: 0.6, scale: 0.98 } : false}
        animate={{ opacity: 1, scale: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 24 }}
      >
        <div className="flex items-center gap-3">
          <motion.span
            className="flex items-center justify-center w-7 h-7 rounded-full bg-cb-success/15 flex-shrink-0"
            initial={justSaved ? { scale: 0 } : false}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 420, damping: 16 }}
          >
            <Check className="w-3.5 h-3.5 text-cb-success" strokeWidth={3} />
          </motion.span>
          <div>
            <p className="text-cb-body font-medium text-white">
              {justSaved
                ? 'Bank connected'
                : (bankDetails?.authMethod === 'Plaid' ? 'Bank Linked via Plaid' : 'Manual Bank Entry')}
            </p>
            <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 font-mono mt-0.5">{displayAccount} · Routing ••••{bankDetails?.routingNumber?.slice(-4)}</p>
          </div>
        </div>
        <button onClick={() => { setSaved(false); setJustSaved(false); setMode('connect'); }} className="text-cb-caption normal-case tracking-normal text-gray-400 hover:text-white border border-cb-border hover:border-cb-border-strong rounded-cb px-2.5 py-1.5 transition-colors">Change</button>
      </motion.div>
    );
  }

  const canReuse = reuseDetails?.routingNumber && !bankDetails?.routingNumber;

  return (
    <div className="space-y-3">
      {/* Reuse banner */}
      {canReuse && (
        <div className="flex items-center justify-between bg-cb-bg border border-cb-border rounded-cb px-4 py-2.5">
          <div className="flex items-center gap-2.5">
            <Banknote className="w-3.5 h-3.5 text-gray-500 flex-shrink-0" />
            <div>
              <p className="text-cb-body font-medium text-white">Another location in this entity uses this account</p>
              <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 font-mono">{reuseDetails.accountNumberMasked} · Routing ••••{reuseDetails.routingNumber?.slice(-4)}</p>
            </div>
          </div>
          <button onClick={() => saveBank(reuseDetails)} disabled={saving}
            className="text-cb-body font-medium text-gray-200 border border-cb-border-strong rounded-cb px-3 py-1.5 hover:text-white transition-colors disabled:opacity-50">
            {saving ? <Loader2 className="w-3 h-3 animate-spin" /> : 'Use Same'}
          </button>
        </div>
      )}

      {/* Mode toggle — segmented control */}
      <div className="flex gap-1 bg-cb-bg border border-cb-border rounded-cb p-1">
        <button onClick={() => setMode('connect')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-cb text-cb-body font-medium transition-colors ${mode === 'connect' || mode === 'plaid' ? 'bg-cb-accent-muted text-cb-accent' : 'text-gray-400 hover:text-white'}`}>
          <Landmark className="w-3.5 h-3.5" /> Plaid (Instant)
        </button>
        <button onClick={() => setMode('manual')}
          className={`flex-1 flex items-center justify-center gap-2 py-2 rounded-cb text-cb-body font-medium transition-colors ${mode === 'manual' ? 'bg-cb-surface text-white' : 'text-gray-400 hover:text-white'}`}>
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
              className="w-full flex items-center justify-center gap-2 bg-cb-accent hover:opacity-90 rounded-cb py-3 text-cb-body font-semibold text-cb-bg transition-all disabled:opacity-50">
              {connecting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Landmark className="w-4 h-4" />}
              {connecting ? 'Connecting…' : 'Link Bank Account via Plaid'}
            </button>
          )}
          {plaidError && <p className="text-cb-caption normal-case tracking-normal font-normal text-cb-danger">{plaidError}</p>}
        </div>
      )}

      {mode === 'manual' && (
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
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
            className="w-full flex items-center justify-center gap-2 bg-cb-accent hover:opacity-90 disabled:bg-cb-surface disabled:text-gray-600 text-cb-bg font-semibold text-cb-body py-2.5 rounded-cb transition-all">
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
    <div className={`rounded-cb border transition-colors ${isExpanded ? 'border-cb-border-strong bg-cb-surface-raised' : 'border-cb-border bg-cb-surface-raised hover:border-cb-border-strong'}`}>
      {/* Header */}
      <div className="flex items-center gap-3 px-5 py-4 cursor-pointer" onClick={onToggleExpand}>
        <div className="flex-1 min-w-0">
          <p className="text-cb-body font-semibold text-white truncate">{location.dbaName}</p>
          <p className="text-cb-body text-gray-500 truncate">{location.businessAddress}</p>
        </div>
        <div className="flex items-center gap-3 flex-shrink-0">
          {locMids.length > 0 && (
            <span className="text-cb-caption text-gray-500">
              {locMids.length} MID{locMids.length !== 1 ? 's' : ''}
            </span>
          )}
          {hasBanking ? (
            <span className="inline-flex items-center gap-1.5 text-cb-caption text-gray-400 whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-cb-success flex-shrink-0" />
              {bankDetails.authMethod === 'Plaid' ? 'Plaid' : 'Manual'}
            </span>
          ) : (
            <span className="inline-flex items-center gap-1.5 text-cb-caption text-cb-accent whitespace-nowrap">
              <span className="w-1.5 h-1.5 rounded-full bg-cb-accent flex-shrink-0" />
              Needs bank
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
            <div className="border-t border-cb-border px-5 py-5">
              {/* MIDs reference */}
              {locMids.length > 0 && (
                <div className="mb-4 flex flex-wrap gap-x-4 gap-y-1.5">
                  {locMids.map(m => (
                    <span key={m.id} className="inline-flex items-center gap-1.5 text-cb-caption normal-case tracking-normal font-normal text-gray-500">
                      <CreditCard className="w-3 h-3 flex-shrink-0" /> {m.merchantName || m.dbaName}{m.mccCode && ` · ${m.mccCode}`}
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
      <div className="skeleton h-16 w-full !rounded-cb" />
      <div className="skeleton h-16 w-full !rounded-cb" />
      <div className="skeleton h-14 w-full !rounded-cb" />
    </div>
  );

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-8 pt-10 pb-8 border-b border-cb-border">
        <p className="text-cb-caption uppercase text-gray-500 mb-2">Step 3 of 4 — Banking</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-cb-display text-white mb-2">Link Bank Accounts</h2>
            <p className="text-cb-body-lg text-gray-400 max-w-xl">Connect a bank account to each location. Locations under the same legal entity can share an account.</p>
          </div>
          <button onClick={onBack}
            className="flex-shrink-0 flex items-center gap-2 text-cb-body text-gray-300 border border-cb-border hover:border-cb-border-strong hover:text-white px-4 py-2 rounded-cb transition-colors">
            <ArrowLeft className="w-4 h-4" /> Back
          </button>
        </div>
      </div>

      {/* Progress */}
      <div className="px-8 py-4 border-b border-cb-border">
        <div className="flex items-center justify-between mb-2">
          <p className="text-cb-body text-gray-400"><span className="text-white font-semibold">{bankingCount} of {locations.length}</span> locations linked</p>
          {bankingComplete && <span className="text-cb-caption normal-case tracking-normal text-cb-success flex items-center gap-1.5"><Check className="w-3.5 h-3.5" /> All done</span>}
        </div>
        <div className="w-full bg-cb-border rounded-full h-1 overflow-hidden">
          <div
            className="bg-cb-accent h-1 rounded-full transition-[width] duration-500 ease-out"
            style={{ width: `${locations.length > 0 ? (bankingCount / locations.length) * 100 : 0}%` }}
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
                <div className="flex items-baseline gap-2.5 mb-3 px-1 flex-wrap">
                  <span className="font-display text-cb-title text-white">{entity.legalBusinessName}</span>
                  {entity.federalEIN && <span className="text-cb-caption text-gray-500 font-mono normal-case tracking-normal">EIN {formatEIN(entity.federalEIN)}</span>}
                  <span className="text-cb-caption normal-case tracking-normal font-normal text-gray-600">· locations here can share an account</span>
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
      <div className="px-8 pt-6 pb-10 border-t border-cb-border space-y-4">
        <button onClick={() => onContinue({ locations, legalEntities: entities })}
          disabled={!bankingComplete}
          className="w-full flex items-center justify-center gap-3 bg-cb-accent hover:opacity-90 disabled:bg-cb-surface-raised disabled:border disabled:border-cb-border disabled:text-gray-500 text-cb-bg font-semibold py-4 px-6 rounded-cb text-cb-body-lg transition-colors">
          Continue to Signing <ArrowRight className="w-5 h-5" />
        </button>
        {!bankingComplete && (
          <p className="text-center text-cb-body text-gray-500">
            {locations.length - bankingCount} location{locations.length - bankingCount !== 1 ? 's' : ''} still need{locations.length - bankingCount === 1 ? 's' : ''} a bank account.
          </p>
        )}
      </div>
    </div>
  );
}