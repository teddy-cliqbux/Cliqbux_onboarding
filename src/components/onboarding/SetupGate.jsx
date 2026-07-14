import { Lock } from 'lucide-react';

/**
 * Soft lock / shipping-hold wrapper for post-signing setup cards.
 * state: 'unlocked' | 'locked' | 'hold'
 */
export default function SetupGate({
  state = 'unlocked',
  title,
  holdMessage,
  lockedMessage = 'Available after your quote is signed.',
  children,
}) {
  if (state === 'unlocked') return children;

  const isHold = state === 'hold';
  const message = isHold
    ? (holdMessage || 'On hold until invoice payment clears.')
    : lockedMessage;

  return (
    <div className="relative rounded-cb">
      <div className={state !== 'unlocked' ? 'pointer-events-none select-none opacity-40' : ''} aria-hidden={state !== 'unlocked'}>
        {children}
      </div>
      <div className="absolute inset-0 z-10 flex items-center justify-center rounded-cb bg-cb-bg/70 backdrop-blur-[1px] border border-cb-border px-4">
        <div className="max-w-sm text-center space-y-2">
          <span className="inline-flex items-center justify-center w-9 h-9 rounded-full bg-cb-accent-muted border border-cb-border">
            <Lock className="w-4 h-4 text-cb-accent" />
          </span>
          {title && (
            <p className="text-cb-body font-semibold text-white">{title}</p>
          )}
          <p className="text-cb-caption normal-case tracking-normal text-gray-400 leading-relaxed">
            {message}
          </p>
        </div>
      </div>
    </div>
  );
}
