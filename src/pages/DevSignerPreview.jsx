import { useState } from 'react';
import SignerDetailsModal from '@/components/onboarding/SignerDetailsModal';

// DEV-ONLY preview of the signer details/verification modal with fake data —
// lets us eyeball the UI without a merchant session (backend calls will 401,
// which is expected here). Route: /dev/signer-preview (DEV builds only).
const FAKE_PRIMARY = {
  id: 'dev-1',
  firstName: 'Teddy',
  lastName: 'Elsenbaumer',
  signerEmail: 'teddy@cliqbuxpos.com',
  ownershipPercentage: 25,
  isPrimarySigner: true,
  identityStatus: 'Pending Invitation',
};

const FAKE_SECONDARY = {
  id: 'dev-2',
  firstName: 'Jane',
  lastName: 'Smith',
  signerEmail: 'jane@example.com',
  ownershipPercentage: 30,
  isPrimarySigner: false,
  identityStatus: 'Sent',
};

const FAKE_PROFILE = { corporateId: 'dev-preview', titleType: '', firstName: 'Teddy', lastName: 'Elsenbaumer' };

export default function DevSignerPreview() {
  const [open, setOpen] = useState(null); // null | 'primary' | 'secondary'

  return (
    <div className="min-h-screen bg-[#0d0f13] text-white p-10 space-y-4">
      <h1 className="text-lg font-bold">Dev: Signer Details Modal Preview</h1>
      <p className="text-sm text-gray-400">Save/lookup calls will fail without a merchant session — layout preview only.</p>
      <div className="flex gap-3">
        <button onClick={() => setOpen('primary')} className="text-sm font-bold text-black bg-amber-500 px-4 py-2 rounded-xl">
          Open primary signer modal (with verification)
        </button>
        <button onClick={() => setOpen('secondary')} className="text-sm font-semibold text-gray-300 border border-white/20 px-4 py-2 rounded-xl">
          Open non-primary signer modal (contact only)
        </button>
      </div>
      {open && (
        <SignerDetailsModal
          signer={open === 'primary' ? FAKE_PRIMARY : FAKE_SECONDARY}
          corporateId={FAKE_PROFILE.corporateId}
          profile={FAKE_PROFILE}
          onSaved={() => {}}
          onClose={() => setOpen(null)}
        />
      )}
    </div>
  );
}
