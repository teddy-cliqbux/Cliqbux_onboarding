import { useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Link2, Cloud, UserPlus, Lock, ChevronDown } from 'lucide-react';
import PosOAuthGrid from '@/components/onboarding/legacyPos/PosOAuthGrid';
import PosAccessAccountGuide from '@/components/onboarding/legacyPos/PosAccessAccountGuide';
import PosCredentialVault from '@/components/onboarding/legacyPos/PosCredentialVault';

const SPRING = { type: 'spring', stiffness: 150, damping: 20 };

const OPTIONS = [
  {
    id: 'oauth',
    title: 'Express Cloud Sync',
    badge: null,
    subtitle: 'OAuth connect with your POS cloud (coming soon per provider)',
    icon: Cloud,
    body: (corporateId) => <PosOAuthGrid corporateId={corporateId} />,
  },
  {
    id: 'access_account',
    title: 'Create an Access Account',
    badge: 'Recommended',
    subtitle: 'Invite accounts@cliqbux.com as Admin — no password sharing',
    icon: UserPlus,
    body: (corporateId) => <PosAccessAccountGuide corporateId={corporateId} />,
  },
  {
    id: 'credential_vault',
    title: 'Secured Credential Vault',
    badge: 'Fallback',
    subtitle: 'Encrypted password upload with legal waiver — use only if A/B are unavailable',
    icon: Lock,
    body: (corporateId) => <PosCredentialVault corporateId={corporateId} />,
  },
];

export default function ConnectLegacyPOS({ corporateId }) {
  const [expanded, setExpanded] = useState('access_account');

  const toggle = (id) => {
    setExpanded((prev) => (prev === id ? null : id));
  };

  return (
    <div className="bg-cb-surface-raised border border-cb-border rounded-cb p-5">
      <div className="flex items-center gap-2.5 mb-0.5">
        <Link2 className="w-4 h-4 text-gray-400" />
        <h3 className="text-cb-body font-semibold text-white">Connect Legacy POS Network</h3>
      </div>
      <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mb-4">
        Bridge your existing Point-of-Sale platform so Cliqbux can migrate menus, items, and locations securely.
      </p>

      <div className="flex flex-col gap-2.5">
        {OPTIONS.map((opt) => {
          const Icon = opt.icon;
          const isOpen = expanded === opt.id;
          return (
            <div
              key={opt.id}
              className={`rounded-cb border transition-colors ${
                isOpen ? 'border-cb-accent/40 bg-cb-bg' : 'border-cb-border bg-cb-bg/60'
              }`}
            >
              <button
                type="button"
                onClick={() => toggle(opt.id)}
                aria-expanded={isOpen}
                className="w-full flex items-start gap-3 px-3.5 py-3 text-left"
              >
                <span
                  className={`mt-0.5 flex items-center justify-center w-8 h-8 rounded-cb border flex-shrink-0 ${
                    isOpen
                      ? 'border-cb-accent/40 bg-cb-accent-muted text-cb-accent'
                      : 'border-cb-border text-gray-400'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </span>
                <span className="flex-1 min-w-0">
                  <span className="flex items-center gap-2 flex-wrap">
                    <span className="text-cb-body font-semibold text-white">{opt.title}</span>
                    {opt.badge && (
                      <span className="text-cb-caption normal-case tracking-normal font-medium text-cb-accent border border-cb-border px-2 py-0.5 rounded-full">
                        {opt.badge}
                      </span>
                    )}
                  </span>
                  <span className="block text-cb-caption normal-case tracking-normal text-gray-500 mt-0.5">
                    {opt.subtitle}
                  </span>
                </span>
                <ChevronDown
                  className={`w-4 h-4 text-gray-500 flex-shrink-0 mt-1 transition-transform ${
                    isOpen ? 'rotate-180' : ''
                  }`}
                />
              </button>

              <AnimatePresence initial={false}>
                {isOpen && (
                  <motion.div
                    key={`${opt.id}-panel`}
                    initial={{ height: 0, opacity: 0 }}
                    animate={{ height: 'auto', opacity: 1 }}
                    exit={{ height: 0, opacity: 0 }}
                    transition={SPRING}
                    className="overflow-hidden"
                  >
                    <div className="px-3.5 pb-3.5 pt-0 border-t border-cb-border/60">
                      <div className="pt-3">{opt.body(corporateId)}</div>
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>
          );
        })}
      </div>
    </div>
  );
}
