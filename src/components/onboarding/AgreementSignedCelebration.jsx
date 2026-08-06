import { useEffect, useState } from 'react';
import { motion, useReducedMotion } from 'framer-motion';
import { ArrowRight } from 'lucide-react';

const SPRING = { type: 'spring', stiffness: 150, damping: 20 };
const MARK_SRC = '/brand/cliqbux-mark.png';
const MARK_W = 96;
const MARK_H = 108;

/**
 * Signature moment after BoldSign completes — Cliqbux shield "stamps" the
 * agreement, then everyone proceeds to Merchant Center (Onboarding Center).
 * Processor submit lives on Applications / Deal Room only.
 *
 * Stamp motion stays the same; after it settles we swap to a static mark
 * (no leftover rotate/transform) so the logo reads crisp and upright.
 */
export default function AgreementSignedCelebration({
  merchantName,
  onContinue,
  continuing = false,
  continueLabel = 'Proceed to Onboarding Center',
  continuingLabel = 'Opening Onboarding Center…',
}) {
  const reduceMotion = useReducedMotion();
  const [stamped, setStamped] = useState(!!reduceMotion);
  const [logoSettled, setLogoSettled] = useState(!!reduceMotion);

  useEffect(() => {
    if (reduceMotion) return undefined;
    const t = setTimeout(() => setStamped(true), 420);
    return () => clearTimeout(t);
  }, [reduceMotion]);

  return (
    <div className="relative overflow-hidden rounded-cb border border-cb-border bg-cb-surface-raised px-6 py-10 sm:px-10 sm:py-12">
      {/* Quiet gold wash — atmosphere, not a card stack (hex rgba: html2canvas-safe) */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          background:
            'radial-gradient(ellipse 70% 55% at 50% 20%, rgba(254, 172, 39, 0.28), transparent 70%)',
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
          {/* After stamp: static mark — upright + no GPU transform blur */}
          {logoSettled ? (
            <img
              src={MARK_SRC}
              alt=""
              width={MARK_W}
              height={MARK_H}
              draggable={false}
              className="relative z-10 h-[98px] w-auto max-w-[88px] object-contain select-none"
            />
          ) : (
            <motion.img
              src={MARK_SRC}
              alt=""
              width={MARK_W}
              height={MARK_H}
              draggable={false}
              className="relative z-10 h-[98px] w-auto max-w-[88px] object-contain select-none"
              initial={
                reduceMotion
                  ? false
                  : { opacity: 0, scale: 2.4, rotate: -18, y: -36 }
              }
              animate={
                stamped
                  ? { opacity: 1, scale: 1, rotate: 0, y: 0 }
                  : { opacity: 0, scale: 2.4, rotate: -18, y: -36 }
              }
              transition={
                reduceMotion
                  ? { duration: 0 }
                  : { type: 'spring', stiffness: 220, damping: 16, mass: 0.85 }
              }
              onAnimationComplete={() => {
                if (stamped) setLogoSettled(true);
              }}
            />
          )}
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
          {continuing ? continuingLabel : (
            <>
              {continueLabel}
              <ArrowRight className="w-4 h-4" />
            </>
          )}
        </motion.button>
      </div>
    </div>
  );
}