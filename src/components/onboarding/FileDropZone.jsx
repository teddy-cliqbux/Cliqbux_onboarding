import { useState, useRef } from 'react';
import { Upload, FileText, Loader2, CheckCircle, AlertCircle, X } from 'lucide-react';
import { base44 } from '@/api/base44Client';

export default function FileDropZone({ onExtracted, corporateId }) {
  const [dragOver, setDragOver] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [file, setFile] = useState(null);
  const [status, setStatus] = useState('idle'); // idle | uploading | extracting | success | error | manual
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef(null);

  const handleFile = async (selectedFile) => {
    if (!selectedFile) return;
    setFile(selectedFile);
    setStatus('uploading');
    setErrorMsg('');

    try {
      // Upload file to Base44 storage
      const uploadResult = await base44.integrations.Core.UploadFile({ file: selectedFile });
      const fileUrl = uploadResult.file_url;

      setStatus('extracting');

      // Call AI extraction backend function
      const response = await base44.functions.invoke('processAIDocumentExtraction', {
        corporateId,
        fileUrl
      });

      const result = response.data;

      if (result?.extracted) {
        const { taxId, routingNumber, accountNumber } = result.extracted;
        const hasAnyData = taxId || routingNumber || accountNumber;

        if (hasAnyData) {
          setStatus('success');
          onExtracted({ taxId, routingNumber, accountNumber });
        } else {
          setStatus('manual');
          onExtracted({ taxId: null, routingNumber: null, accountNumber: null });
        }
      } else {
        throw new Error(result?.error || 'Extraction failed');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err.message || 'Something went wrong during extraction.');
      onExtracted({ taxId: null, routingNumber: null, accountNumber: null });
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragOver(false);
    const dropped = e.dataTransfer.files[0];
    if (dropped) handleFile(dropped);
  };

  const handleReset = () => {
    setFile(null);
    setStatus('idle');
    setErrorMsg('');
  };

  const isProcessing = status === 'uploading' || status === 'extracting';

  return (
    <div>
      {status === 'manual' && (
        <div className="mb-4 flex items-start gap-3 bg-amber-50 border border-amber-200 rounded-lg px-4 py-3">
          <AlertCircle className="w-4 h-4 text-amber-600 flex-shrink-0 mt-0.5" />
          <p className="text-amber-800 text-sm">
            <span className="font-semibold">Automatic extraction unavailable.</span> We couldn't read your document clearly. Please enter your banking information manually in the grid below.
          </p>
        </div>
      )}

      <div
        className={`drop-zone rounded-xl p-8 text-center cursor-pointer transition-all
          ${dragOver ? 'drag-over' : ''}
          ${status === 'success' ? 'border-green-300 bg-green-50' : ''}
          ${status === 'error' ? 'border-red-300 bg-red-50' : ''}
          ${isProcessing ? 'opacity-70 pointer-events-none' : ''}
        `}
        onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
        onDragLeave={() => setDragOver(false)}
        onDrop={handleDrop}
        onClick={() => !isProcessing && inputRef.current?.click()}
      >
        <input
          ref={inputRef}
          type="file"
          accept=".pdf,.jpg,.jpeg,.png,.xlsx,.csv"
          className="hidden"
          onChange={(e) => handleFile(e.target.files[0])}
        />

        {isProcessing ? (
          <div className="flex flex-col items-center gap-3">
            <Loader2 className="w-10 h-10 text-blue-500 animate-spin" />
            <div>
              <p className="font-semibold text-gray-700">
                {status === 'uploading' ? 'Uploading document...' : 'AI is extracting data...'}
              </p>
              <p className="text-gray-400 text-sm mt-1">
                {status === 'extracting' ? 'Analyzing for Tax ID, routing number & account number' : 'Please wait'}
              </p>
            </div>
          </div>
        ) : status === 'success' ? (
          <div className="flex flex-col items-center gap-3">
            <CheckCircle className="w-10 h-10 text-green-500" />
            <div>
              <p className="font-semibold text-gray-700">Data extracted successfully!</p>
              <p className="text-gray-400 text-sm mt-1">{file?.name}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleReset(); }}
              className="flex items-center gap-1.5 text-xs text-gray-400 hover:text-gray-600 mt-1"
            >
              <X className="w-3 h-3" /> Upload different file
            </button>
          </div>
        ) : status === 'error' ? (
          <div className="flex flex-col items-center gap-3">
            <AlertCircle className="w-10 h-10 text-red-400" />
            <div>
              <p className="font-semibold text-gray-700">Upload failed</p>
              <p className="text-gray-400 text-sm mt-1">{errorMsg}</p>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); handleReset(); }}
              className="text-xs text-blue-500 hover:underline"
            >
              Try again
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center gap-3">
            <div className="w-14 h-14 rounded-full bg-gray-100 flex items-center justify-center">
              <Upload className="w-7 h-7 text-gray-400" />
            </div>
            <div>
              <p className="font-semibold text-gray-700">Drop your EIN Letter or Voided Check here</p>
              <p className="text-gray-400 text-sm mt-1">or <span className="text-blue-500 font-medium">browse to upload</span></p>
            </div>
            <div className="flex items-center gap-2 mt-1">
              {['PDF', 'JPG', 'PNG'].map(fmt => (
                <span key={fmt} className="text-xs bg-gray-100 text-gray-500 px-2 py-0.5 rounded font-medium">{fmt}</span>
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}