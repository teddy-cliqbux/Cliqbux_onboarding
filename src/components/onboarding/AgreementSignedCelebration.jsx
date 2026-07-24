import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

const SPRING = { type: 'spring', stiffness: 150, damping: 20 };

/**
 * Signature moment after BoldSign completes — Cliqbux shield "stamps" the
 * agreement, then the merchant continues to Merchant Center.
 * Agents do not use this path for Elavon submit (that's a separate CTA).
 */
export default function AgreementSignedCelebration({
  merchantName,
  onContinue,
  continuing = false,
}) {
  const reduceMotion = useReducedMotion();
  const [stamped, setStamped] = useState(!!reduceMotion);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const t = setTimeout(() => setStamped(true), 420);
    return () => clearTimeout(t);
  }, [reduceMotion]);

  return (
    <div className="relative overflow-hidden rounded-cb border border-cb-border bg-cb-surface-raised px-6 py-10 sm:px-10 sm:py-12">
      {/* Quiet gold wash — atmosphere, not a card stack */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 20%, color-mix(in srgb, var(--cb-accent) 28%, transparent), transparent 70%)',
        }}
        aria-hidden
      />

      <div className="relative flex flex-col items-center text-center gap-6 max-w-md mx-auto">
        <div className="relative h-28 w-28 flex items-center justify-center">
          {/* Paper / certificate plane */}
          <motion.div
            className="absolute inset-2 rounded-cb border border-cb-border bg-cb-bg"
            initial={reduceMotion ? false : { opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={SPRING}
            aria-hidden
          />
          {/* Shield stamp */}
          <motion.img
            src="/brand/cliqbux-mark.png"
            alt=""
            width={88}
            height={98}
            draggable={false}
            className="relative z-10 object-contain drop-shadow-sm"
            initial={
              reduceMotion
                ? false
                : { opacity: 0, scale: 2.4, rotate: -18, y: -36 }
            }
            animate={
              stamped
                ? { opacity: 1, scale: 1, rotate: -6, y: 0 }
                : { opacity: 0, scale: 2.4, rotate: -18, y: -36 }
            }
            transition={
              reduceMotion
                ? { duration: 0 }
                : { type: 'spring', stiffness: 220, damping: 16, mass: 0.85 }
            }
          />
          {/* Stamp impact ring */}
          {!reduceMotion && stamped && (
            <motion.span
              className="absolute z-0 h-24 w-24 rounded-full border-2 border-cb-accent"
              initial={{ opacity: 0.55, scale: 0.55 }}
              animate={{ opacity: 0, scale: 1.65 }}
              transition={{ duration: 0.7, ease: 'easeOut' }}
              aria-hidden
            />
          )}
        </div>

        <motion.div
          className="space-y-2"
          initial={reduceMotion ? false : { opacity: 0, y: 10 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ ...SPRING, delay: reduceMotion ? 0 : 0.35 }}
        >
          <p className="text-cb-caption uppercase text-cb-accent tracking-wide">Agreement signed</p>
          <h3 className="font-display text-cb-display text-white">
            Thank you{merchantName ? `, ${String(merchantName).split(' ')[0]}` : ''}
          </h3>
          <p className="text-cb-body-lg text-gray-400">
            Your merchant processing agreement is signed and sealed. Next up: equipment, setup, and go-live in your Merchant Center.
          </p>
        </motion.div>

        <motion.button
          type="button"
          onClick={onContinue}
          disabled={continuing || !stamped}
          className="inline-flex items-center justify-center gap-2 min-h-12 px-6 rounded-cb bg-cb-accent text-cb-bg text-cb-body font-semibold hover:opacity-90 disabled:opacity-50 transition-opacity"
          initial={reduceMotion ? false : { opacity: 0, y: 8 }}
          animate={{ opacity: stamped ? 1 : 0.4, y: 0 }}
          transition={{ ...SPRING, delay: reduceMotion ? 0 : 0.5 }}
        >
          {continuing ? 'Opening Merchant Center…' : (
            <>
              Continue to Merchant Center
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}
