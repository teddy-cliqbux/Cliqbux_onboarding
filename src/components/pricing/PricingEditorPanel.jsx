import { useEffect, useState } from 'react';
import { Loader2, Check } from 'lucide-react';
import {
  PRICING_TEMPLATES,
  parseFeeNumber,
  findTemplateByTier,
} from '@/lib/pricingPresets';

const inputCls =
  'w-full bg-cb-bg border border-cb-border rounded-cb px-3 py-2 text-cb-body text-white placeholder:text-gray-500 hover:border-cb-border-strong focus:outline-none focus:ring-2 focus:ring-cb-accent focus:border-transparent';
const labelCls = 'block text-cb-caption uppercase text-gray-500 mb-1.5';

/**
 * Shared pricing controls for Admin StageEditor + Agent impersonation bubble.
 * Does not call the API itself when `onSave` is provided with external handling —
 * default: parent passes saveFn or we expect onSave(payload).
 */
export default function PricingEditorPanel({
  initialPricing,
  onSave,
  compact = false,
  saveLabel = 'Save Pricing',
}) {
  const [mode, setMode] = useState('template'); // template | custom
  const [templateId, setTemplateId] = useState('CUSTOM_INTERCHANGE_PLUS');
  const [markup, setMarkup] = useState('');
  const [perTx, setPerTx] = useState('');
  const [auth, setAuth] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [ok, setOk] = useState(false);

  useEffect(() => {
    if (!initialPricing) return;
    const tier = initialPricing.pricingTier;
    const fees = {
      customMarkupPercentage: initialPricing.customMarkupPercentage,
      customPerTxFee: initialPricing.customPerTxFee,
      customAuthPerCard: initialPricing.customAuthPerCard,
    };
    const matched = findTemplateByTier(tier, fees);
    const isCustom =
      initialPricing.pricingType === 'custom'
      || (tier === 'CUSTOM_FLAT_RATE' && !matched)
      || false;

    if (isCustom && tier !== 'SELF_SERVE_CASH_DISCOUNT') {
      setMode('custom');
      setTemplateId(tier === 'CUSTOM_FLAT_RATE' ? 'FLAT_RATE_2_5' : 'CUSTOM_INTERCHANGE_PLUS');
    } else {
      setMode('template');
      // Legacy STANDARD / unset: default the dropdown to Cash Discount so agents
      // don't accidentally "save" Interchange Plus without fees (2026-07-14).
      setTemplateId(matched?.id || 'SELF_SERVE_CASH_DISCOUNT');
    }
    setMarkup(
      initialPricing.customMarkupPercentage != null && Number.isFinite(Number(initialPricing.customMarkupPercentage))
        ? String(initialPricing.customMarkupPercentage)
        : ''
    );
    setPerTx(
      initialPricing.customPerTxFee != null && Number.isFinite(Number(initialPricing.customPerTxFee))
        ? String(initialPricing.customPerTxFee)
        : ''
    );
    setAuth(
      initialPricing.customAuthPerCard != null && Number.isFinite(Number(initialPricing.customAuthPerCard))
        ? String(initialPricing.customAuthPerCard)
        : ''
    );
  }, [initialPricing]);

  const selected = PRICING_TEMPLATES.find(t => t.id === templateId) || PRICING_TEMPLATES[0];
  const showFeeInputs =
    mode === 'custom'
    || (mode === 'template' && selected.requiresFees);

  const buildPayload = () => {
    if (mode === 'template') {
      const t = selected;
      const payload = {
        pricingType: 'template',
        pricingTier: t.pricingTier,
      };
      if (t.customMarkupPercentage != null) payload.customMarkupPercentage = t.customMarkupPercentage;
      if (t.customPerTxFee != null) payload.customPerTxFee = t.customPerTxFee;
      if (t.customAuthPerCard != null) payload.customAuthPerCard = t.customAuthPerCard;
      if (t.requiresFees) {
        const m = parseFeeNumber(markup);
        const p = parseFeeNumber(perTx);
        const a = parseFeeNumber(auth);
        if (m != null) payload.customMarkupPercentage = m;
        if (p != null) payload.customPerTxFee = p;
        if (a != null) payload.customAuthPerCard = a;
      }
      return payload;
    }
    // Custom overrides — default tier ICPLS unless agent picked Flat Rate template then flipped to custom
    const tier =
      selected.pricingTier === 'CUSTOM_FLAT_RATE'
        ? 'CUSTOM_FLAT_RATE'
        : 'CUSTOM_INTERCHANGE_PLUS';
    return {
      pricingType: 'custom',
      pricingTier: tier,
      customMarkupPercentage: parseFeeNumber(markup),
      customPerTxFee: parseFeeNumber(perTx),
      customAuthPerCard: parseFeeNumber(auth),
    };
  };

  const handleSave = async () => {
    setSaving(true);
    setError('');
    setOk(false);
    try {
      const payload = buildPayload();
      if (payload.pricingTier !== 'SELF_SERVE_CASH_DISCOUNT') {
        if (
          payload.customMarkupPercentage == null
          || payload.customPerTxFee == null
          || payload.customAuthPerCard == null
        ) {
          throw new Error('Enter markup %, per-transaction fee, and auth fee.');
        }
      }
      await onSave?.(payload);
      setOk(true);
      setTimeout(() => setOk(false), 2000);
    } catch (err) {
      setError(err?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={compact ? 'space-y-3' : 'space-y-4'}>
      {/* Mode toggle */}
      <div className="flex rounded-cb border border-cb-border overflow-hidden">
        {[
          { key: 'template', label: 'Use Template' },
          { key: 'custom', label: 'Custom Fee Overrides' },
        ].map(opt => (
          <button
            key={opt.key}
            type="button"
            onClick={() => setMode(opt.key)}
            className={`flex-1 px-3 py-2 text-cb-caption font-semibold transition-colors ${
              mode === opt.key
                ? 'bg-cb-accent text-cb-bg'
                : 'bg-cb-surface-raised text-gray-400 hover:text-white'
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>

      {mode === 'template' && (
        <div>
          <label className={labelCls}>Pricing template</label>
          <select
            value={templateId}
            onChange={e => {
              const id = e.target.value;
              setTemplateId(id);
              const t = PRICING_TEMPLATES.find(x => x.id === id);
              if (t?.customMarkupPercentage != null) setMarkup(String(t.customMarkupPercentage));
              if (t?.customPerTxFee != null) setPerTx(String(t.customPerTxFee));
              if (t?.customAuthPerCard != null) setAuth(String(t.customAuthPerCard));
            }}
            className={inputCls}
          >
            {PRICING_TEMPLATES.map(t => (
              <option key={t.id} value={t.id}>{t.label}</option>
            ))}
          </select>
        </div>
      )}

      {mode === 'custom' && (
        <div>
          <label className={labelCls}>Pricing method</label>
          <select
            value={selected.pricingTier === 'CUSTOM_FLAT_RATE' ? 'FLAT_RATE_2_5' : 'CUSTOM_INTERCHANGE_PLUS'}
            onChange={e => setTemplateId(e.target.value)}
            className={inputCls}
          >
            <option value="CUSTOM_INTERCHANGE_PLUS">Interchange Plus</option>
            <option value="FLAT_RATE_2_5">Flat Rate</option>
          </select>
        </div>
      )}

      {showFeeInputs && (
        <div className={`grid gap-3 ${compact ? 'grid-cols-1' : 'grid-cols-1 sm:grid-cols-3'}`}>
          <div>
            <label className={labelCls}>Markup %</label>
            <div className="relative">
              <input
                type="number"
                step="0.01"
                min="0"
                value={markup}
                onChange={e => setMarkup(e.target.value)}
                placeholder="0.15"
                className={`${inputCls} pr-8`}
              />
              <span className="absolute right-3 top-1/2 -translate-y-1/2 text-cb-caption text-gray-500">%</span>
            </div>
            <p className="text-cb-caption text-gray-600 mt-1">e.g. 0.15 for 0.15%</p>
          </div>
          <div>
            <label className={labelCls}>Per-transaction fee</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cb-caption text-gray-500">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={perTx}
                onChange={e => setPerTx(e.target.value)}
                placeholder="0.10"
                className={`${inputCls} pl-7`}
              />
            </div>
          </div>
          <div>
            <label className={labelCls}>Auth fee / card</label>
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-cb-caption text-gray-500">$</span>
              <input
                type="number"
                step="0.01"
                min="0"
                value={auth}
                onChange={e => setAuth(e.target.value)}
                placeholder="0.10"
                className={`${inputCls} pl-7`}
              />
            </div>
          </div>
        </div>
      )}

      {selected.pricingTier === 'SELF_SERVE_CASH_DISCOUNT' && mode === 'template' && (
        <p className="text-cb-caption text-gray-500">
          Cash Discount uses Cliqbux&apos;s fixed fee schedule — monthly/service fees stay on the MSPWare template.
        </p>
      )}

      {initialPricing?.pricingTier
        && ['STANDARD', 'TRADITIONAL', 'PREMIUM'].includes(String(initialPricing.pricingTier).toUpperCase())
        && (
        <p className="text-cb-caption text-cb-accent">
          This merchant still has legacy pricing &quot;{initialPricing.pricingTier}&quot;. Choose a template (or custom fees) and Save before signing will work.
        </p>
      )}

      {error && <p className="text-cb-caption text-cb-danger">{error}</p>}

      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="w-full flex items-center justify-center gap-2 bg-cb-accent hover:opacity-90 disabled:bg-gray-700 disabled:text-gray-500 text-cb-bg font-semibold text-cb-body py-2.5 rounded-cb transition-opacity"
      >
        {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : ok ? <Check className="w-4 h-4" /> : null}
        {saving ? 'Saving…' : ok ? 'Saved' : saveLabel}
      </button>
    </div>
  );
}
