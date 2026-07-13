import { useState, useRef } from 'react';
import { Upload, FileText, Check, Loader2, X } from 'lucide-react';
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
    <div className="bg-cb-surface-raised border border-cb-border rounded-cb p-5">
      <h3 className="text-cb-body font-semibold text-white mb-0.5">Store Menu / Product Inventory Sheet</h3>
      <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500 mb-4">
        Upload your store menu or inventory list so our team can pre-load your product grid. Accepted: .pdf, .csv, .xlsx
      </p>

      {status === 'done' ? (
        <div className="flex items-center gap-3 bg-cb-bg border border-cb-border rounded-cb px-4 py-3">
          <span className="flex items-center justify-center w-7 h-7 rounded-full bg-cb-success/15 flex-shrink-0">
            <Check className="w-3.5 h-3.5 text-cb-success" strokeWidth={3} />
          </span>
          <div className="flex-1 min-w-0">
            <p className="text-cb-body font-medium text-white truncate">{file.name}</p>
          </div>
          <button onClick={reset} className="text-gray-500 hover:text-white p-1 transition-colors">
            <X className="w-4 h-4" />
          </button>
        </div>
      ) : (
        <>
          {/* File type selector */}
          <div className="flex gap-1 mb-3 bg-cb-bg border border-cb-border rounded-cb p-1">
            {['menu', 'inventory'].map((t) => (
              <button
                key={t}
                onClick={() => setFileType(t)}
                className={`flex-1 text-cb-body font-medium px-3 py-1.5 rounded-cb transition-colors ${
                  fileType === t ? 'bg-cb-accent-muted text-cb-accent' : 'text-gray-400 hover:text-white'
                }`}
              >
                {t === 'menu' ? 'Menu' : 'Inventory'}
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
            className={`border border-dashed rounded-cb p-6 text-center transition-colors cursor-pointer ${
              file ? 'border-cb-accent/50 bg-cb-accent-muted' : 'border-cb-border-strong hover:border-cb-accent/40'
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
                <FileText className="w-5 h-5 text-cb-accent" />
                <span className="text-cb-body font-medium text-white">{file.name}</span>
              </div>
            ) : (
              <div className="flex flex-col items-center gap-1">
                <Upload className="w-6 h-6 text-gray-500" />
                <p className="text-cb-body font-medium text-gray-300">Drag & drop or click to upload</p>
                <p className="text-cb-caption normal-case tracking-normal font-normal text-gray-500">.pdf, .csv, .xlsx</p>
              </div>
            )}
          </div>

          {error && <p className="text-cb-caption normal-case tracking-normal font-normal text-cb-danger mt-2">{error}</p>}

          <button
            onClick={upload}
            disabled={!file || status === 'uploading'}
            className="w-full mt-3 flex items-center justify-center gap-2 bg-cb-accent hover:opacity-90 disabled:bg-cb-bg disabled:text-gray-600 disabled:border disabled:border-cb-border text-cb-bg font-semibold py-2.5 rounded-cb text-cb-body transition-colors"
          >
            {status === 'uploading' ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
            {status === 'uploading' ? 'Uploading...' : 'Upload'}
          </button>
        </>
      )}
    </div>
  );
}
