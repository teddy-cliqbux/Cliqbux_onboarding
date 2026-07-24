import { NavLink, useNavigate } from 'react-router-dom';
import CliqbuxLogo from '@/components/onboarding/CliqbuxLogo';
import { signOut } from '@/lib/merchantCenterAuth';

function navLinkClass({ isActive }) {
  return `flex items-center gap-2 px-3 py-2 rounded-cb text-cb-body font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent ${
    isActive
      ? 'bg-cb-accent-muted text-cb-accent'
      : 'text-gray-400 hover:text-white'
  }`;
}

function ChecklistBadge({ count }) {
  if (!count || count <= 0) return null;
  return (
    <span className="ml-auto inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-full bg-cb-danger/20 text-cb-danger text-[10px] font-semibold">
      {count}
    </span>
  );
}

/**
 * Merchant Center chrome — POS-style sidebar + top bar.
 * Nav: Setup (optional) / Locations / Account. Uses cb-* tokens.
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
    ...(showDealLink && corporateId
      ? [{ to: dealHref, label: 'Setup', badge: openChecklistCount }]
      : []),
    { to: `/locations${dealQ}`, label: 'Locations' },
    { to: `/account${dealQ}`, label: 'Account' },
  ];

  const handleSignOut = () => {
    signOut();
    navigate('/');
  };

  return (
    <div className="portal-bg min-h-screen flex" style={{ fontFamily: 'Inter, sans-serif' }}>
      {/* Desktop sidebar */}
      <aside
        className="hidden md:flex w-56 flex-col border-r border-cb-border bg-cb-surface fixed inset-y-0 left-0 z-40"
        aria-label="Merchant Center navigation"
      >
        <div className="px-4 py-5 border-b border-cb-border">
          <CliqbuxLogo size="sm" />
        </div>
        <nav className="flex-1 px-3 py-4 flex flex-col gap-1" aria-label="Merchant Center">
          {navItems.map((item) => (
            <NavLink key={item.label} to={item.to} className={navLinkClass}>
              {item.label}
              {item.badge != null && <ChecklistBadge count={item.badge} />}
            </NavLink>
          ))}
        </nav>
        <div className="px-3 py-4 border-t border-cb-border">
          <button
            type="button"
            onClick={handleSignOut}
            className="w-full text-left px-3 py-2 rounded-cb text-cb-caption normal-case tracking-normal text-gray-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent"
          >
            Sign out
          </button>
        </div>
      </aside>

      {/* Main column */}
      <div className="flex-1 md:pl-56 min-h-screen flex flex-col">
        <header className="h-14 border-b border-cb-border bg-cb-surface/95 backdrop-blur px-4 flex items-center justify-between gap-4 sticky top-0 z-30">
          <div className="md:hidden shrink-0">
            <CliqbuxLogo size="sm" />
          </div>
          <div className="flex items-center gap-3 min-w-0 ml-auto">
            {(title || subtitle) && (
              <div className="text-right min-w-0">
                {subtitle && (
                  <p className="text-cb-caption uppercase text-gray-500 truncate">{subtitle}</p>
                )}
                {title && (
                  <p className="inline-flex items-center px-2.5 py-1 rounded-cb border border-cb-border bg-cb-surface-raised text-cb-caption normal-case tracking-normal text-gray-300 truncate max-w-[14rem]">
                    {title}
                  </p>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={handleSignOut}
              className="md:hidden shrink-0 text-cb-caption normal-case tracking-normal text-gray-500 hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-cb-accent rounded-cb px-2 py-1"
            >
              Sign out
            </button>
          </div>
        </header>

        <main className="flex-1 px-4 sm:px-6 py-6 pb-20 md:pb-6 w-full max-w-[1400px] mx-auto">
          {children}
        </main>
      </div>

      {/* Mobile bottom nav */}
      <nav
        className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t border-cb-border bg-cb-surface/95 backdrop-blur flex items-stretch"
        aria-label="Merchant Center mobile"
      >
        {navItems.map((item) => (
          <NavLink
            key={item.label}
            to={item.to}
            className={({ isActive }) =>
              `flex-1 flex flex-col items-center justify-center gap-0.5 py-2 text-cb-caption normal-case tracking-normal font-medium ${
                isActive ? 'bg-cb-accent-muted text-cb-accent' : 'text-gray-400'
              }`
            }
          >
            <span className="flex items-center gap-1">
              {item.label}
              {item.badge != null && item.badge > 0 && (
                <span className="inline-flex items-center justify-center min-w-[1.1rem] h-4 px-1 rounded-full bg-cb-danger/20 text-cb-danger text-[10px] font-semibold">
                  {item.badge}
                </span>
              )}
            </span>
          </NavLink>
        ))}
      </nav>
    </div>
  );
}
