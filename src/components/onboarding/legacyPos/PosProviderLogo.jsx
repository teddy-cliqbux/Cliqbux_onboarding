/**
 * Brand marks for Legacy POS OAuth grid.
 * Simplified official-style marks for dark UI (white / brand-color fills).
 * Trademark owned by respective companies — used for provider identification only.
 */

const box = 'w-10 h-10 rounded-cb bg-white flex items-center justify-center overflow-hidden';

export function CloverLogo({ className = '' }) {
  return (
    <span className={`${box} ${className}`} aria-hidden>
      <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none">
        {/* Clover leaf mark — brand green */}
        <path
          fill="#3BB54A"
          d="M20 8c2.8 0 5 2.4 5 5.2 0 1.2-.4 2.3-1.1 3.2 1.5-.3 3.1.2 4.2 1.4 1.7 1.9 1.5 4.8-.4 6.5-1 .9-2.3 1.3-3.5 1.2.7.9 1.1 2 1.1 3.2 0 2.8-2.2 5.2-5 5.2s-5-2.4-5-5.2c0-1.2.4-2.3 1.1-3.2-1.2.1-2.5-.3-3.5-1.2-1.9-1.7-2.1-4.6-.4-6.5 1.1-1.2 2.7-1.7 4.2-1.4C15.4 15.5 15 14.4 15 13.2 15 10.4 17.2 8 20 8z"
        />
        <circle cx="20" cy="20" r="2.2" fill="#228B3B" />
      </svg>
    </span>
  );
}

export function SquareLogo({ className = '' }) {
  return (
    <span className={`${box} ${className}`} aria-hidden>
      <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none">
        {/* Square Cash App–style rounded square */}
        <rect x="8" y="8" width="24" height="24" rx="5" fill="#000" />
        <rect x="14" y="14" width="12" height="12" rx="2.5" fill="#fff" />
      </svg>
    </span>
  );
}

export function LightspeedLogo({ className = '' }) {
  return (
    <span className={`${box} ${className}`} aria-hidden>
      <svg viewBox="0 0 40 40" className="w-7 h-7" fill="none">
        {/* Lightspeed-style bolt mark */}
        <path
          fill="#E41E26"
          d="M22.5 6L11 22.5h7.2L15.5 34 29 17.5h-7.5L22.5 6z"
        />
      </svg>
    </span>
  );
}

export function ShopifyLogo({ className = '' }) {
  return (
    <span className={`${box} ${className}`} aria-hidden>
      <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
        {/* Shopify shopping-bag mark */}
        <path
          fill="#95BF47"
          d="M28.2 12.2c-.1-.8-.7-1.2-1.4-1.3l-1.6-.1s-.9-2.6-2.7-2.6c-.3 0-.6.1-.9.2V8c0-2.2-1.3-3.5-3.5-3.5h-.1C15.5 4.6 14 6.3 13.5 9c-1.4.4-2.4.8-2.5.8-.8.3-1.3 1-1.2 1.9l2.2 17.1c.1.7.7 1.2 1.4 1.2h13.4c.7 0 1.3-.5 1.4-1.2l2-15.6z"
        />
        <path
          fill="#5E8E3E"
          d="M22.5 8.2c-.3 0-.7.1-1 .2.5 1.1.8 2.4.9 3.7l2.1-.5c-.1-1.5-.9-3.4-2-3.4z"
        />
        <path
          fill="#fff"
          opacity="0.9"
          d="M18.1 4.8c-1.7.1-2.9 1.5-3.3 3.6 1.9.5 4.1 1.1 4.1 1.1s-.6-2.7.2-4.1c-.3-.4-.6-.6-1-.6z"
        />
      </svg>
    </span>
  );
}

export function ToastLogo({ className = '' }) {
  return (
    <span className={`${box} ${className}`} aria-hidden>
      <svg viewBox="0 0 40 40" className="w-8 h-8" fill="none">
        {/* Toast wordmark-style “T” on brand orange */}
        <rect x="6" y="6" width="28" height="28" rx="7" fill="#FF5500" />
        <path
          fill="#fff"
          d="M12.5 13.5h15v3.2h-5.6V27h-3.8V16.7h-5.6v-3.2z"
        />
      </svg>
    </span>
  );
}

const MAP = {
  clover: CloverLogo,
  square: SquareLogo,
  lightspeed: LightspeedLogo,
  shopify: ShopifyLogo,
  toast: ToastLogo,
};

export default function PosProviderLogo({ provider, className = '' }) {
  const Comp = MAP[provider];
  if (!Comp) {
    return (
      <span className={`${box} border border-cb-border bg-cb-surface-raised text-cb-accent font-display text-cb-title ${className}`}>
        ?
      </span>
    );
  }
  return <Comp className={className} />;
}
