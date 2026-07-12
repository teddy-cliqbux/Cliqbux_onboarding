import { Check } from 'lucide-react';
import { motion } from 'framer-motion';

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

  return (
    <>
      {/* Compact mobile variant — "Step N of 4" with a mini progress bar */}
      <div className="flex sm:hidden items-center gap-2.5">
        <div className="flex flex-col items-end gap-1">
          <span className="text-[10px] font-semibold text-gray-400 uppercase tracking-wider">
            Step {activeIdx + 1} of {STEPS.length}
          </span>
          <div className="w-20 h-1 rounded-full bg-white/10 overflow-hidden">
            <motion.div
              className="h-full rounded-full bg-amber-500"
              initial={false}
              animate={{ width: `${Math.max(completedCount, activeIdx + 0.5) / STEPS.length * 100}%` }}
              transition={{ type: 'spring', stiffness: 120, damping: 20 }}
            />
          </div>
        </div>
        <div className="w-7 h-7 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center text-[11px] font-bold text-amber-400">
          {activeIdx + 1}
        </div>
      </div>

      {/* Full tracker — desktop / tablet */}
      <div className="hidden sm:flex items-center gap-0">
        {STEPS.map((step, idx) => {
          const isComplete = !!completedSteps[step.key];
          const isActive   = idx === activeIdx && !isComplete;
          const isUpcoming = idx > activeIdx && !isComplete;
          const canClick   = onNavigate && (isComplete || idx <= activeIdx);

          let circleClass = '';
          if (isComplete)  circleClass = 'bg-amber-500 text-[#0E1319] shadow-lg shadow-amber-500/25';
          else if (isActive)  circleClass = 'bg-amber-500/15 text-amber-400 border border-amber-500/60 ring-4 ring-amber-500/15';
          else circleClass = 'border border-white/15 text-gray-500';

          let labelClass = '';
          if (isComplete) labelClass = 'text-amber-400';
          else if (isActive) labelClass = 'text-white';
          else labelClass = 'text-gray-600';

          return (
            <div key={step.id} className="flex items-center">
              <button
                onClick={() => canClick && onNavigate(step.key)}
                disabled={!canClick}
                className={`group flex flex-col items-center gap-1.5 ${canClick ? 'cursor-pointer' : 'cursor-default'}`}
                title={canClick ? `Go to ${step.label}` : step.label}
              >
                <motion.div
                  className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-colors duration-300 ${circleClass} ${canClick ? 'group-hover:ring-4 group-hover:ring-white/5' : ''}`}
                  whileTap={canClick ? { scale: 0.92 } : undefined}
                >
                  {isComplete ? (
                    <motion.span
                      initial={{ scale: 0, rotate: -30 }}
                      animate={{ scale: 1, rotate: 0 }}
                      transition={{ type: 'spring', stiffness: 400, damping: 18 }}
                      className="flex"
                    >
                      <Check className="w-4 h-4" strokeWidth={3} />
                    </motion.span>
                  ) : (
                    <span>{step.id}</span>
                  )}
                </motion.div>
                <span className={`text-xs font-medium whitespace-nowrap transition-colors duration-300 ${labelClass} ${canClick ? 'group-hover:text-white' : ''}`}>
                  {step.label}
                </span>
              </button>
              {idx < STEPS.length - 1 && (
                <div className="relative w-10 lg:w-16 h-px mx-2 mb-5 bg-white/10 overflow-hidden rounded-full">
                  <motion.div
                    className="absolute inset-y-0 left-0 bg-amber-500"
                    initial={false}
                    animate={{ width: isComplete ? '100%' : '0%' }}
                    transition={{ duration: 0.5, ease: 'easeOut' }}
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
