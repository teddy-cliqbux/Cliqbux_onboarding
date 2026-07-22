import { Check } from 'lucide-react';
import { motion, useReducedMotion } from 'framer-motion';

// Motion communicates state — same spring everywhere in this file.
const SPRING = { type: 'spring', stiffness: 150, damping: 20 };

// 2026-07-10 flow reorder: data entry and the merchant agreement come first;
// the equipment quote is signed LAST (on the post-submission dashboard).
const CORE_STEPS = [
  { id: 1, label: 'People',         key: 'people'    },
  { id: 2, label: 'Locations',      key: 'locations' },
  { id: 3, label: 'Banking',        key: 'banking'   },
  { id: 4, label: 'Sign & Submit',  key: 'verify'    },
];

const EQUIPMENT_STEP = { id: 5, label: 'Equipment', key: 'quote' };

export default function ProgressTracker({
  currentStep,
  completedSteps = {},
  onNavigate,
  includeEquipment = false,
}) {
  const reduceMotion = useReducedMotion();
  const transition = reduceMotion ? { duration: 0 } : SPRING;
  const STEPS = includeEquipment ? [...CORE_STEPS, EQUIPMENT_STEP] : CORE_STEPS;
  // Map step key → index (0-based) within the visible step list
  const keyToIdx = Object.fromEntries(STEPS.map((s, i) => [s.key, i]));
  // If Equipment is hidden but currentStep is quote, fall back to Sign & Submit
  const activeIdx = keyToIdx[currentStep] ?? (currentStep === 'quote' ? STEPS.length - 1 : 0);
  const completedCount = STEPS.filter(s => completedSteps[s.key]).length;
  const progressPct = Math.max(completedCount, activeIdx + 0.5) / STEPS.length * 100;
  const activeLabel = STEPS[activeIdx]?.label || 'Locations';

  return (
    <>
      {/* Compact mobile variant — named step + progress capsule */}
      <div className="flex sm:hidden items-center gap-2.5">
        <div className="flex flex-col items-end gap-1">
          <span className="text-cb-caption normal-case tracking-normal font-medium text-white">
            {activeLabel}
            <span className="text-gray-500 font-normal"> · {activeIdx + 1}/{STEPS.length}</span>
          </span>
          <div className="w-20 h-1 rounded-full bg-cb-bg overflow-hidden border border-cb-border">
            <motion.div
              className="h-full rounded-full bg-cb-accent"
              initial={false}
              animate={{ width: `${progressPct}%` }}
              transition={transition}
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
            <div key={step.key} className="flex items-center">
              <button
                onClick={() => canClick && onNavigate(step.key)}
                disabled={!canClick}
                className={`group relative flex flex-col items-center gap-1.5 min-h-11 ${canClick ? 'cursor-pointer' : 'cursor-default'}`}
                title={canClick ? `Go to ${step.label}` : step.label}
              >
                {/* layoutId on the circle itself — a separate absolute capsule was
                    misaligning (double bubble) when steps have different label widths. */}
                <motion.div
                  layoutId={!reduceMotion && isActive ? 'cb-progress-capsule' : undefined}
                  className={`relative z-10 w-8 h-8 rounded-full flex items-center justify-center text-cb-body font-semibold ${circleClass}`}
                  whileTap={!reduceMotion && canClick ? { scale: 0.94 } : undefined}
                  transition={transition}
                >
                  {isComplete ? (
                    <motion.span
                      initial={reduceMotion ? false : { scale: 0.6, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      transition={transition}
                      className="flex"
                    >
                      <Check className="w-4 h-4" strokeWidth={3} />
                    </motion.span>
                  ) : (
                    <span>{idx + 1}</span>
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
                    transition={transition}
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
