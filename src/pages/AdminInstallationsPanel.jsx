/**
 * Light Installations panel — /admin/center/installations
 * No new backend; launch into Merchants / Applications / Underwriting Room.
 */
import { Link } from 'react-router-dom';
import { Building2, ClipboardList, FolderOpen, Wrench } from 'lucide-react';

export default function AdminInstallationsPanel() {
  return (
    <div className="space-y-6 max-w-3xl">
      <div>
        <div className="flex items-center gap-2 mb-1">
          <Wrench className="w-5 h-5 text-gray-500" />
          <h1 className="font-display text-cb-display text-white">Installations</h1>
        </div>
        <p className="text-cb-body-lg text-gray-400 mt-1">
          Go-live and installer work lives on each deal’s Underwriting Room. Open a merchant account,
          pick the deal, then use Applications or Underwriting Room for underwriting and post-submit
          setup — installer runbooks are not on this panel.
        </p>
      </div>

      <ul className="space-y-2">
        <li>
          <Link
            to="/admin/center/merchants"
            className="flex gap-3 bg-cb-surface border border-cb-border rounded-cb px-4 py-4 hover:border-cb-border-strong"
          >
            <Building2 className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-cb-body font-semibold text-white">Find a merchant account</p>
              <p className="text-cb-caption text-gray-500 mt-0.5">
                Open the company → deal → Underwriting Room for underwriting and installer checklist.
              </p>
            </div>
          </Link>
        </li>
        <li>
          <Link
            to="/admin/applications"
            className="flex gap-3 bg-cb-surface border border-cb-border rounded-cb px-4 py-4 hover:border-cb-border-strong"
          >
            <ClipboardList className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-cb-body font-semibold text-white">Applications desk</p>
              <p className="text-cb-caption text-gray-500 mt-0.5">
                Deal pipeline for prep, nudge, stuck forms, and underwriting handoff.
              </p>
            </div>
          </Link>
        </li>
        <li>
          <div className="flex gap-3 bg-cb-surface-raised border border-cb-border rounded-cb px-4 py-4">
            <FolderOpen className="w-5 h-5 text-gray-500 flex-shrink-0 mt-0.5" />
            <div>
              <p className="text-cb-body font-semibold text-white">Underwriting Room</p>
              <p className="text-cb-caption text-gray-500 mt-0.5">
                From an account’s deal row or Applications, open Underwriting Room. Installer phases
                and Template 2 statuses live there — not on this panel.
              </p>
            </div>
          </div>
        </li>
      </ul>
    </div>
  );
}
