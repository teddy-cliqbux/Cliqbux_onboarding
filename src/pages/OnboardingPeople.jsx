import { useState } from 'react';
import { ArrowLeft, ArrowRight, Users, Loader2 } from 'lucide-react';
import SignerRoster from '@/components/onboarding/SignerRoster';
import KycActivityStrip from '@/components/onboarding/KycActivityStrip';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';
import {
  isControlPerson,
  effectiveControlPersons,
  isRosterConfiguredForPeopleStep,
  isPortalAdmin,
} from '@/lib/signerRules';

/**
 * People & KYC — first application step after Welcome.
 * Configure Control Person + Beneficial Owners, send remote invites, continue
 * to Locations while KYC completes in parallel. Does NOT stage BoldSign.
 */
export default function OnboardingPeople({ profile, onContinue, onBack }) {
  const [signers, setSigners] = useState([]);
  const [configured, setConfigured] = useState(false);
  const [cpChoice, setCpChoice] = useState('me'); // me | other
  const [switching, setSwitching] = useState(false);
  const [switchError, setSwitchError] = useState('');
  const [rosterKey, setRosterKey] = useState(0);

  const reloadRoster = async () => {
    if (!profile?.corporateId) return;
    try {
      const res = await invokePortalFunction('manageSigner', {
        action: 'list',
        corporateId: profile.corporateId,
      });
      if (res.data?.signers) setSigners(res.data.signers);
      setRosterKey((k) => k + 1);
    } catch { /* non-fatal */ }
  };

  const controls = effectiveControlPersons(signers);
  const control = controls[0] || null;
  const profileEmail = (profile?.signerEmail || '').toLowerCase().trim();
  const iAmControl = !!(
    control
    && profileEmail
    && (control.signerEmail || '').toLowerCase().trim() === profileEmail
  );

  // Keep radio in sync once roster loads
  const effectiveChoice = signers.length === 0
    ? cpChoice
    : (iAmControl ? 'me' : 'other');

  const handleConfiguredChange = (ok) => {
    setConfigured(!!ok);
  };

  const setMeAsControl = async () => {
    setSwitchError('');
    setCpChoice('me');
    if (!profile?.corporateId || !profileEmail) return;
    const me = signers.find(
      (s) => (s.signerEmail || '').toLowerCase().trim() === profileEmail
    );
    if (!me) return;
    if (isControlPerson(me) && controls.length === 1) return;
    setSwitching(true);
    try {
      await invokePortalFunction('manageSigner', {
        action: 'update',
        corporateId: profile.corporateId,
        signerId: me.id,
        signerData: {
          isAuthorizedSigner: true,
          isPrimarySigner: true,
          isPortalAdmin: false,
          isBeneficialOwner: me.isBeneficialOwner !== false,
        },
      });
      await reloadRoster();
    } catch (err) {
      setSwitchError(err.message || 'Could not set you as Control Person.');
    } finally {
      setSwitching(false);
    }
  };

  const setSomeoneElse = () => {
    setCpChoice('other');
    setSwitchError('');
  };

  const designateOtherAsControl = async (signerId) => {
    if (!signerId || !profile?.corporateId) return;
    setSwitching(true);
    setSwitchError('');
    try {
      const res = await invokePortalFunction('manageSigner', {
        action: 'update',
        corporateId: profile.corporateId,
        signerId,
        signerData: {
          isAuthorizedSigner: true,
          isPrimarySigner: true,
          isPortalAdmin: false,
        },
      });
      let list = res.data?.signers;
      if (!list && res.data?.signer) {
        list = signers.map((s) => {
          if (s.id === signerId) return { ...s, ...res.data.signer };
          if (isControlPerson(s) && s.id !== signerId) {
            return { ...s, isAuthorizedSigner: false, isPrimarySigner: false };
          }
          return s;
        });
      }
      // Demote profile contact to portal admin helper if they are not the new CP
      const me = (list || signers).find(
        (s) => (s.signerEmail || '').toLowerCase().trim() === profileEmail
      );
      if (me && me.id !== signerId && !isPortalAdmin(me)) {
        const pct = Number(me.ownershipPercentage) || 0;
        await invokePortalFunction('manageSigner', {
          action: 'update',
          corporateId: profile.corporateId,
          signerId: me.id,
          signerData: {
            isAuthorizedSigner: false,
            isPrimarySigner: false,
            isPortalAdmin: pct < 25 && pct === 0,
            isBeneficialOwner: pct >= 25,
          },
        });
      }
      await reloadRoster();
      setCpChoice('other');
    } catch (err) {
      setSwitchError(err.message || 'Could not change Control Person.');
    } finally {
      setSwitching(false);
    }
  };

  const canContinue = configured || isRosterConfiguredForPeopleStep(signers);
  const otherCandidates = signers.filter(
    (s) => !isPortalAdmin(s) && (s.signerEmail || '').toLowerCase().trim() !== profileEmail
  );

  return (
    <div className="flex flex-col">
      <div className="px-8 pt-10 pb-8 border-b border-cb-border">
        <p className="text-cb-caption uppercase text-gray-500 mb-2">Step 1 of 4 — People &amp; KYC</p>
        <div className="flex items-start justify-between gap-4">
          <div>
            <h2 className="font-display text-cb-display text-white mb-2">Who&apos;s on this application?</h2>
            <p className="text-cb-body-lg text-gray-400 max-w-xl">
              Tell us who will sign and who owns the business. Invite anyone who isn&apos;t here — they can finish identity checks while you set up locations and banking.
            </p>
          </div>
          <button
            type="button"
            onClick={onBack}
            className="flex-shrink-0 flex items-center gap-2 text-cb-body text-gray-300 border border-cb-border hover:border-cb-border-strong hover:text-white px-4 py-2 rounded-cb transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            Back
          </button>
        </div>
      </div>

      <div className="px-8 py-8 flex flex-col gap-6">
        {/* Control Person explainer + default */}
        <div className="border border-cb-border rounded-cb bg-cb-surface-raised overflow-hidden">
          <div className="px-5 py-4 border-b border-cb-border flex items-start gap-3">
            <Users className="w-4 h-4 text-cb-accent mt-0.5 flex-shrink-0" />
            <div>
              <p className="text-cb-body font-semibold text-white">Control Person</p>
              <p className="text-cb-body text-gray-400 mt-1 max-w-2xl">
                The Control Person is the one person authorized to <span className="text-gray-200">sign</span> the merchant processing agreement and legally bind the business.
                Beneficial Owners (anyone with 25% or more ownership) only confirm their identity for compliance — they do not sign unless they are also the Control Person.
              </p>
            </div>
          </div>
          <div className="px-5 py-4 flex flex-col gap-3">
            <label className={`flex items-start gap-3 cursor-pointer rounded-cb border px-4 py-3 transition-colors ${
              effectiveChoice === 'me' ? 'border-cb-accent/50 bg-cb-accent-muted/20' : 'border-cb-border hover:border-cb-border-strong'
            }`}>
              <input
                type="radio"
                name="cpChoice"
                className="mt-1"
                checked={effectiveChoice === 'me'}
                onChange={() => setMeAsControl()}
                disabled={switching}
              />
              <span>
                <span className="text-cb-body font-medium text-white block">I am the Control Person</span>
                <span className="text-cb-caption normal-case tracking-normal text-gray-500">
                  Default — you&apos;ll sign the agreement after everyone finishes KYC. Most applicants choose this.
                </span>
              </span>
            </label>
            <label className={`flex items-start gap-3 cursor-pointer rounded-cb border px-4 py-3 transition-colors ${
              effectiveChoice === 'other' ? 'border-cb-accent/50 bg-cb-accent-muted/20' : 'border-cb-border hover:border-cb-border-strong'
            }`}>
              <input
                type="radio"
                name="cpChoice"
                className="mt-1"
                checked={effectiveChoice === 'other'}
                onChange={() => setSomeoneElse()}
                disabled={switching}
              />
              <span>
                <span className="text-cb-body font-medium text-white block">Someone else will sign</span>
                <span className="text-cb-caption normal-case tracking-normal text-gray-500">
                  You&apos;re filling the form for them. Add or select that person below and send a Verify &amp; Sign invite.
                </span>
              </span>
            </label>

            {effectiveChoice === 'other' && otherCandidates.length > 0 && (
              <div className="ml-7 flex flex-col gap-2">
                <p className="text-cb-caption normal-case tracking-normal text-gray-500">Designate Control Person:</p>
                {otherCandidates.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    disabled={switching}
                    onClick={() => designateOtherAsControl(s.id)}
                    className={`text-left text-cb-body px-3 py-2 rounded-cb border transition-colors ${
                      isControlPerson(s)
                        ? 'border-cb-accent/50 bg-cb-accent-muted/30 text-cb-accent'
                        : 'border-cb-border text-gray-300 hover:border-cb-border-strong'
                    }`}
                  >
                    {s.firstName} {s.lastName} · {s.signerEmail}
                    {isControlPerson(s) ? ' — Control Person' : ''}
                  </button>
                ))}
              </div>
            )}
            {effectiveChoice === 'other' && otherCandidates.length === 0 && (
              <p className="ml-7 text-cb-body text-gray-500">
                Add the person who will sign using &quot;Add Another Owner&quot; below, then select them here.
              </p>
            )}
            {switching && (
              <p className="flex items-center gap-2 text-cb-caption text-gray-500">
                <Loader2 className="w-3.5 h-3.5 animate-spin" /> Updating…
              </p>
            )}
            {switchError && (
              <p className="text-cb-body text-cb-danger">{switchError}</p>
            )}
          </div>
        </div>

        <KycActivityStrip signers={signers} />

        <SignerRoster
          key={rosterKey}
          profile={profile}
          mode="people"
          onConfiguredChange={handleConfiguredChange}
          onSignersChange={setSigners}
        />

        <div className="flex flex-col gap-2 pt-2">
          {!canContinue && (
            <p className="text-cb-body text-gray-500 text-center">
              Designate exactly one Control Person to continue. You can invite Beneficial Owners and finish their KYC later.
            </p>
          )}
          <button
            type="button"
            disabled={!canContinue}
            onClick={() => onContinue({ signers })}
            className="w-full flex items-center justify-center gap-2 text-cb-body-lg font-semibold text-cb-bg bg-cb-accent hover:opacity-90 disabled:bg-cb-surface-raised disabled:border disabled:border-cb-border disabled:text-gray-500 py-3.5 rounded-cb transition-opacity"
          >
            Continue to Locations
            <ArrowRight className="w-4 h-4" />
          </button>
          <p className="text-center text-cb-body text-gray-500">
            Remote KYC can finish while you set up storefronts and banking
          </p>
        </div>
      </div>
    </div>
  );
}
