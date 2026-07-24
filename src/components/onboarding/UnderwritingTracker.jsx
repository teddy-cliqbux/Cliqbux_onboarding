import { Check, Loader2 } from 'lucide-react';

const STAGES = [
  { key: 'submitted', label: 'Application Submitted' },
  { key: 'underwriting', label: 'Underwriting Review' },
  { key: 'provisioned', label: 'MIDs Provisioned / Active' },
];

const STATUS_DOTS = {
  'Active': 'bg-cb-success',
  'Active (Existing)': 'bg-cb-success',
  'Pending MID': 'bg-cb-accent',
  'Ready to Submit': 'bg-cb-accent',
  'In Review': 'bg-gray-500',
  'Error': 'bg-cb-danger',
};

function statusDotClass(status) {
  return STATUS_DOTS[status] || STATUS_DOTS['In Review'];
}

export default function UnderwritingTracker({ locations = [], merchantIDs = [] }) {
  // Use merchantIDs for status tracking when available (new), else fall back to locations (legacy)
  const items = merchantIDs.length > 0 ? merchantIDs : locations;
  const provisioned = items.filter((i) => i.elavonMID).length;
  const total = items.length;
  // Submitted > Underwriting while waiting for MIDs, Active once at least one MID arrives
  const activeStage = provisioned === total && total > 0 ? 2 : provisioned > 0 ? 1 : 0;

  return (
    <div className="w-full">
      <div className="bg-cb-surface-raised rounded-cb border border-cb-border overflow-hidden">
        <div className="flex items-center gap-3 px-6 py-4 border-b border-cb-border">
          <div className="flex-1 min-w-0">
            <p className="text-cb-caption uppercase text-gray-500 mb-0.5">Underwriting Status</p>
            <p className="text-cb-body text-gray-300">
              {activeStage === 2
                ? `All ${merchantIDs.length > 0 ? 'Merchant IDs are' : 'locations are'} active and ready to process payments.`
                : activeStage === 0
                ? 'MIDs are pending — Elavon is reviewing your application.'
                : `${provisioned} of ${total} ${merchantIDs.length > 0 ? 'Merchant IDs' : 'locations'} have been activated.`}
            </p>
            <p className="text-cb-caption normal-case tracking-normal text-gray-500 mt-1">
              Open checklist items appear above — clear those to keep underwriting moving.
            </p>
          </div>
          <span className="inline-flex items-center gap-1.5 text-cb-caption normal-case tracking-normal font-medium text-cb-success flex-shrink-0">
            <span className="w-1.5 h-1.5 rounded-full bg-cb-success" />
            Live
          </span>
        </div>
        <div className="px-6 py-5 border-b border-cb-border">
          <div className="flex items-stretch gap-0 relative">
            {STAGES.map((stage, idx) => {
              const isActive = idx <= activeStage;
              const isCurrent = idx === activeStage;
              const isDone = idx < activeStage;
              return (
                <div key={stage.key} className="flex-1 flex flex-col items-center text-center relative">
                  {idx < STAGES.length - 1 && (
                    <div className="absolute top-3 left-1/2 w-full h-px">
                      <div className="h-full bg-cb-border rounded-full w-full" />
                      <div
                        className="h-full bg-cb-accent rounded-full absolute top-0 left-0 transition-all duration-700"
                        style={{ width: isDone || (isCurrent && idx === 1 && activeStage === 1) ? '100%' : '0%' }}
                      />
                    </div>
                  )}
                  <div className={`w-6 h-6 rounded-full flex items-center justify-center z-10 relative transition-colors duration-300 ${
                    isDone ? 'bg-cb-accent text-cb-bg' : isCurrent ? 'bg-cb-accent-muted border border-cb-accent/50 text-cb-accent' : 'border border-cb-border'
                  }`}>
                    {isDone ? (
                      <Check className="w-3.5 h-3.5" strokeWidth={3} />
                    ) : isCurrent ? (
                      <Loader2 className="w-3.5 h-3.5 text-cb-accent animate-spin" />
                    ) : (
                      <div className="w-1.5 h-1.5 rounded-full bg-gray-600" />
                    )}
                  </div>
                  <p className={`text-cb-caption normal-case tracking-normal font-medium mt-2 max-w-[90px] leading-tight ${isActive ? 'text-white' : 'text-gray-600'}`}>
                    {stage.label}
                  </p>
                </div>
              );
            })}
          </div>
        </div>
        <div className="overflow-x-auto">
          <table className="w-full text-left">
            <thead>
              <tr className="border-b border-cb-border text-cb-caption uppercase text-gray-500">
                <th className="px-4 py-2 font-medium">Account</th>
                <th className="px-4 py-2 font-medium">Status</th>
                <th className="px-4 py-2 font-medium">MID</th>
              </tr>
            </thead>
            <tbody>
              {items.length === 0 ? (
                <tr>
                  <td colSpan={3} className="px-4 py-10 text-center text-cb-body text-gray-500">
                    No processing accounts yet
                  </td>
                </tr>
              ) : items.map((row) => {
                const status = row.applicationStepStatus || 'In Review';
                return (
                  <tr key={row.id || row.elavonMID} className="border-b border-cb-border/60">
                    <td className="px-4 py-3 text-cb-body text-white">
                      {row.merchantName || row.dbaName || 'Processing account'}
                    </td>
                    <td className="px-4 py-3 text-cb-caption normal-case tracking-normal text-gray-400">
                      <span className="inline-flex items-center gap-1.5">
                        <span className={`w-1.5 h-1.5 rounded-full ${statusDotClass(status)}`} />
                        {status}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-cb-caption font-mono text-gray-300">
                      {row.elavonMID || '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
