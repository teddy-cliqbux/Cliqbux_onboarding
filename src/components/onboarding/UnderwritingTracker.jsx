import { CheckCircle2, Clock, Loader2 } from 'lucide-react';

const STAGES = [
  { key: 'submitted', label: 'Application Submitted' },
  { key: 'underwriting', label: 'Underwriting Review' },
  { key: 'provisioned', label: 'MIDs Provisioned / Active' },
];

export default function UnderwritingTracker({ locations = [], concepts = [] }) {
  // Use concepts for status tracking when available (new), else fall back to locations (legacy)
  const items = concepts.length > 0 ? concepts : locations;
  const provisioned = items.filter((i) => i.elavonMID).length;
  const total = items.length;
  // Submitted > Underwriting while waiting for MIDs, Active once at least one MID arrives
  const activeStage = provisioned === total ? 2 : provisioned > 0 ? 1 : 0;

  return (
    <div className="w-full max-w-3xl mx-auto">
      <div className="bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 bg-gray-900">
          <div className="w-7 h-7 rounded-full bg-amber-500/20 flex items-center justify-center flex-shrink-0">
            <Clock className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-white font-bold text-sm">Underwriting Status</p>
            <p className="text-gray-400 text-xs">
              {activeStage === 2
                ? `All ${concepts.length > 0 ? 'concepts are' : 'locations are'} active and ready to process payments.`
                : activeStage === 0
                ? 'MIDs are pending — Elavon is reviewing your application.'
                : `${provisioned} of ${total} ${concepts.length > 0 ? 'concepts' : 'locations'} have been activated.`}
            </p>
          </div>
          <span className="text-xs font-semibold text-green-400 bg-green-400/10 border border-green-400/20 px-2.5 py-1 rounded-full flex-shrink-0">
            Live
          </span>
        </div>
        <div className="px-6 py-5">
          <div className="flex items-stretch gap-0 relative">
            {STAGES.map((stage, idx) => {
              const isActive = idx <= activeStage;
              const isCurrent = idx === activeStage;
              const isDone = idx < activeStage;
              return (
                <div key={stage.key} className="flex-1 flex flex-col items-center text-center relative">
                  {idx < STAGES.length - 1 && (
                    <div className="absolute top-3 left-1/2 w-full h-0.5">
                      <div className="h-full bg-gray-200 rounded-full w-full" />
                      <div
                        className="h-full bg-amber-500 rounded-full absolute top-0 left-0 transition-all duration-700"
                        style={{ width: isDone || (isCurrent && idx === 1 && activeStage === 1) ? '100%' : '0%' }}
                      />
                    </div>
                  )}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center z-10 relative transition-colors duration-300 ${
                    isDone ? 'bg-amber-500' : isCurrent ? 'bg-amber-100 ring-2 ring-amber-400' : 'bg-gray-100'
                  }`}>
                    {isDone ? (
                      <CheckCircle2 className="w-3.5 h-3.5 text-white" />
                    ) : isCurrent ? (
                      <Loader2 className="w-3.5 h-3.5 text-amber-500 animate-spin" />
                    ) : (
                      <div className="w-2 h-2 rounded-full bg-gray-300" />
                    )}
                  </div>
                  <p className={`text-[11px] font-semibold mt-2 max-w-[90px] leading-tight ${isActive ? 'text-gray-900' : 'text-gray-400'}`}>
                    {stage.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}