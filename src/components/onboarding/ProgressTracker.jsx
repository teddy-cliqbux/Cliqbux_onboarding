import { Check } from 'lucide-react';

const steps = [
  { id: 1, label: 'Pricing / Agreement', statuses: ['Incomplete', 'Pricing Selected'] },
  { id: 2, label: 'Verification', statuses: ['Quote Signed'] },
  { id: 3, label: 'Locations & Submit', statuses: ['Submitted'] }
];

// verificationDone is passed in to distinguish step 2 vs step 3 within 'Pricing Selected'/'Quote Signed'
function getStepState(stepId, applicationStatus, verificationDone) {
  const isPricingDone = applicationStatus === 'Pricing Selected' || applicationStatus === 'Quote Signed';
  const isSubmitted = applicationStatus === 'Submitted';

  if (stepId === 1) {
    return isPricingDone || isSubmitted ? 'complete' : 'active';
  }
  if (stepId === 2) {
    if (isSubmitted || (isPricingDone && verificationDone)) return 'complete';
    if (isPricingDone && !verificationDone) return 'active';
    return 'upcoming';
  }
  if (stepId === 3) {
    if (isSubmitted) return 'complete';
    if (isPricingDone && verificationDone) return 'active';
    return 'upcoming';
  }
  return 'upcoming';
}

export default function ProgressTracker({ applicationStatus, verificationDone = false }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, idx) => {
        const state = getStepState(step.id, applicationStatus, verificationDone);
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-500
                ${state === 'complete' ? 'bg-amber-500 text-white' : ''}
                ${state === 'active' ? 'bg-blue-500 text-white ring-2 ring-blue-400/30' : ''}
                ${state === 'upcoming' ? 'border-2 border-gray-600 text-gray-500' : ''}
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
                style={{ background: state === 'complete' ? '#F59E0B' : '#374151' }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}