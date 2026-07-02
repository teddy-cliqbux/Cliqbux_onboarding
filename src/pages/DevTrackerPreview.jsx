import ApplicationTracker from '@/components/onboarding/ApplicationTracker';

const STATUSES = ['DRAFT', 'SUBMITTED', 'UNDERWRITING_HOLD', 'APPROVED'];

// Dev-only visual harness for ApplicationTracker. Not part of the merchant
// onboarding flow — renders one instance per status so all states can be
// eyeballed at once. See /dev/tracker-preview route in App.jsx.
export default function DevTrackerPreview() {
  return (
    <div className="min-h-screen bg-gray-50 p-8">
      <div className="max-w-3xl mx-auto space-y-8">
        <div>
          <h1 className="text-xl font-bold text-gray-900">ApplicationTracker — Preview</h1>
          <p className="text-sm text-gray-500">Dev-only harness. Not linked from the merchant portal.</p>
        </div>

        {STATUSES.map((status) => (
          <div key={status} className="space-y-2">
            <span className="inline-block text-xs font-mono px-2 py-1 rounded bg-gray-200 text-gray-600">
              currentStatus="{status}"
            </span>
            <ApplicationTracker currentStatus={status} />
          </div>
        ))}
      </div>
    </div>
  );
}
