import { useEffect, useState, useCallback, useRef } from 'react';
import { Loader2, Send } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

/**
 * Stage 3 go-live tools: logo, hours, installation date, installer chat.
 * Persists via manageLocationGoLive. Schema fields must be published on MerchantLocations.
 */
export default function LocationGoLivePanel({ corporateId, location, onUpdated }) {
  const [logoUrl, setLogoUrl] = useState(location?.logoUrl || '');
  const [hours, setHours] = useState(location?.businessHours || '');
  const [installDate, setInstallDate] = useState(
    (location?.installationDate || '').slice(0, 10)
  );
  const [messages, setMessages] = useState([]);
  const [chatDraft, setChatDraft] = useState('');
  const [saving, setSaving] = useState(false);
  const [chatBusy, setChatBusy] = useState(false);
  const [error, setError] = useState('');
  const [saved, setSaved] = useState(false);
  const fileRef = useRef(null);

  const locationId = location?.id;

  const loadChat = useCallback(async () => {
    if (!corporateId || !locationId) return;
    try {
      const res = await invokePortalFunction('manageLocationGoLive', {
        action: 'listMessages',
        corporateId,
        locationId,
      });
      if (!res.data?.error) setMessages(res.data?.messages || []);
    } catch {
      /* chat optional until entity published */
    }
  }, [corporateId, locationId]);

  useEffect(() => {
    setLogoUrl(location?.logoUrl || '');
    setHours(location?.businessHours || '');
    setInstallDate((location?.installationDate || '').slice(0, 10));
  }, [location]);

  useEffect(() => {
    loadChat();
  }, [loadChat]);

  const save = async () => {
    if (!corporateId || !locationId || saving) return;
    setSaving(true);
    setError('');
    setSaved(false);
    try {
      const res = await invokePortalFunction('manageLocationGoLive', {
        action: 'update',
        corporateId,
        locationId,
        logoUrl,
        businessHours: hours,
        installationDate: installDate,
      });
      if (res.data?.error) throw new Error(res.data.error);
      setSaved(true);
      onUpdated?.();
    } catch (err) {
      setError(err.message || 'Could not save. Schema may need republishing in Base44.');
    } finally {
      setSaving(false);
    }
  };

  const uploadLogo = async (file) => {
    if (!file) return;
    setError('');
    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      setLogoUrl(uploadRes.file_url);
    } catch (err) {
      setError(err.message || 'Logo upload failed.');
    }
  };

  const sendChat = async () => {
    if (!chatDraft.trim() || chatBusy) return;
    setChatBusy(true);
    setError('');
    try {
      const res = await invokePortalFunction('manageLocationGoLive', {
        action: 'sendMessage',
        corporateId,
        locationId,
        body: chatDraft.trim(),
      });
      if (res.data?.error) throw new Error(res.data.error);
      setChatDraft('');
      await loadChat();
    } catch (err) {
      setError(err.message || 'Could not send message.');
    } finally {
      setChatBusy(false);
    }
  };

  return (
    <section className="rounded-cb border border-cb-border bg-cb-surface-raised p-5 space-y-5">
      <div>
        <h2 className="font-display text-cb-title text-white">Go-live setup</h2>
        <p className="text-cb-caption normal-case tracking-normal text-gray-500 mt-1">
          Logo, hours, install date, and messages for your installer.
        </p>
      </div>

      {error && (
        <p className="text-cb-caption normal-case tracking-normal text-cb-danger" role="alert">{error}</p>
      )}
      {saved && (
        <p className="text-cb-caption normal-case tracking-normal text-cb-success">Saved.</p>
      )}

      <div className="space-y-2">
        <label className="text-cb-caption uppercase text-gray-500">Store logo</label>
        <div className="flex items-center gap-3">
          {logoUrl ? (
            <img src={logoUrl} alt="Store logo" className="w-14 h-14 rounded-cb object-cover border border-cb-border" />
          ) : (
            <div className="w-14 h-14 rounded-cb border border-dashed border-cb-border-strong bg-cb-bg" />
          )}
          <input
            ref={fileRef}
            type="file"
            accept="image/png,image/jpeg,image/webp"
            className="sr-only"
            onChange={(e) => {
              uploadLogo(e.target.files?.[0]);
              e.target.value = '';
            }}
          />
          <button
            type="button"
            onClick={() => fileRef.current?.click()}
            className="text-cb-caption normal-case tracking-normal font-medium text-cb-accent underline focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
          >
            Upload logo
          </button>
        </div>
      </div>

      <div className="space-y-2">
        <label htmlFor="biz-hours" className="text-cb-caption uppercase text-gray-500">Hours</label>
        <textarea
          id="biz-hours"
          value={hours}
          onChange={(e) => setHours(e.target.value)}
          rows={3}
          placeholder="Mon–Fri 9am–9pm&#10;Sat–Sun 10am–6pm"
          className="w-full rounded-cb border border-cb-border bg-cb-bg px-3 py-2 text-cb-body text-white placeholder:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cb-accent"
        />
      </div>

      <div className="space-y-2">
        <label htmlFor="install-date" className="text-cb-caption uppercase text-gray-500">
          Installation date
        </label>
        <input
          id="install-date"
          type="date"
          value={installDate}
          onChange={(e) => setInstallDate(e.target.value)}
          className="w-full sm:w-auto rounded-cb border border-cb-border bg-cb-bg px-3 py-2 text-cb-body text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-cb-accent"
        />
      </div>

      <button
        type="button"
        onClick={save}
        disabled={saving}
        className="rounded-cb bg-cb-accent text-cb-bg font-semibold text-cb-body px-4 py-2.5 hover:opacity-95 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
      >
        {saving ? 'Saving…' : 'Save go-live details'}
      </button>

      <div className="border-t border-cb-border pt-5 space-y-3">
        <h3 className="text-cb-body font-semibold text-white">Chat with installer</h3>
        <ul className="max-h-48 overflow-y-auto space-y-2 rounded-cb border border-cb-border bg-cb-bg p-3">
          {messages.length === 0 && (
            <li className="text-cb-caption normal-case tracking-normal text-gray-600">
              No messages yet. Ask about install timing or site access.
            </li>
          )}
          {messages.map((m) => (
            <li key={m.id} className="text-cb-caption normal-case tracking-normal">
              <span className="text-gray-500">{m.authorLabel || m.fromRole || 'You'}: </span>
              <span className="text-gray-300">{m.body}</span>
            </li>
          ))}
        </ul>
        <div className="flex gap-2">
          <input
            value={chatDraft}
            onChange={(e) => setChatDraft(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && sendChat()}
            placeholder="Message your installer…"
            className="flex-1 rounded-cb border border-cb-border bg-cb-bg px-3 py-2 text-cb-body text-white placeholder:text-gray-600 focus-visible:outline focus-visible:outline-2 focus-visible:outline-cb-accent"
          />
          <button
            type="button"
            onClick={sendChat}
            disabled={chatBusy || !chatDraft.trim()}
            className="rounded-cb bg-cb-accent-muted text-cb-accent px-3 py-2 disabled:opacity-40 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
            aria-label="Send message"
          >
            {chatBusy ? <Loader2 className="w-4 h-4 animate-spin" /> : <Send className="w-4 h-4" />}
          </button>
        </div>
      </div>
    </section>
  );
}
