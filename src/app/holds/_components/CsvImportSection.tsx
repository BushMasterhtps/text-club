"use client";

import { useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";

export default function CsvImportSection() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      setResult(null);
    } else {
      alert('Please select a valid CSV file');
    }
  };

  const handleUpload = async () => {
    if (!file) {
      alert('Please select a file first');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const response = await fetch('/api/holds/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.success) {
        setResult(data);
        setFile(null);
        // Reset file input
        const fileInput = document.getElementById('csv-file') as HTMLInputElement;
        if (fileInput) fileInput.value = '';
      } else {
        alert(`Import failed: ${data.error}`);
      }
    } catch (error) {
      console.error('Upload error:', error);
      alert('Upload failed. Please try again.');
    } finally {
      setUploading(false);
    }
  };

  return (
    <Card>
      <h2 className="text-xl font-semibold mb-4">📁 CSV Import</h2>
      <p className="text-white/70 mb-4">
        Import holds data from Google Sheets CSV. Expected columns:
        <br />• A: Order Date
        <br />• B: Order Number
        <br />• C: Customer Email
        <br />• D: Priority (4-5)
        <br />• E: Days in System
      </p>
      
      <div className="space-y-4">
        <div>
          <input
            id="csv-file"
            type="file"
            accept=".csv"
            onChange={handleFileChange}
            className="block w-full text-sm text-white/70 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-600 file:text-white hover:file:bg-blue-700"
          />
        </div>
        
        <SmallButton 
          onClick={handleUpload} 
          disabled={!file || uploading}
          className="w-full"
        >
          {uploading ? 'Uploading...' : 'Import CSV'}
        </SmallButton>
        
        {result && (
          <div className="mt-4 space-y-4">
            {/* Summary */}
            <div className="p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
              <h3 className="font-semibold text-green-200 mb-2">Import Results:</h3>
              <div className="text-sm text-green-100 space-y-1">
                <p>✅ Imported: {result.results?.imported || 0} new tasks</p>
                <p>🔄 Duplicates: {result.results?.duplicates || 0} skipped</p>
                <p>❌ Errors: {result.results?.errors || 0}</p>
                <p>📊 Total Rows: {result.results?.totalRows || 0}</p>
              </div>
            </div>
            
            {/* Duplicates Details */}
            {result.results?.duplicateDetails && result.results.duplicateDetails.length > 0 && (
              <div className="p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                <h3 className="font-semibold text-purple-200 mb-2">
                  🔄 Duplicate Orders Found ({result.results.duplicateDetails.length})
                </h3>
                <p className="text-xs text-white/60 mb-3">
                  These orders already exist in the system and were not re-imported:
                </p>
                <div className="max-h-60 overflow-y-auto space-y-2">
                  {result.results.duplicateDetails.map((dup: any, idx: number) => (
                    <div key={idx} className="p-2 bg-white/5 rounded border border-white/10 text-xs">
                      <div className="flex justify-between items-start">
                        <div>
                          <p className="font-medium text-white">Order: {dup.orderNumber}</p>
                          <p className="text-white/60">Email: {dup.customerEmail || 'N/A'}</p>
                          <p className="text-white/60">Row {dup.row} in CSV</p>
                        </div>
                        <div className="text-right">
                          <p className={`px-2 py-0.5 rounded text-xs ${
                            dup.existingStatus === 'COMPLETED' 
                              ? 'bg-green-500/20 text-green-300' 
                              : 'bg-yellow-500/20 text-yellow-300'
                          }`}>
                            {dup.existingStatus}
                          </p>
                          <p className="text-white/50 mt-1">{dup.existingQueue || 'Unknown Queue'}</p>
                          {dup.assignedTo && (
                            <p className="text-blue-300 mt-1">{dup.assignedTo}</p>
                          )}
                        </div>
                      </div>
                      {dup.existingDisposition && (
                        <p className="text-white/60 mt-1">Last action: {dup.existingDisposition}</p>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
            
            {/* Error Details */}
            {result.results?.errorDetails && result.results.errorDetails.length > 0 && (
              <div className="p-3 bg-red-900/20 border border-red-500/30 rounded-lg">
                <h3 className="font-semibold text-red-200 mb-2">
                  ❌ Errors ({result.results.errorDetails.length})
                </h3>
                <div className="max-h-40 overflow-y-auto space-y-1 text-xs">
                  {result.results.errorDetails.map((err: any, idx: number) => (
                    <p key={idx} className="text-red-100">
                      Row {err.row}: {err.reason || err.error}
                    </p>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
