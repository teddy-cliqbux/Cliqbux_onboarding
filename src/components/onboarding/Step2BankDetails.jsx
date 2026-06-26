import { useState } from 'react';
import { Save, Send, Loader2, Info, Plus } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import FileDropZone from './FileDropZone';
import LocationsGrid from './LocationsGrid';
import AddLocationModal from './AddLocationModal';

export default function Step2BankDetails({ profile, locations: initialLocations, plaidAccounts = [], onStatusChange }) {
  const [locations, setLocations] = useState(initialLocations);
  const [locationRows, setLocationRows] = useState([]);
  const [corporateRouting, setCorporateRouting] = useState('');
  const [corporateAccount, setCorporateAccount] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [saving, setSaving] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [saveSuccess, setSaveSuccess] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [submissionResults, setSubmissionResults] = useState([]);

  const handleExtracted = ({ routingNumber, accountNumber }) => {
    if (routingNumber) setCorporateRouting(routingNumber);
    if (accountNumber) setCorporateAccount(accountNumber);
  };

  const handleLocationsChange = (rows) => {
    setLocationRows(rows);
  };

  const handleLocationAdded = (newLocation) => {
    setLocations(prev => [...prev, { ...newLocation, hasRoutingNumber: false, hasAccountNumber: false }]);
  };

  // Submit enabled when at least 1 location exists and all non-approved locations have banking
  const canSubmit = locations.length >= 1 && locationRows.length > 0 && locationRows.every(
    row => row.applicationStepStatus === 'Approved' || (row.routingInput && row.accountInput)
  );

  const handleSave = async () => {
    setSaving(true);
    setSaveSuccess(false);
    try {
      const toSave = locationRows
        .filter(row => row.applicationStepStatus !== 'Approved')
        .map(row => ({ id: row.id, routingNumber: row.routingInput, accountNumber: row.accountInput }));
      await base44.functions.invoke('saveLocationBankDetails', { locations: toSave });
      setSaveSuccess(true);
      setTimeout(() => setSaveSuccess(false), 3000);
    } catch (err) {
      console.error(err);
    } finally {
      setSaving(false);
    }
  };

  const handleSubmitToElavon = async () => {
    await handleSave();
    setSubmitting(true);
    setSubmitError('');
    setSubmissionResults([]);

    try {
      const response = await base44.functions.invoke('submitToElavon', { corporateId: profile.corporateId });
      const data = response.data;
      setSubmissionResults(data.results || []);

      if (data.allSubmitted) {
        onStatusChange('Submitted');
      } else {
        const errorResults = (data.results || []).filter(r => r.status === 'error');
        setSubmitError(`Submission failed for ${errorResults.length} location(s). Please review and retry.`);
        const refreshed = await base44.functions.invoke('getMerchantData', { corporateId: profile.corporateId });
        if (refreshed.data?.locations) setLocations(refreshed.data.locations);
      }
    } catch (err) {
      setSubmitError(err.message || 'Submission failed. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleRetryFailed = async () => {
    const failedIds = submissionResults.filter(r => r.status === 'error').map(r => r.locationId);
    if (failedIds.length === 0) return;
    setSubmitting(true);
    setSubmitError('');
    try {
      const response = await base44.functions.invoke('submitToElavon', {
        corporateId: profile.corporateId,
        locationIds: failedIds
      });
      const data = response.data;
      setSubmissionResults(data.results || []);
      if (data.allSubmitted) {
        onStatusChange('Submitted');
      } else {
        const errorResults = (data.results || []).filter(r => r.status === 'error');
        setSubmitError(`Still failing for ${errorResults.length} location(s).`);
      }
    } catch (err) {
      setSubmitError(err.message || 'Retry failed.');
    } finally {
      setSubmitting(false);
    }
  };

  const hasPendingFailures = submissionResults.some(r => r.status === 'error');

  return (
    <div className="flex flex-col">
      {/* Header */}
      <div className="px-8 pt-8 pb-6 border-b border-gray-100">
        <div className="inline-flex items-center gap-2 bg-blue-50 text-blue-700 text-xs font-semibold px-3 py-1.5 rounded-full mb-3">
          <span className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          STEP 3 OF 3 — LOCATIONS &amp; BANKING
        </div>
        <div className="flex items-center justify-between gap-4">
          <div>
            <h2 className="text-2xl font-bold text-gray-900 mb-1.5">Add Your Business Locations</h2>
            <p className="text-gray-500 text-sm">
              Add each storefront, then assign a bank account for each location.
            </p>
          </div>
          <button
            onClick={() => setShowAddModal(true)}
            className="flex-shrink-0 flex items-center gap-2 text-sm font-semibold text-white bg-gray-900 hover:bg-gray-800 px-5 py-2.5 rounded-xl transition-all shadow-sm"
          >
            <Plus className="w-4 h-4" />
            Add Business Location
          </button>
        </div>
      </div>

      <div className="px-8 py-6 flex flex-col gap-8">
        {/* Document Upload — hidden when Plaid already connected */}
        {plaidAccounts.length === 0 && (
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
        )}

        {/* Locations Section */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-semibold text-gray-800 text-sm">
              Location Banking Details
              <span className="ml-2 text-xs text-gray-400 font-normal">({locations.length} location{locations.length !== 1 ? 's' : ''})</span>
            </h3>
            {locationRows.length > 0 && (
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 text-sm font-semibold text-blue-600 hover:text-blue-700 border border-blue-200 hover:border-blue-300 bg-blue-50 hover:bg-blue-100 px-4 py-2 rounded-lg transition-all disabled:opacity-60"
              >
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saveSuccess ? 'Saved!' : 'Save'}
              </button>
            )}
          </div>

          <LocationsGrid
            locations={locations}
            corporateRouting={corporateRouting}
            corporateAccount={corporateAccount}
            plaidAccounts={plaidAccounts}
            onLocationsChange={handleLocationsChange}
          />
        </div>

        {/* Error message */}
        {submitError && (
          <div className="flex items-start gap-3 bg-red-50 border border-red-200 rounded-xl px-5 py-4">
            <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0 mt-0.5">
              <span className="text-red-600 text-xs font-bold">!</span>
            </div>
            <div className="flex-1">
              <p className="text-red-800 text-sm font-semibold">Submission Error</p>
              <p className="text-red-600 text-xs mt-0.5">{submitError}</p>
            </div>
            {hasPendingFailures && (
              <button
                onClick={handleRetryFailed}
                disabled={submitting}
                className="text-xs font-semibold text-red-700 border border-red-300 bg-red-50 hover:bg-red-100 px-3 py-1.5 rounded-lg transition-colors flex-shrink-0"
              >
                Retry Failed
              </button>
            )}
          </div>
        )}

        {/* Submit CTA */}
        <div className="pb-2">
          <button
            onClick={handleSubmitToElavon}
            disabled={!canSubmit || submitting}
            className="w-full flex items-center justify-center gap-3 bg-gray-900 hover:bg-gray-800 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-4 px-6 rounded-xl text-base transition-all shadow-lg shadow-gray-900/20 disabled:shadow-none"
          >
            {submitting ? (
              <><Loader2 className="w-5 h-5 animate-spin" /> Submitting Applications...</>
            ) : (
              <><Send className="w-5 h-5" /> Submit Applications to Bank</>
            )}
          </button>
          {locations.length === 0 && (
            <p className="text-center text-xs text-gray-400 mt-3">
              Add at least one business location above before submitting.
            </p>
          )}
          {locations.length > 0 && !canSubmit && locationRows.length > 0 && (
            <p className="text-center text-xs text-gray-400 mt-3">
              Select a bank account for all locations to continue.
            </p>
          )}
        </div>
      </div>

      {/* Add Location Modal */}
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