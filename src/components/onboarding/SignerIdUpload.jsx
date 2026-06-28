import { useState, useRef } from 'react';
import { Upload, FileImage, CheckCircle2, Loader2, X, ExternalLink } from 'lucide-react';
import { base44 } from '@/api/base44Client';

const ACCEPTED = 'image/jpeg,image/png,image/webp,application/pdf';

export default function SignerIdUpload({ signer, corporateId, onUploaded }) {
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const [docUrl, setDocUrl] = useState(signer.idDocumentUrl || '');
  const inputRef = useRef(null);

  const handleFile = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) { setError('File must be under 10 MB.'); return; }
    setUploading(true);
    setError('');
    try {
      const { file_url } = await base44.integrations.Core.UploadFile({ file });
      // Persist to signer record
      await base44.functions.invoke('manageSigner', {
        action: 'update',
        corporateId,
        signerId: signer.id,
        signerData: { idDocumentUrl: file_url },
      });
      setDocUrl(file_url);
      if (onUploaded) onUploaded({ ...signer, idDocumentUrl: file_url });
    } catch (err) {
      setError('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files?.[0];
    if (file) handleFile(file);
  };

  const handleRemove = async () => {
    setUploading(true);
    setError('');
    try {
      await base44.functions.invoke('manageSigner', {
        action: 'update',
        corporateId,
        signerId: signer.id,
        signerData: { idDocumentUrl: '' },
      });
      setDocUrl('');
      if (onUploaded) onUploaded({ ...signer, idDocumentUrl: '' });
    } catch (_) {
      setError('Could not remove file.');
    } finally {
      setUploading(false);
    }
  };

  if (docUrl) {
    const isImage = /\.(jpe?g|png|webp)(\?|$)/i.test(docUrl);
    return (
      <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/25 rounded-xl px-3.5 py-2.5">
        <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
        <div className="flex-1 min-w-0">
          <p className="text-xs font-semibold text-green-300">ID Document Uploaded</p>
          <p className="text-[10px] text-green-500/80 truncate">{isImage ? 'Image' : 'PDF'} on file</p>
        </div>
        <a href={docUrl} target="_blank" rel="noopener noreferrer"
          className="p-1.5 text-green-400/70 hover:text-green-300 transition-colors" title="View document">
          <ExternalLink className="w-3.5 h-3.5" />
        </a>
        <button onClick={handleRemove} disabled={uploading}
          className="p-1.5 text-gray-500 hover:text-red-400 transition-colors" title="Remove">
          {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
        </button>
      </div>
    );
  }

  return (
    <div>
      <div
        className="border border-dashed border-white/15 hover:border-amber-500/40 rounded-xl px-4 py-4 flex flex-col items-center justify-center gap-2 cursor-pointer transition-colors group"
        onClick={() => inputRef.current?.click()}
        onDragOver={e => e.preventDefault()}
        onDrop={handleDrop}
      >
        {uploading ? (
          <Loader2 className="w-5 h-5 text-amber-400 animate-spin" />
        ) : (
          <FileImage className="w-5 h-5 text-gray-500 group-hover:text-amber-400 transition-colors" />
        )}
        <p className="text-xs font-semibold text-gray-400 group-hover:text-amber-300 transition-colors">
          {uploading ? 'Uploading…' : 'Upload Government ID'}
        </p>
        <p className="text-[10px] text-gray-600">Driver's license, passport, or state ID · JPG, PNG, PDF · Max 10 MB</p>
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED}
          className="hidden"
          onChange={e => handleFile(e.target.files?.[0])}
        />
      </div>
      {error && <p className="mt-1.5 text-[11px] text-red-400">{error}</p>}
    </div>
  );
}