import { FileText, Send, Clock, AlertTriangle, CheckCircle2, Check } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { cn } from '@/lib/utils';

// Mocked, self-contained step definitions — this component owns its own
// visual data and takes no external data source, so it's safe to render
// in isolation (Storybook, design review, etc.) with just a status string.
const STEPS = [
  { key: 'DRAFT', label: 'Application Started', description: 'Merchant details drafted', icon: FileText },
  { key: 'SUBMITTED', label: 'Submitted for Review', description: 'Sent to underwriting', icon: Send },
  { key: 'UNDERWRITING_HOLD', label: 'Underwriting', description: 'Risk & compliance review', icon: Clock },
  { key: 'APPROVED', label: 'Approved', description: 'Ready to board', icon: CheckCircle2 },
];

export default function ApplicationTracker({ currentStatus = 'DRAFT' }) {
  const activeIdx = Math.max(0, STEPS.findIndex((s) => s.key === currentStatus));
  const isHold = currentStatus === 'UNDERWRITING_HOLD';

  return (
    <Card>
      <CardContent className="p-6">
        <div className="flex items-start">
          {STEPS.map((step, idx) => {
            const isComplete = idx < activeIdx;
            const isActive = idx === activeIdx;
            const isHoldStep = isActive && isHold;
            const Icon = step.icon;

            let circleClass = 'border-2 border-gray-200 text-gray-400 bg-white';
            if (isComplete) circleClass = 'bg-amber-500 text-white border-amber-500';
            else if (isHoldStep) circleClass = 'bg-amber-100 text-amber-600 border-2 border-amber-500 ring-4 ring-amber-500/20';
            else if (isActive) circleClass = 'bg-blue-500 text-white border-blue-500 ring-4 ring-blue-500/20';

            let labelClass = 'text-gray-400';
            if (isComplete) labelClass = 'text-amber-600';
            else if (isHoldStep) labelClass = 'text-amber-600';
            else if (isActive) labelClass = 'text-blue-600';

            return (
              <div key={step.key} className={cn('flex items-center', idx < STEPS.length - 1 && 'flex-1')}>
                <div className="flex flex-col items-center gap-1.5 w-24 text-center">
                  <div className={cn('w-10 h-10 rounded-full flex items-center justify-center shrink-0 transition-all duration-300', circleClass)}>
                    {isComplete ? (
                      <Check className="w-5 h-5" strokeWidth={2.5} />
                    ) : isHoldStep ? (
                      <AlertTriangle className="w-5 h-5" strokeWidth={2.5} />
                    ) : (
                      <Icon className="w-5 h-5" strokeWidth={2} />
                    )}
                  </div>
                  <span className={cn('text-xs font-semibold', labelClass)}>{step.label}</span>
                  <span className="text-[11px] text-gray-400 leading-tight">{step.description}</span>
                </div>
                {idx < STEPS.length - 1 && (
                  <div
                    className="h-0.5 flex-1 mx-1 mb-8 rounded-full transition-colors duration-500"
                    style={{ background: idx < activeIdx ? '#F59E0B' : '#E5E7EB' }}
                  />
                )}
              </div>
            );
          })}
        </div>

        {isHold && (
          <Alert className="mt-6 border-amber-500/50 bg-amber-50 text-amber-800 [&>svg]:text-amber-600">
            <AlertTriangle className="h-4 w-4" />
            <AlertTitle>Action Required</AlertTitle>
            <AlertDescription className="text-amber-700">
              Underwriting has placed this application on hold. Please review the outstanding
              items and respond so processing can continue.
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
