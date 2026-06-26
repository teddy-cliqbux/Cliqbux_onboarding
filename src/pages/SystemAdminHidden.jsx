import React from 'react';

export default function SystemAdminHidden() {
  return (
    <div className="min-h-screen bg-gray-950 p-8">
      <div className="max-w-5xl mx-auto">
        <div className="text-xs font-mono text-gray-600 mb-6 tracking-wider uppercase">
          System Admin // Architecture (Hidden — Unindexed)
        </div>
        <div className="bg-gray-900 border border-gray-800 rounded-xl p-6 min-h-[70vh] overflow-auto">
          <pre className="text-sm text-gray-400 font-mono whitespace-pre-wrap break-words">
          </pre>
        </div>
      </div>
    </div>
  );
}