export default function CliqbuxLogo({ size = 'md' }) {
  const sizes = {
    sm: { shield: 28, text: 'text-base' },
    md: { shield: 36, text: 'text-xl' },
    lg: { shield: 48, text: 'text-2xl' }
  };
  const s = sizes[size] || sizes.md;

  return (
    <div className="flex items-center gap-2.5">
      {/* Cliqbux Shield SVG — matches dashboard branding */}
      <svg width={s.shield} height={s.shield} viewBox="0 0 40 46" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M20 2L4 9V22C4 31.4 11.1 40.2 20 43C28.9 40.2 36 31.4 36 22V9L20 2Z" fill="#F59E0B" />
        <path d="M20 7L8 13V22C8 29.2 13.3 36.1 20 38.5C26.7 36.1 32 29.2 32 22V13L20 7Z" fill="#1E2839" />
        <path d="M17 28L12 23L13.4 21.6L17 25.2L26.6 15.6L28 17L17 28Z" fill="#F59E0B" />
      </svg>
      <span className={`font-bold tracking-tight text-white ${s.text}`} style={{ fontFamily: 'Inter, sans-serif' }}>
        cliqbux
      </span>
    </div>
  );
}