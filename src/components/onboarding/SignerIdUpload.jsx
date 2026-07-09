import { useState, useRef } from 'react';
import { Upload, FileImage, CheckCircle2, Loader2, X, ExternalLink, Eye, EyeOff } from 'lucide-react';
import { base44 } from '@/api/base44Client';
import { invokePortalFunction } from '@/lib/merchantAuthFetch';

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
      await invokePortalFunction('manageSigner', {
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
      await invokePortalFunction('manageSigner', {
        action: 'update',
        corporateId,
        signerId: signer.id,
        signerData: { idDocumentUrl: '' },
      });
      setDocUrl('');
      if (onUploaded) onUploaded({ ...signer, idDocumentUrl: '' });
    } catch (err) {
      console.error('[SignerIdUpload.handleRemove]', err?.message || 'Unknown error');
      setError('Could not remove file.');
    } finally {
      setUploading(false);
    }
  };

  const [previewOpen, setPreviewOpen] = useState(false);

  if (docUrl) {
    const isImage = /\.(jpe?g|png|webp)(\?|$)/i.test(docUrl) || /image\//i.test(docUrl);
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-3 bg-green-500/10 border border-green-500/25 rounded-xl px-3.5 py-2.5">
          <CheckCircle2 className="w-4 h-4 text-green-400 flex-shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-xs font-semibold text-green-300">ID Document Uploaded</p>
            <p className="text-[10px] text-green-500/80">{isImage ? 'Image' : 'PDF'} on file</p>
          </div>
          <button onClick={() => setPreviewOpen(p => !p)}
            className="p-1.5 text-green-400/70 hover:text-green-300 transition-colors" title={previewOpen ? 'Hide preview' : 'Preview document'}>
            {previewOpen ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          </button>
          <a href={docUrl} target="_blank" rel="noopener noreferrer"
            className="p-1.5 text-green-400/70 hover:text-green-300 transition-colors" title="Open in new tab">
            <ExternalLink className="w-3.5 h-3.5" />
          </a>
          <button onClick={handleRemove} disabled={uploading}
            className="p-1.5 text-gray-500 hover:text-red-400 transition-colors" title="Remove">
            {uploading ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <X className="w-3.5 h-3.5" />}
          </button>
        </div>

        {previewOpen && (
          <div className="rounded-xl overflow-hidden border border-white/10 bg-black/30">
            {isImage ? (
              <img src={docUrl} alt="ID Document" className="w-full max-h-72 object-contain" />
            ) : (
              <iframe src={docUrl} title="ID Document" className="w-full h-72 border-0" />
            )}
          </div>
        )}
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