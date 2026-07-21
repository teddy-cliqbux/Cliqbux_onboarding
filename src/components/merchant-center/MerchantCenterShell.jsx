import { NavLink, useNavigate } from 'react-router-dom';
import CliqbuxLogo from '@/components/onboarding/CliqbuxLogo';
import { signOut } from '@/lib/merchantCenterAuth';

/**
 * Merchant Center chrome — Locations / Account nav + optional deal-board context.
 * Uses cb-* tokens. Coming-soon routes still render real pages with empty states.
 */
export default function MerchantCenterShell({
  title,
  subtitle,
  corporateId,
  openChecklistCount = 0,
  children,
  showDealLink = false,
}) {
  const navigate = useNavigate();

  const dealQ = corporateId ? `?dealId=${encodeURIComponent(corporateId)}` : '';
  const dealHref = corporateId
    ? `/onboarding/dashboard?dealId=${encodeURIComponent(corporateId)}`
    : '/onboarding/dashboard';

  const navItems = [
    { to: `/locations${dealQ}`, label: 'Locations' },
    { to: `/account${dealQ}`, label: 'Account' },
  ];

  return (
    <div className="portal-bg min-h-screen" style={{ fontFamily: 'Inter, sans-serif' }}>
      <header className="fixed top-0 left-0 right-0 z-40 bg-cb-surface/95 backdrop-blur border-b border-cb-border">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 h-14 flex items-center justify-between gap-4">
          <div className="flex items-center gap-6 min-w-0">
            <CliqbuxLogo size="sm" />
            <nav className="hidden sm:flex items-center gap-1" aria-label="Merchant Center">
              {navItems.map((item) => (
                <NavLink
                  key={item.label}
                  to={item.to}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-cb text-cb-caption normal-case tracking-normal font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent ${
                      isActive
                        ? 'bg-cb-accent-muted text-cb-accent'
                        : 'text-gray-400 hover:text-white'
                    }`
                  }
                >
                  {item.label}
                </NavLink>
              ))}
              {showDealLink && corporateId && (
                <NavLink
                  to={dealHref}
                  className={({ isActive }) =>
                    `px-3 py-1.5 rounded-cb text-cb-caption normal-case tracking-normal font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent ${
                      isActive
                        ? 'bg-cb-accent-muted text-cb-accent'
                        : 'text-gray-400 hover:text-white'
                    }`
                  }
                >
                  Setup
                  {openChecklistCount > 0 && (
                    <span className="ml-1.5 inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-full bg-cb-danger/20 text-cb-danger text-[10px] font-semibold">
                      {openChecklistCount}
                    </span>
                  )}
                </NavLink>
              )}
            </nav>
          </div>
          <div className="flex items-center gap-3 min-w-0">
            {(title || subtitle) && (
              <div className="text-right min-w-0 hidden md:block">
                {subtitle && (
                  <p className="text-cb-caption uppercase text-gray-500 truncate">{subtitle}</p>
                )}
                {title && (
                  <p className="text-cb-caption normal-case tracking-normal text-gray-300 truncate max-w-[14rem]">
                    {title}
                  </p>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={() => {
                signOut();
                navigate('/');
              }}
              className="text-cb-caption normal-case tracking-normal text-gray-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent rounded-cb px-2 py-1"
            >
              Sign out
            </button>
          </div>
        </div>
        {/* Mobile nav */}
        <nav className="sm:hidden flex border-t border-cb-border px-2 py-1 gap-1 overflow-x-auto" aria-label="Merchant Center mobile">
          {navItems.map((item) => (
            <NavLink
              key={item.label}
              to={item.to}
              className={({ isActive }) =>
                `px-3 py-2 rounded-cb text-cb-caption normal-case tracking-normal font-medium whitespace-nowrap ${
                  isActive ? 'bg-cb-accent-muted text-cb-accent' : 'text-gray-400'
                }`
              }
            >
              {item.label}
            </NavLink>
          ))}
          {showDealLink && corporateId && (
            <NavLink
              to={dealHref}
              className={({ isActive }) =>
                `px-3 py-2 rounded-cb text-cb-caption normal-case tracking-normal font-medium whitespace-nowrap ${
                  isActive ? 'bg-cb-accent-muted text-cb-accent' : 'text-gray-400'
                }`
              }
            >
              Setup{openChecklistCount > 0 ? ` (${openChecklistCount})` : ''}
            </NavLink>
          )}
        </nav>
      </header>

      <main className="max-w-3xl mx-auto px-4 pt-24 sm:pt-20 pb-16">
        {children}
      </main>
    </div>
  );
}
