import { Check } from 'lucide-react';

const steps = [
  { id: 1, label: 'Agreement', statuses: ['Incomplete'] },
  { id: 2, label: 'Bank Details', statuses: ['Quote Signed'] },
  { id: 3, label: 'Submitted', statuses: ['Submitted'] }
];

function getStepState(stepId, applicationStatus) {
  const statusOrder = { 'Incomplete': 1, 'Quote Signed': 2, 'Submitted': 3 };
  const currentOrder = statusOrder[applicationStatus] || 1;

  if (stepId < currentOrder) return 'complete';
  if (stepId === currentOrder) return 'active';
  return 'upcoming';
}

export default function ProgressTracker({ applicationStatus }) {
  return (
    <div className="flex items-center gap-0">
      {steps.map((step, idx) => {
        const state = getStepState(step.id, applicationStatus);
        return (
          <div key={step.id} className="flex items-center">
            <div className="flex flex-col items-center gap-1.5">
              {/* Circle */}
              <div className={`
                w-8 h-8 rounded-full flex items-center justify-center text-sm font-semibold transition-all duration-500
                ${state === 'complete' ? 'bg-amber-500 text-white' : ''}
                ${state === 'active' ? 'bg-blue-500 text-white ring-2 ring-blue-400/30' : ''}
                ${state === 'upcoming' ? 'border-2 border-gray-600 text-gray-500' : ''}
              `}>
                {state === 'complete' ? (
                  <Check className="w-4 h-4" strokeWidth={2.5} />
                ) : (
                  <span>{step.id}</span>
                )}
              </div>
              {/* Label */}
              <span className={`text-xs font-medium whitespace-nowrap transition-colors duration-300
                ${state === 'complete' ? 'text-amber-400' : ''}
                ${state === 'active' ? 'text-blue-400' : ''}
                ${state === 'upcoming' ? 'text-gray-600' : ''}
              `}>
                {step.label}
              </span>
            </div>

            {/* Connector line */}
            {idx < steps.length - 1 && (
              <div className="w-12 sm:w-20 h-px mx-2 mb-5 transition-all duration-500"
                style={{
                  background: state === 'complete' ? '#F59E0B' : '#374151'
                }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}