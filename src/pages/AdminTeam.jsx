import { useEffect, useState } from 'react';
import { Loader2, Mail, UserPlus, Users } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { useAuth } from '@/lib/AuthContext';

const inputCls =
  'w-full bg-cb-bg border border-cb-border rounded-cb px-3.5 py-2.5 text-cb-body text-white placeholder:text-gray-500 focus:outline-none focus:ring-2 focus:ring-cb-accent';

/**
 * Invite Cliqbux staff as app Admins (live app only — not Base44 editor).
 * Uses base44.auth.inviteUser(email, 'admin').
 */
export default function AdminTeam() {
  const { user } = useAuth();
  const [email, setEmail] = useState('');
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [users, setUsers] = useState([]);
  const [listError, setListError] = useState('');
  const [listLoading, setListLoading] = useState(true);

  const loadUsers = async () => {
    setListLoading(true);
    setListError('');
    try {
      // Users entity is often collaborator-only; soft-fail to invite-only UI.
      const rows = await base44.entities.User.list('-created_date', 100);
      setUsers(Array.isArray(rows) ? rows : []);
    } catch (err) {
      console.warn('[AdminTeam] User.list unavailable', err);
      setUsers([]);
      setListError(
        'User list is only available to app owners/collaborators in Base44. You can still send invites below; manage roles in Dashboard → Users if needed.',
      );
    } finally {
      setListLoading(false);
    }
  };

  useEffect(() => {
    loadUsers();
  }, []);

  const handleInvite = async (e) => {
    e.preventDefault();
    const trimmed = email.trim().toLowerCase();
    if (!trimmed) return;
    setSending(true);
    setError('');
    setMessage('');
    try {
      await base44.auth.inviteUser(trimmed, 'admin');
      setMessage(
        `Invite sent to ${trimmed}. They get Applications and Merchant Center only — not the app builder.`,
      );
      setEmail('');
      await loadUsers();
    } catch (err) {
      console.error('[AdminTeam] inviteUser failed', err);
      setError(err?.message || 'Invite failed. Try Dashboard → Users → Invite User as Admin.');
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="max-w-2xl space-y-6">
      <p className="text-cb-caption text-cb-accent mb-1">Admin</p>
      <h1 className="font-display text-cb-display text-white">Team</h1>
      <p className="text-cb-body-lg text-gray-400 mt-2 max-w-xl">
        Invite Cliqbux staff to the live app as Admins. This does not give Base44
        editor access — never use Add collaborator for sales or ops.
      </p>

      <form
        onSubmit={handleInvite}
        className="mt-8 bg-cb-surface border border-cb-border rounded-cb p-5 space-y-4"
      >
        <div className="flex items-center gap-2 text-cb-caption text-gray-400">
          <UserPlus className="w-4 h-4 text-cb-accent" />
          <span>Invite staff (Admin role)</span>
        </div>
        <div>
          <label htmlFor="team-email" className="block text-cb-caption text-gray-500 mb-1.5">
            Email
          </label>
          <div className="relative">
            <Mail className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
            <input
              id="team-email"
              type="email"
              autoComplete="email"
              required
              className={`${inputCls} pl-10`}
              placeholder="name@cliqbux.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </div>
        </div>
        <p className="text-cb-caption text-gray-500">
          Signed in as {user?.email || '—'}. Role is fixed to Admin for staff tools.
        </p>
        {error && (
          <p className="text-cb-caption text-cb-danger border-l-2 border-cb-danger pl-3">{error}</p>
        )}
        {message && (
          <p className="text-cb-caption text-cb-success border-l-2 border-cb-success pl-3">{message}</p>
        )}
        <button
          type="submit"
          disabled={sending || !email.trim()}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-cb bg-cb-accent text-cb-bg text-cb-caption font-semibold disabled:opacity-50"
        >
          {sending ? <Loader2 className="w-4 h-4 animate-spin" /> : <UserPlus className="w-4 h-4" />}
          Send invite
        </button>
      </form>

      <div className="mt-8">
        <div className="flex items-center gap-2 mb-3">
          <Users className="w-4 h-4 text-gray-500" />
          <h2 className="font-display text-cb-title text-white">App users</h2>
        </div>
        {listLoading && (
          <div className="flex items-center gap-2 text-cb-caption text-gray-500">
            <Loader2 className="w-4 h-4 animate-spin" />
            Loading…
          </div>
        )}
        {!listLoading && listError && (
          <p className="text-cb-caption text-gray-500 border border-cb-border rounded-cb p-4 bg-cb-surface">
            {listError}
          </p>
        )}
        {!listLoading && !listError && users.length === 0 && (
          <p className="text-cb-caption text-gray-500">No users returned yet.</p>
        )}
        {!listLoading && users.length > 0 && (
          <ul className="space-y-2">
            {users.map((u) => (
              <li
                key={u.id || u.email}
                className="flex flex-wrap items-center justify-between gap-2 bg-cb-surface-raised border border-cb-border rounded-cb px-4 py-3"
              >
                <div>
                  <p className="text-cb-body text-white">{u.full_name || u.email}</p>
                  {u.full_name && (
                    <p className="text-cb-caption text-gray-500">{u.email}</p>
                  )}
                </div>
                <span className="text-cb-caption text-gray-400 border border-cb-border rounded-cb px-2 py-0.5">
                  {u.role || 'user'}
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
