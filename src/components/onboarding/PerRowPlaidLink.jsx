import { useState, useEffect, useCallback, useRef } from 'react';
import { Landmark, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function PerRowPlaidLink({ corporateId, locationId, onBankConnected }) {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [connecting, setConnecting] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    return () => { mountedRef.current = false; };
  }, []);

  const fetchLinkToken = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await base44.functions.invoke('createPlaidLinkToken', { corporateId });
      if (mountedRef.current) {
        setLinkToken(res.data?.link_token || null);
        if (!res.data?.link_token) setError('Could not initialize bank connection.');
      }
    } catch (e) {
      if (mountedRef.current) setError('Could not initialize bank connection.');
    } finally {
      if (mountedRef.current) setLoading(false);
    }
  }, [corporateId]);

  const openPlaid = useCallback(async () => {
    if (!linkToken) {
      await fetchLinkToken();
      return;
    }
    if (!window.Plaid) {
      setError('Plaid is not available. Please enter banking details manually.');
      return;
    }

    setConnecting(true);
    setError('');

    const handler = window.Plaid.create({
      token: linkToken,
      onSuccess: async (publicToken, metadata) => {
        try {
          const res = await base44.functions.invoke('exchangePlaidToken', {
            publicToken,
            accountId: metadata.account_id
          });
          const accounts = res.data?.accounts || [];
          const selected = accounts.find(a => a.accountId === metadata.account_id) || accounts[0];
          if (selected && mountedRef.current) {
            onBankConnected({
              routingNumber: selected.routingNumber || '',
              accountNumber: selected.accountNumber || '',
              accountNumberMasked: selected.mask ? `••••${selected.mask}` : '',
              accountType: selected.subtype || 'checking',
              authMethod: 'Plaid'
            });
          }
        } catch (e) {
          if (mountedRef.current) setError('Failed to retrieve account details from Plaid.');
        } finally {
          if (mountedRef.current) setConnecting(false);
        }
      },
      onExit: (err) => {
        if (mountedRef.current) setConnecting(false);
        if (err && mountedRef.current) setError('Bank connection cancelled or failed.');
      }
    });

    handler.open();
  }, [linkToken, corporateId, onBankConnected, fetchLinkToken]);

  return (
    <div className="flex flex-col gap-1.5 w-full">
      <button
        onClick={openPlaid}
        disabled={connecting}
        className="flex items-center justify-center gap-1.5 border border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 rounded-lg py-2 px-3 text-xs font-semibold text-gray-600 hover:text-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Landmark className="w-3.5 h-3.5" />}
        {connecting ? 'Connecting...' : 'Link Bank Account'}
      </button>
      {error && <p className="text-xs text-amber-700">{error}</p>}
    </div>
  );
}