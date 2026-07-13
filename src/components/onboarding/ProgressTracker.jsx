import { Check } from 'lucide-react';
import { motion } from 'framer-motion';

// Motion communicates state — same spring everywhere in this file.
const SPRING = { type: 'spring', stiffness: 150, damping: 20 };

// 2026-07-10 flow reorder: data entry and the merchant agreement come first;
// the equipment quote is signed LAST (on the post-submission dashboard).
const STEPS = [
  { id: 1, label: 'Locations',      key: 'locations' },
  { id: 2, label: 'Banking',        key: 'banking'   },
  { id: 3, label: 'Sign & Submit',  key: 'verify'    },
  { id: 4, label: 'Equipment',      key: 'quote'     },
];

export default function ProgressTracker({ currentStep, completedSteps = {}, onNavigate }) {
  // Map step key → index (0-based)
  const keyToIdx = { locations: 0, banking: 1, verify: 2, quote: 3 };
  const activeIdx = keyToIdx[currentStep] ?? 0;
  const completedCount = STEPS.filter(s => completedSteps[s.key]).length;
  const progressPct = Math.max(completedCount, activeIdx + 0.5) / STEPS.length * 100;

  return (
    <>
      {/* Compact mobile variant — "Step N of 4" with a mini progress capsule */}
      <div className="flex sm:hidden items-center gap-2.5">
        <div className="flex flex-col items-end gap-1">
          <span className="text-cb-caption uppercase text-gray-500">
            Step {activeIdx + 1} of {STEPS.length}
          </span>
          <div className="w-20 h-1 rounded-full bg-cb-bg overflow-hidden border border-cb-border">
            <motion.div
              className="h-full rounded-full bg-cb-accent"
              initial={false}
              animate={{ width: `${progressPct}%` }}
              transition={SPRING}
            />
          </div>
        </div>
        <div className="w-7 h-7 rounded-full bg-cb-accent-muted border border-cb-accent/40 flex items-center justify-center text-cb-caption font-bold text-cb-accent normal-case tracking-normal">
          {activeIdx + 1}
        </div>
      </div>

      {/* Full tracker — desktop / tablet */}
      <div className="hidden sm:flex items-center gap-0">
        {STEPS.map((step, idx) => {
          const isComplete = !!completedSteps[step.key];
          const isActive   = idx === activeIdx;
          const canClick   = onNavigate && (isComplete || idx <= activeIdx);

          let circleClass = '';
          if (isComplete)  circleClass = 'bg-cb-accent text-cb-bg';
          else if (isActive)  circleClass = 'bg-cb-accent-muted text-cb-accent border border-cb-accent/50';
          else circleClass = 'border border-cb-border text-gray-500 bg-cb-bg';

          let labelClass = '';
          if (isComplete) labelClass = 'text-cb-accent';
          else if (isActive) labelClass = 'text-white';
          else labelClass = 'text-gray-600';

          return (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => canClick && onNavigate(step.key)}
                disabled={!canClick}
                className={`group relative flex flex-col items-center gap-1.5 ${canClick ? 'cursor-pointer' : 'cursor-default'}`}
                title={canClick ? `Go to ${step.label}` : step.label}
              >
                {/* Gold capsule — single shared layoutId glides under the active step */}
                {isActive && (
                  <motion.div
                    layoutId="cb-progress-capsule"
                    className="absolute -top-1 left-1/2 -translate-x-1/2 w-10 h-10 rounded-full bg-cb-accent-muted border border-cb-accent/35 pointer-events-none"
                    transition={SPRING}
                  />
                )}
                <motion.div
                  className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-cb-body font-semibold ${circleClass}`}
                  whileTap={canClick ? { scale: 0.94 } : undefined}
                  transition={SPRING}
                >
                  {isComplete ? (
                    <motion.span
                      initial={{ scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={SPRING}
                      className="flex"
                    >
                      <Check className="w-4 h-4" strokeWidth={3} />
                    </motion.span>
                  ) : (
                    <span>{step.id}</span>
                  )}
                </motion.div>
                <span className={`relative z-10 text-cb-caption normal-case tracking-normal font-medium whitespace-nowrap transition-colors duration-200 ${labelClass} ${canClick ? 'group-hover:text-white' : ''}`}>
                  {step.label}
                </span>
              </button>
              {idx < STEPS.length - 1 && (
                <div className="relative w-10 lg:w-16 h-px mx-2 mb-5 bg-cb-border overflow-hidden rounded-full">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-cb-accent"
                    initial={false}
                    animate={{ width: isComplete ? '100%' : '0%' }}
                    transition={SPRING}
                  />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
