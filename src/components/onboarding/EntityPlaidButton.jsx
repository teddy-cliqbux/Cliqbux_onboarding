import { useState, useRef, useCallback } from 'react';
import { Landmark, Loader2 } from 'lucide-react';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

export default function EntityPlaidButton({ corporateId, entityId, onAccountsConnected }) {
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState('');
  const mountedRef = useRef(true);

  const connect = useCallback(async () => {
    setConnecting(true);
    setError('');
    try {
      const tokenRes = await invokePortalFunction('createPlaidLinkToken', { corporateId });
      const linkToken = tokenRes.data?.link_token;
      if (!linkToken) { setError('Could not initialize bank connection.'); setConnecting(false); return; }
      if (!window.Plaid) { setError('Plaid is not available. Please enter banking details manually.'); setConnecting(false); return; }

      let currentEntityId = entityId;
      const handler = window.Plaid.create({
        token: linkToken,
        onSuccess: async (publicToken, metadata) => {
          try {
            const res = await invokePortalFunction('exchangePlaidToken', {
              publicToken,
              accountId: metadata.account_id
            });
            const accounts = res.data?.accounts || [];
            if (mountedRef.current) {
              onAccountsConnected(currentEntityId, accounts);
            }
          } catch (_) {
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
    } catch (_) {
      if (mountedRef.current) { setError('Could not initialize bank connection.'); setConnecting(false); }
    }
  }, [corporateId, entityId, onAccountsConnected]);

  return (
    <button onClick={connect} disabled={connecting} className="flex items-center justify-center gap-1.5 border border-dashed border-amber-300 hover:border-amber-500 hover:bg-amber-50 rounded-lg py-2 px-4 text-xs font-semibold text-amber-700 hover:text-amber-800 transition-all disabled:opacity-50 disabled:cursor-not-allowed">
      {connecting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Landmark className="w-3.5 h-3.5" />}
      {connecting ? 'Connecting...' : 'Link Bank Account'}
    </button>
  );
}