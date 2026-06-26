import { useState } from 'react';
import { Loader2, CheckCircle2, AlertCircle } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function EINValidator({ corporateId, value, onChange, onValidated }) {
  const [status, setStatus] = useState(null); // null | 'loading' | 'valid' | 'invalid'
  const [message, setMessage] = useState('');

  const validate = async () => {
    const digits = (value || '').replace(/\D/g, '');
    if (digits.length !== 9) {
      setStatus('invalid');
      setMessage('EIN must be exactly 9 digits');
      return;
    }
    setStatus('loading');
    setMessage('');
    try {
      const res = await base44.functions.invoke('verifyEIN', { corporateId, federalEIN: digits });
      const d = res.data;
      if (d?.valid) {
        setStatus('valid');
        setMessage(d.message || 'Verified');
        onValidated(digits);  // pass raw 9 digits, not formatted (dashes break length checks)
      } else {
        setStatus('invalid');
        setMessage((d?.errors || []).join(', ') || 'Invalid EIN');
      }
    } catch {
      setStatus('invalid');
      setMessage('Could not verify EIN. Please try again.');
    }
  };

  return (
    <div className="flex items-stretch gap-2">
      <div className="relative flex-1">
        <input
          type="text"
          value={value}
          onChange={(e) => { onChange(e.target.value.replace(/\D/g, '').slice(0, 9)); setStatus(null); }}
          placeholder="00-0000000"
          maxLength={9}
          className={`w-full border rounded-lg px-3 py-2 text-sm font-mono focus:outline-none focus:ring-2 ${
            status === 'valid' ? 'border-green-300 bg-green-50 focus:ring-green-400' :
            status === 'invalid' ? 'border-red-300 bg-red-50 focus:ring-red-400' :
            'border-gray-200 bg-white focus:ring-blue-500'
          }`}
        />
        {status === 'valid' && <CheckCircle2 className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-green-500" />}
        {status === 'invalid' && <AlertCircle className="absolute right-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-red-500" />}
      </div>
      <button
        type="button"
        onClick={validate}
        disabled={!(value || '').replace(/\D/g, '').length === 9 || status === 'loading'}
        className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold whitespace-nowrap border border-gray-200 hover:bg-gray-50 disabled:opacity-50 disabled:cursor-not-allowed text-gray-700 transition-all"
      >
        {status === 'loading' ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : 'Verify'}
      </button>
    </div>
  );
}