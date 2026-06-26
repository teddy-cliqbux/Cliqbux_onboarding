import { useState } from 'react';
import { Plus, Info, ArrowRight, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import FileDropZone from '@/components/onboarding/FileDropZone';
import LocationsGrid from '@/components/onboarding/LocationsGrid';
import AddLocationModal from '@/components/onboarding/AddLocationModal';

export default function OnboardingLocations({ profile, locations: initialLocations, onContinue }) {
  const [locations, setLocations] = useState(initialLocations);
  const [locationRows, setLocationRows] = useState([]);
  const [corporateRouting, setCorporateRouting] = useState('');
  const [corporateAccount, setCorporateAccount] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

  const handleExtracted = ({ routingNumber, accountNumber }) => {
    if (routingNumber) setCorporateRouting(routingNumber);
    if (accountNumber) setCorporateAccount(accountNumber);
  };

  const handleLocationAdded = (newLocation) => {
    setLocations(prev => [...prev, { ...newLocation }]);
  };

  const locationsBankingReady = locations.length >= 1 && locationRows.length > 0 && locationRows.every(
    row => row.applicationStepStatus === 'Approved' || (row.bankDetails?.routingNumber && row.bankDetails?.accountNumber)
  );

  const handleSaveAndContinue = async () => {
    setSaving(true);
    try {
      const toSave = locationRows
        .filter(row => row.applicationStepStatus !== 'Approved')
        .map(row => ({ id: row.id, bankDetails: row.bankDetails }));
      if (toSave.length > 0) {
        await base44.functions.invoke('saveLocationBankDetails', { locations: toSave });
      }
      onContinue({ locations, locationRows });
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-gray-100">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          STEP 2 OF 3 — LOCATIONS &amp; BANKING
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1.5">Add Your Business Locations</h2>
            <p className="text-gray-500 text-sm">Add each storefront, then assign a bank account for each location.</p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-shrink-0 flex items-center gap-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 px-5 py-2.5 rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Location
          </button>
        </div>
      </div>

      <div className="px-8 py-6 flex flex-col gap-8">
        {/* Document Upload — AI extraction for EIN/banking */}
        <div>
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-semibold text-gray-800 text-sm">Document Upload (AI Extraction)</h3>
            <div className="flex items-center gap-1.5 text-xs text-gray-400">
              <Info className="w-3.5 h-3.5" />
              <span>EIN Letter or Voided Check</span>
            </div>
          </div>
          <FileDropZone onExtracted={handleExtracted} corporateId={profile.corporateId} />
          {(corporateRouting || corporateAccount) && (
            <div className="mt-3 flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
              <div className="w-2 h-2 rounded-full bg-green-500 flex-shrink-0" />
              <p className="text-green-800 text-xs">
                <span className="font-semibold">Banking details captured.</span> Toggle "Corp Acct" on any location row to apply them automatically.
              </p>
            </div>
          )}
        </div>

        {/* Locations Grid */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 text-sm">
              Location Banking Details
              <span className="ml-2 text-xs text-gray-400 font-normal">({locations.length} location{locations.length !== 1 ? 's' : ''})</span>
            </h3>
          </div>
          <LocationsGrid
            corporateId={profile.corporateId}
            locations={locations}
            corporateRouting={corporateRouting}
            corporateAccount={corporateAccount}
            onLocationsChange={setLocationRows}
          />
        </div>

        {/* Continue CTA */}
        <div className="pb-2">
          <button
            onClick={handleSaveAndContinue}
            disabled={!locationsBankingReady || saving}
            className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 px-6 rounded-xl text-base transition-all shadow-lg shadow-gray-900/20 disabled:shadow-none"
          >
            {saving ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Saving...</>
            ) : (
              <>Continue to Verification <ArrowRight className="w-5 h-5" /></>
            )}
          </button>
          {locations.length === 0 && (
            <p className="text-center text-xs text-gray-400 mt-3">Add at least one business location to continue.</p>
          )}
          {locations.length > 0 && !locationsBankingReady && locationRows.length > 0 && (
            <p className="text-center text-xs text-gray-400 mt-3">Assign a bank account to every location to continue.</p>
          )}
        </div>
      </div>

      {showAddModal && (
        <AddLocationModal
          corporateId={profile.corporateId}
          onLocationAdded={handleLocationAdded}
          onClose={() => setShowAddModal(false)}
        />
      )}
    </div>
  );
}