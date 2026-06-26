import { useState, useEffect, useCallback } from 'react';
import { Landmark, Loader2, CheckCircle, ChevronDown } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function PlaidLinkButton({ corporateId, onAccountsLinked, onAllAccountsLinked }) {
  const [linkToken, setLinkToken] = useState(null);
  const [loading, setLoading] = useState(false);
  const [linked, setLinked] = useState(false);
  const [accounts, setAccounts] = useState([]);
  const [selectedAccount, setSelectedAccount] = useState(null);
  const [error, setError] = useState('');

  // Fetch link token on mount
  useEffect(() => {
    const fetchLinkToken = async () => {
      try {
        const res = await base44.functions.invoke('createPlaidLinkToken', { corporateId });
        setLinkToken(res.data?.link_token || null);
      } catch (e) {
        setError('Could not initialize bank connection.');
      }
    };
    fetchLinkToken();
  }, [corporateId]);

  const openPlaidLink = useCallback(() => {
    if (!linkToken || !window.Plaid) {
      setError('Plaid is not available. Please enter banking details manually.');
      return;
    }

    setLoading(true);
    setError('');

    const handler = window.Plaid.create({
      token: linkToken,
      onSuccess: async (publicToken, metadata) => {
        try {
          const res = await base44.functions.invoke('exchangePlaidToken', {
            publicToken,
            accountId: metadata.account_id
          });
          const fetchedAccounts = res.data?.accounts || [];
          setAccounts(fetchedAccounts);
          setLinked(true);

          // Notify parent with all accounts for per-location dropdowns
          if (onAccountsLinked) onAccountsLinked(fetchedAccounts);

          // Auto-select first depository checking account
          const checking = fetchedAccounts.find(a => a.subtype === 'checking') || fetchedAccounts[0];
          if (checking) {
            setSelectedAccount(checking);
          }
        } catch (e) {
          setError('Failed to retrieve account details from Plaid.');
        } finally {
          setLoading(false);
        }
      },
      onExit: (err) => {
        setLoading(false);
        if (err) setError('Bank connection cancelled or failed.');
      }
    });

    handler.open();
  }, [linkToken, onAccountsLinked]);

  const handleAccountSelect = (e) => {
    const acct = accounts.find(a => a.accountId === e.target.value);
    if (acct) setSelectedAccount(acct);
  };

  if (linked && accounts.length > 0) {
    return (
      <div className="rounded-xl border border-green-200 bg-green-50 p-5">
        <div className="flex items-center gap-3 mb-4">
          <div className="w-9 h-9 rounded-full bg-green-100 flex items-center justify-center">
            <CheckCircle className="w-5 h-5 text-green-600" />
          </div>
          <div>
            <p className="font-semibold text-green-800 text-sm">Bank Connected via Plaid</p>
            <p className="text-green-600 text-xs">Select which account to use for all locations</p>
          </div>
        </div>

        {accounts.length > 1 && (
          <div className="relative">
            <select
              value={selectedAccount?.accountId || ''}
              onChange={handleAccountSelect}
              className="w-full border border-green-200 rounded-lg px-4 py-2.5 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-green-400 appearance-none pr-10"
            >
              {accounts.map(acct => (
                <option key={acct.accountId} value={acct.accountId}>
                  {acct.name} ({acct.subtype}) ••••{acct.mask}
                </option>
              ))}
            </select>
            <ChevronDown className="w-4 h-4 text-gray-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
          </div>
        )}

        {selectedAccount && (
          <div className="mt-3 grid grid-cols-2 gap-3">
            <div className="bg-white rounded-lg px-3 py-2 border border-green-100">
              <p className="text-xs text-gray-400 mb-0.5">Routing Number</p>
              <p className="font-mono font-semibold text-gray-800 text-sm">{selectedAccount.routingNumber}</p>
            </div>
            <div className="bg-white rounded-lg px-3 py-2 border border-green-100">
              <p className="text-xs text-gray-400 mb-0.5">Account Number</p>
              <p className="font-mono font-semibold text-gray-800 text-sm">••••{selectedAccount.mask}</p>
            </div>
          </div>
        )}

        <button
          onClick={() => { setLinked(false); setAccounts([]); setSelectedAccount(null); }}
          className="mt-3 text-xs text-green-700 hover:underline"
        >
          Connect a different account
        </button>
      </div>
    );
  }

  return (
    <div>
      <button
        onClick={openPlaidLink}
        disabled={!linkToken || loading}
        className="w-full flex items-center justify-center gap-3 border-2 border-dashed border-gray-300 hover:border-blue-400 hover:bg-blue-50 rounded-xl py-5 px-6 text-sm font-semibold text-gray-600 hover:text-blue-700 transition-all disabled:opacity-50 disabled:cursor-not-allowed"
      >
        {loading ? (
          <><Loader2 className="w-5 h-5 animate-spin" /> Connecting...</>
        ) : (
          <><Landmark className="w-5 h-5" /> Connect Bank Account via Plaid</>
        )}
      </button>

      {error && (
        <p className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-lg px-3 py-2 mt-2">
          {error} You can still enter routing and account numbers manually below.
        </p>
      )}
    </div>
  );
}