import { Building2 } from 'lucide-react';

export default function SuccessScreen({ profile, locations }) {
  return (
    <div className="px-8 py-12 flex flex-col items-center text-center">
      {/* Animated checkmark */}
      <div className="animate-checkmark mb-8">
        <div className="w-24 h-24 rounded-full bg-green-100 flex items-center justify-center">
          <svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
            <circle cx="24" cy="24" r="22" fill="#22C55E" />
            <path
              className="animate-check-path"
              d="M13 24L21 32L35 16"
              stroke="white"
              strokeWidth="3.5"
              strokeLinecap="round"
              strokeLinejoin="round"
              fill="none"
            />
          </svg>
        </div>
      </div>

      <div className="mb-8 max-w-md">
        <h2 className="text-3xl font-bold text-gray-900 mb-3">
          Applications Submitted!
        </h2>
        <p className="text-gray-500 text-base leading-relaxed">
          All merchant accounts are now being processed by Elavon. You will receive confirmation emails at{' '}
          <span className="font-semibold text-gray-700">{profile.signerEmail}</span>{' '}
          for each location.
        </p>
      </div>

      {/* Summary table */}
      {locations && locations.length > 0 && (
        <div className="w-full max-w-lg">
          <h3 className="text-sm font-semibold text-gray-500 uppercase tracking-wider mb-4 text-left">
            Submitted Locations
          </h3>
          <div className="rounded-xl border border-gray-100 overflow-hidden bg-gray-50">
            {locations.map((loc, idx) => (
              <div
                key={loc.id}
                className={`flex items-center justify-between px-5 py-4 ${
                  idx !== locations.length - 1 ? 'border-b border-gray-100' : ''
                }`}
              >
                <div className="flex items-center gap-3">
                  <div className="w-8 h-8 rounded-full bg-green-100 flex items-center justify-center flex-shrink-0">
                    <Building2 className="w-4 h-4 text-green-600" />
                  </div>
                  <div className="text-left">
                    <p className="font-semibold text-gray-900 text-sm">{loc.dbaName}</p>
                    <p className="text-xs text-gray-400">{loc.businessAddress}</p>
                  </div>
                </div>
                {loc.elavonMID ? (
                  <div className="text-right">
                    <p className="text-xs text-gray-400">Elavon MID</p>
                    <p className="font-mono font-bold text-gray-800 text-sm">{loc.elavonMID}</p>
                  </div>
                ) : (
                  <span className="text-xs text-green-600 font-semibold bg-green-50 px-2 py-1 rounded-full border border-green-200">
                    ✓ Submitted
                  </span>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mt-10 pt-8 border-t border-gray-100 w-full max-w-lg">
        <p className="text-xs text-gray-400">
          Questions? Contact your Cliqbux representative or email{' '}
          <a href="mailto:support@cliqbux.com" className="text-blue-500 hover:underline font-medium">
            support@cliqbux.com
          </a>
        </p>
      </div>
    </div>
  );
}