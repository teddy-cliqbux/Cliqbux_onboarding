import { useState, useRef } from 'react';
import { Upload, FileText, CheckCircle2, Loader2, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

const ALLOWED = ['.pdf', '.csv', '.xlsx'];

export default function InventoryUpload({ corporateId }) {
  const [file, setFile] = useState(null);
  const [fileType, setFileType] = useState('menu');
  const [status, setStatus] = useState('idle'); // idle | uploading | done | error
  const [error, setError] = useState('');
  const inputRef = useRef(null);

  const upload = async () => {
    if (!file) { setError('Select a file first.'); return; }
    setStatus('uploading');
    setError('');
    try {
      const uploadRes = await base44.integrations.Core.UploadFile({ file });
      const fileUrl = uploadRes.file_url;
      const ext = file.name.substring(file.name.lastIndexOf('.')).toLowerCase();
      await invokePortalFunction('saveInventoryFile', {
        corporateId,
        fileName: file.name,
        fileType,
        fileUrl,
        fileExtension: ext,
      });
      setStatus('done');
    } catch (err) {
      setStatus('error');
      setError(err.message || 'Upload failed.');
    }
  };

  const reset = () => {
    setFile(null);
    setStatus('idle');
    setError('');
    if (inputRef.current) inputRef.current.value = '';
  };

  return (
    <div className="border border-gray-200 rounded-xl p-5">
      <h3 className="text-sm font-bold text-gray-900 mb-0.5">Store Menu / Product Inventory Sheet</h3>
      <p className="text-xs text-gray-500 mb-4">
        Upload your store menu or inventory list so our team can pre-load your product grid. Accepted: .pdf, .csv, .xlsx
      </p>

      {status === 'done' ? (
        <div className="flex items-center gap-3 bg-green-50 border border-green-200 rounded-lg px-4 py-3">
          <CheckCircle2 className="w-5 h-5 text-green-600 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-semibold text-green-800">{file.name}</p>
          </div>
          <button onClick={reset} className="text-gray-400 hover:text-gray-600 p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          {/* File type selector */}
          <div className="flex gap-2 mb-3">
            {['menu', 'inventory'].map((t) => (
              <button
                key={t}
                onClick={() => setFileType(t)}
                className={`text-xs font-semibold px-3 py-1.5 rounded-full border transition-colors ${
                  fileType === t ? 'bg-gray-900 text-white border-gray-900' : 'bg-white text-gray-600 border-gray-200 hover:border-gray-300'
                }`}
              >
                {t === 'menu' ? '🍽 Menu' : '📦 Inventory'}
              </button>
            ))}
          </div>

          {/* Drop zone */}
          <div
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => {
              e.preventDefault();
              const f = e.dataTransfer.files[0];
              if (!f) return;
              setFile(f);
              setError('');
            }}
            onClick={() => inputRef.current?.click()}
            className={`border-2 border-dashed rounded-lg p-6 text-center transition-colors cursor-pointer ${
              file ? 'border-blue-400 bg-blue-50' : 'border-gray-300 hover:border-gray-400'
            }`}
          >
            <input
              ref={inputRef}
              type="file"
              accept={ALLOWED.join(',')}
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) { setFile(f); setError(''); }
              }}
            />
            {file ? (
              <div className="flex items-center justify-center gap-2">
                <FileText className="w-5 h-5 text-blue-500" />
                <span className="text-sm font-semibold text-gray-900">{file.name}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Upload className="w-6 h-6 text-gray-400" />
                <p className="text-sm text-gray-600 font-semibold">Drag & drop or click to upload</p>
                <p className="text-xs text-gray-400">.pdf, .csv, .xlsx</p>
              </div>
            )}
          </div>

          {error && <p className="text-xs text-red-500 mt-2">{error}</p>}

          <button
            onClick={upload}
            disabled={!file || status === 'uploading'}
            className="w-full mt-3 flex items-center justify-center gap-2 bg-amber-500 hover:bg-amber-600 disabled:bg-gray-200 disabled:text-gray-400 text-white font-bold py-2.5 rounded-lg text-sm transition-colors"
          >
            {status === 'uploading' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {status === 'uploading' ? 'Uploading...' : 'Upload'}
          </button>
        </>
      )}
    </div>
  );
}