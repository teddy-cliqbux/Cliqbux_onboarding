// Official Cliqbux brand mark — uses the real shield asset (favicon), not a
// hand-drawn SVG recreation. Wordmark is set in CSS so it stays legible on
// the dark portal chrome (the horizontal PNG wordmark is charcoal).
// Gap between shield and wordmark: 12px per brand spacing guide.
const SIZES = {
  sm: { mark: 28, text: 'text-base' },
  md: { mark: 36, text: 'text-xl' },
  lg: { mark: 48, text: 'text-3xl' },
};

export default function CliqbuxLogo({ size = 'md', markOnly = false }) {
  const s = SIZES[size] || SIZES.md;

  return (
    <div className="flex items-center" style={{ gap: 12 }}>
      <img
        src="/brand/cliqbux-mark.png"
        alt={markOnly ? 'Cliqbux' : ''}
        width={s.mark}
        height={Math.round(s.mark * 1.12)}
        className="flex-shrink-0 object-contain"
        draggable={false}
      />
      {!markOnly && (
        <span
          className={`text-white leading-none ${s.text}`}
          style={{ fontFamily: "'Poppins', 'Inter', sans-serif", fontWeight: 700, letterSpacing: '-0.03em' }}
        >
          cliqbux
        </span>
      )}
    </div>
  );
}
