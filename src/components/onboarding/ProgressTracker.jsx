import { Check } from 'lucide-react';

const STEPS = [
  { id: 1, label: 'Agreement',  key: 'agreement' },
  { id: 2, label: 'Locations',  key: 'locations'  },
  { id: 3, label: 'Banking',    key: 'banking'     },
  { id: 4, label: 'Verify',     key: 'verify'      },
];

export default function ProgressTracker({ currentStep, completedSteps = {}, onNavigate }) {
  // Map step key → index (0-based)
  const keyToIdx = { agreement: 0, locations: 1, banking: 2, verify: 3 };
  const activeIdx = keyToIdx[currentStep] ?? 0;

  return (
    <div className="flex items-center gap-0">
      {STEPS.map((step, idx) => {
        const isComplete = !!completedSteps[step.key];
        const isActive   = idx === activeIdx && !isComplete;
        const isUpcoming = idx > activeIdx && !isComplete;
        const canClick   = onNavigate && (isComplete || idx <= activeIdx);

        let circleClass = '';
        if (isComplete)  circleClass = 'bg-amber-500 text-white';
        else if (isActive)  circleClass = 'bg-blue-500 text-white ring-2 ring-blue-400/40 shadow-lg shadow-blue-500/20';
        else circleClass = 'border-2 border-white/15 text-gray-500';

        let labelClass = '';
        if (isComplete) labelClass = 'text-amber-400';
        else if (isActive) labelClass = 'text-blue-400';
        else labelClass = 'text-gray-600';

        const lineColor = isComplete ? '#F59E0B' : 'rgba(255,255,255,0.1)';

        return (
          <div key={step.id} className="flex items-center">
            <button
              onClick={() => canClick && onNavigate(step.key)}
              disabled={!canClick}
              className={`flex flex-col items-center gap-1.5 ${canClick ? 'cursor-pointer hover:opacity-80' : 'cursor-default'} transition-opacity`}
              title={canClick ? `Go to ${step.label}` : step.label}
            >
              <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-300 ${circleClass}`}>
                {isComplete ? <Check className="w-4 h-4" strokeWidth={2.5} /> : <span>{step.id}</span>}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap transition-colors duration-300 ${labelClass}`}>
                {step.label}
              </span>
            </button>
            {idx < STEPS.length - 1 && (
              <div
                className="w-12 sm:w-16 h-px mx-2 mb-5 transition-all duration-500"
                style={{ background: lineColor }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}