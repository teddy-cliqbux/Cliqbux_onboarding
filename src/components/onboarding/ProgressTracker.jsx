import { Check } from 'lucide-react';

const steps = [
  { id: 1, label: 'Agreement', completedStatus: ['Pricing Selected', 'Quote Signed'] },
  { id: 2, label: 'Locations',  completedStatus: ['Submitted'] },
  { id: 3, label: 'Review',     completedStatus: ['Submitted'] },
  { id: 4, label: 'Verify',     completedStatus: ['Submitted'] },
];

function getStepState(stepIdx, applicationStatus) {
  const isSubmitted = applicationStatus === 'Submitted';
  const isPricingDone = applicationStatus === 'Pricing Selected' || applicationStatus === 'Quote Signed';
  if (stepIdx === 0) return isPricingDone || isSubmitted ? 'complete' : 'active';
  if (stepIdx <= 3) {
    if (isSubmitted) return 'complete';
    if (isPricingDone) return stepIdx === 1 ? 'active' : 'upcoming';
    return 'upcoming';
  }
  return 'upcoming';
}

export default function ProgressTracker({ applicationStatus }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, idx) => {
        const state = getStepState(idx, applicationStatus);
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-500
                ${state === 'complete' ? 'bg-amber-500 text-white' : ''}
                ${state === 'active' ? 'bg-blue-500 text-white ring-2 ring-blue-400/40 shadow-lg shadow-blue-500/20' : ''}
                ${state === 'upcoming' ? 'border-2 border-white/15 text-gray-500' : ''}
              `}>
                {state === 'complete' ? <Check className="w-4 h-4" strokeWidth={2.5} /> : <span>{step.id}</span>}
              </div>
              <span className={`text-xs font-medium whitespace-nowrap transition-colors duration-300
                ${state === 'complete' ? 'text-amber-400' : ''}
                ${state === 'active' ? 'text-blue-400' : ''}
                ${state === 'upcoming' ? 'text-gray-600' : ''}
              `}>
                {step.label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className="w-12 sm:w-16 h-px mx-2 mb-5 transition-all duration-500"
                style={{ background: state === 'complete' ? '#F59E0B' : 'rgba(255,255,255,0.1)' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}