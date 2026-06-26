import { useState } from 'react';
import { Plus, ArrowRight, Loader2 } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import LocationsGrid from '@/components/onboarding/LocationsGrid';
import AddLocationModal from '@/components/onboarding/AddLocationModal';

export default function OnboardingLocations({ profile, locations: initialLocations, onContinue }) {
  const [locations, setLocations] = useState(initialLocations);
  const [locationRows, setLocationRows] = useState([]);
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);

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
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-1.5">Add Your Business Locations</h2>
          <p className="text-gray-500 text-sm mb-4">Add each storefront, then assign a bank account for each location.</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="w-full flex items-center justify-center gap-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 px-5 py-3 rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            + Add Business Location
          </button>
        </div>
      </div>

      <div className="px-8 py-6 flex flex-col gap-8">
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