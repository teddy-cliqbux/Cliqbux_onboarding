// Cliqbux brand mark — vector recreation of the official logo (2026-07-12):
// gold origami shield forming a "B" (notched right edge), white inner cube
// with two gold window panes, lowercase Poppins wordmark.
export default function CliqbuxLogo({ size = 'md' }) {
  const sizes = {
    sm: { shield: 30, text: 'text-base' },
    md: { shield: 38, text: 'text-xl' },
    lg: { shield: 52, text: 'text-3xl' }
  };
  const s = sizes[size] || sizes.md;

  return (
    <div className="flex items-center gap-2.5">
      <svg width={s.shield} height={s.shield * 1.08} viewBox="0 0 100 108" fill="none" xmlns="http://www.w3.org/2000/svg">
        <defs>
          <linearGradient id="cbxGoldMain" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#FFAF1F" />
            <stop offset="1" stopColor="#F5980A" />
          </linearGradient>
        </defs>
        {/* Light folded left face */}
        <path d="M14 24 L40 9 L40 98 L14 68 Z" fill="#FFC55C" />
        {/* Main gold body with B-notch on the right edge */}
        <path
          d="M40 9 L86 15 L86 43 L79 50 L86 57 L86 66 L50 105 L40 98 Z"
          fill="url(#cbxGoldMain)"
        />
        {/* Inner white cube-shield (rounded via thick stroke) */}
        <path
          d="M40 32 L74 37 L74 45 L68 50 L74 55 L74 65 L52 88 L40 78 Z"
          fill="#FFFFFF" stroke="#FFFFFF" strokeWidth="7" strokeLinejoin="round"
        />
        {/* Two gold window panes forming the B counters */}
        <path d="M53 41 L68 43.5 L68 51.5 L53 50.5 Z" fill="url(#cbxGoldMain)" stroke="url(#cbxGoldMain)" strokeWidth="3" strokeLinejoin="round" />
        <path d="M53 55.5 L68 56.5 L68 64 L53 68 Z" fill="url(#cbxGoldMain)" stroke="url(#cbxGoldMain)" strokeWidth="3" strokeLinejoin="round" />
      </svg>
      <span
        className={`text-white ${s.text}`}
        style={{ fontFamily: "'Poppins', 'Inter', sans-serif", fontWeight: 700, letterSpacing: '-0.03em' }}
      >
        cliqbux
      </span>
    </div>
  );
}
