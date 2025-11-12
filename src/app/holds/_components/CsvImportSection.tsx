"use client";

import { useState, useEffect } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";

export default function CsvImportSection() {
  const [file, setFile] = useState<File | null>(null);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState<any>(null);
  const [duplicateHistory, setDuplicateHistory] = useState<any[]>([]);

  const loadImportHistory = async () => {
    try {
      const response = await fetch('/api/holds/import-history');
      const data = await response.json();
      if (data.success && data.sessions) {
        setDuplicateHistory(data.sessions);
      }
    } catch (error) {
      console.error('Error loading import history:', error);
    }
  };

  // Load import history on mount
  useEffect(() => {
    loadImportHistory();
  }, []);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selectedFile = e.target.files?.[0];
    if (selectedFile && selectedFile.type === 'text/csv') {
      setFile(selectedFile);
      setResult(null);
    } else {
      alert('Please select a valid CSV file');
    }
  };

  const handleUpload = async (forceImportOrderNumber?: string) => {
    if (!file) {
      alert('Please select a file first');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      if (forceImportOrderNumber) {
        formData.append('forceImportOrderNumber', forceImportOrderNumber);
      }

      const response = await fetch('/api/holds/import', {
        method: 'POST',
        body: formData,
      });

      const data = await response.json();
      
      if (data.success) {
        setResult(data);
        
        // Reload import history to show the new import (it's saved in DB by the import API)
        await loadImportHistory();
        
        // Only clear file if no force import (allow re-importing specific ones)
        if (!forceImportOrderNumber) {
          setFile(null);
          // Reset file input
          const fileInput = document.getElementById('csv-file') as HTMLInputElement;
          if (fileInput) fileInput.value = '';
        }
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

  const exportDuplicates = () => {
    if (!result?.results?.duplicateDetails || result.results.duplicateDetails.length === 0) {
      alert('No duplicates to export');
      return;
    }

    // Create CSV content
    const headers = ['Row in CSV', 'Order Number', 'Customer Email', 'Existing Status', 'Current Queue', 'Assigned To', 'Last Disposition', 'Import Date'];
    const rows = result.results.duplicateDetails.map((dup: any) => [
      dup.row,
      dup.orderNumber,
      dup.customerEmail || '',
      dup.existingStatus,
      dup.existingQueue || '',
      dup.assignedTo || 'Unassigned',
      dup.existingDisposition || '',
      dup.existingCreatedAt ? new Date(dup.existingCreatedAt).toLocaleString() : ''
    ]);

    const csvContent = [
      headers.join(','),
      ...rows.map(row => row.map(cell => `"${String(cell).replace(/"/g, '""')}"`).join(','))
    ].join('\n');

    // Download
    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `holds-duplicates-${new Date().toISOString().split('T')[0]}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    window.URL.revokeObjectURL(url);
  };

  return (
    <Card>
      <h2 className="text-xl font-semibold mb-4">📁 CSV Import</h2>
      <p className="text-white/70 mb-4">
        Import holds data from Google Sheets CSV. Expected columns:
        <br />• <span className="text-white/40">A: (Ignored)</span>
        <br />• B: Order Date
        <br />• C: Order Number
        <br />• D: Customer Email (e.g., customer@example.com)
        <br />• E: Priority (4-5)
        <br />• F: Days in System
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
          onClick={() => handleUpload()} 
          disabled={!file || uploading}
          className="w-full bg-blue-600 hover:bg-blue-700"
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
                <div className="flex items-center justify-between mb-2">
                  <h3 className="font-semibold text-purple-200">
                    🔄 Duplicate Orders Found ({result.results.duplicateDetails.length})
                  </h3>
                  <SmallButton 
                    onClick={exportDuplicates}
                    className="bg-green-600 hover:bg-green-700 text-xs"
                  >
                    📥 Export CSV
                  </SmallButton>
                </div>
                <p className="text-xs text-white/60 mb-3">
                  These orders already exist in the system. <strong className="text-purple-300">Existing tasks remain in their current queues.</strong> Review details below or force import individual orders if needed.
                </p>
                <div className="max-h-96 overflow-y-auto space-y-3">
                  {result.results.duplicateDetails.map((dup: any, idx: number) => (
                    <div key={idx} className="p-3 bg-white/5 rounded-lg border border-purple-500/20">
                      {/* Header */}
                      <div className="flex justify-between items-start mb-3 pb-2 border-b border-white/10">
                        <div>
                          <p className="font-semibold text-white">📦 {dup.orderNumber}</p>
                          <p className="text-white/60 text-xs">✉️ {dup.customerEmail || 'N/A'}</p>
                          <p className="text-white/50 text-xs">CSV Row: {dup.row}</p>
                        </div>
                        <div className="text-right">
                          <p className={`px-2 py-1 rounded text-xs font-medium ${
                            dup.existingStatus === 'COMPLETED' 
                              ? 'bg-green-500/20 text-green-300' 
                              : dup.existingStatus === 'IN_PROGRESS'
                              ? 'bg-blue-500/20 text-blue-300'
                              : 'bg-yellow-500/20 text-yellow-300'
                          }`}>
                            {dup.existingStatus}
                          </p>
                          <p className="text-white/70 font-medium mt-1">📍 {dup.existingQueue || 'Unknown'}</p>
                          {dup.assignedTo && (
                            <p className="text-blue-300 text-xs mt-1">👤 {dup.assignedTo}</p>
                          )}
                        </div>
                      </div>
                      
                      {/* Current Task Info */}
                      <div className="space-y-1 text-xs">
                        <p className="text-white/60">
                          <span className="text-white/50">First imported:</span> {dup.existingCreatedAt ? new Date(dup.existingCreatedAt).toLocaleString() : 'Unknown'}
                        </p>
                        {dup.existingDisposition && (
                          <p className="text-white/60">
                            <span className="text-white/50">Last disposition:</span> {dup.existingDisposition}
                          </p>
                        )}
                        
                        {/* Queue Journey for Duplicate */}
                        {dup.queueJourney && dup.queueJourney.length > 0 && (
                          <div className="mt-2 pt-2 border-t border-white/10">
                            <p className="text-white/50 mb-1">📍 Queue Journey:</p>
                            <div className="space-y-1 ml-2">
                              {dup.queueJourney.map((entry: any, jIdx: number) => (
                                <div key={jIdx} className="text-xs text-white/60">
                                  {jIdx + 1}. {entry.queue} 
                                  {entry.movedBy && ` (by ${entry.movedBy})`}
                                  {entry.disposition && ` - ${entry.disposition}`}
                                  {entry.source && (
                                    <span className={`ml-2 px-1 py-0.5 rounded text-xs ${
                                      entry.source === 'Auto-Import' 
                                        ? 'bg-purple-500/20 text-purple-300'
                                        : 'bg-blue-500/20 text-blue-300'
                                    }`}>
                                      {entry.source}
                                    </span>
                                  )}
                                </div>
                              ))}
                            </div>
                          </div>
                        )}
                      </div>
                      
                      {/* Force Import Button for Individual Order */}
                      <div className="mt-2 pt-2 border-t border-white/10">
                        <SmallButton 
                          onClick={() => handleUpload(dup.orderNumber)}
                          disabled={uploading}
                          className="w-full bg-orange-600 hover:bg-orange-700 text-xs"
                        >
                          ⚠️ Force Import This Order
                        </SmallButton>
                      </div>
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
        
        {/* Historical Duplicates */}
        {duplicateHistory.length > 0 && (
          <div className="mt-6 p-4 bg-blue-900/10 border border-blue-500/20 rounded-lg">
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold text-blue-200">
                📚 Duplicate History ({duplicateHistory.length} import{duplicateHistory.length > 1 ? 's' : ''})
              </h3>
              <SmallButton 
                onClick={loadImportHistory}
                className="bg-blue-600 hover:bg-blue-700 text-xs"
              >
                🔄 Refresh
              </SmallButton>
            </div>
            <p className="text-xs text-white/60 mb-3">
              Previous imports with duplicate detections (last 10 shown)
            </p>
            <div className="space-y-4">
              {duplicateHistory.map((session, sessionIdx) => (
                <div key={sessionIdx} className="p-3 bg-purple-900/20 border border-purple-500/30 rounded-lg">
                  <div className="flex items-center justify-between mb-2">
                    <div>
                      <div className="text-sm font-medium text-white">
                        📁 {session.fileName}
                      </div>
                      <div className="text-xs text-white/50">
                        {new Date(session.timestamp).toLocaleString()}
                      </div>
                    </div>
                    <div className="text-xs text-purple-300 font-medium">
                      {session.duplicates.length} duplicate{session.duplicates.length > 1 ? 's' : ''}
                    </div>
                  </div>
                  
                  <details className="mt-3" open={sessionIdx === 0}>
                    <summary className="text-xs text-white/70 cursor-pointer hover:text-white font-medium mb-2">
                      {sessionIdx === 0 ? '▼' : '▶'} View duplicates...
                    </summary>
                    <div className="mt-3 space-y-3 max-h-96 overflow-y-auto">
                      {session.duplicates.map((dup: any, dupIdx: number) => (
                        <div key={dupIdx} className="p-3 bg-white/5 rounded-lg border border-purple-500/20">
                          {/* Header */}
                          <div className="flex justify-between items-start mb-3 pb-2 border-b border-white/10">
                            <div>
                              <p className="font-semibold text-white">📦 {dup.orderNumber}</p>
                              <p className="text-white/60 text-xs">✉️ {dup.customerEmail || 'N/A'}</p>
                              <p className="text-white/50 text-xs">CSV Row: {dup.row}</p>
                            </div>
                            <div className="text-right">
                              <p className={`px-2 py-1 rounded text-xs font-medium ${
                                dup.existingStatus === 'COMPLETED' 
                                  ? 'bg-green-500/20 text-green-300' 
                                  : dup.existingStatus === 'IN_PROGRESS'
                                  ? 'bg-blue-500/20 text-blue-300'
                                  : 'bg-yellow-500/20 text-yellow-300'
                              }`}>
                                {dup.existingStatus}
                              </p>
                              <p className="text-white/70 font-medium mt-1">📍 {dup.existingQueue || 'Unknown'}</p>
                              {dup.assignedTo && (
                                <p className="text-blue-300 text-xs mt-1">👤 {dup.assignedTo}</p>
                              )}
                            </div>
                          </div>
                          
                          {/* Current Task Info */}
                          <div className="space-y-1 text-xs">
                            <p className="text-white/60">
                              <span className="text-white/50">First imported:</span> {dup.existingCreatedAt ? new Date(dup.existingCreatedAt).toLocaleString() : 'Unknown'}
                            </p>
                            {dup.existingDisposition && (
                              <p className="text-white/60">
                                <span className="text-white/50">Last disposition:</span> {dup.existingDisposition}
                              </p>
                            )}
                            
                            {/* Queue Journey for Duplicate */}
                            {dup.queueJourney && dup.queueJourney.length > 0 && (
                              <div className="mt-2 pt-2 border-t border-white/10">
                                <p className="text-white/50 mb-1">📍 Queue Journey:</p>
                                <div className="space-y-1 ml-2">
                                  {dup.queueJourney.map((entry: any, jIdx: number) => (
                                    <div key={jIdx} className="text-xs text-white/60">
                                      {jIdx + 1}. {entry.queue} 
                                      {entry.movedBy && ` (by ${entry.movedBy})`}
                                      {entry.disposition && ` - ${entry.disposition}`}
                                      {entry.source && (
                                        <span className={`ml-2 px-1 py-0.5 rounded text-xs ${
                                          entry.source === 'Auto-Import' 
                                            ? 'bg-purple-500/20 text-purple-300'
                                            : 'bg-blue-500/20 text-blue-300'
                                        }`}>
                                          {entry.source}
                                        </span>
                                      )}
                                    </div>
                                  ))}
                                </div>
                              </div>
                            )}
                          </div>
                          
                          {/* Force Import Button for Individual Order */}
                          <div className="mt-2 pt-2 border-t border-white/10">
                            <SmallButton 
                              onClick={() => {
                                // Need to re-upload the file for this specific order
                                alert(`To force import order ${dup.orderNumber}, please re-upload the CSV file and click the force import button for this specific order.`);
                              }}
                              className="w-full bg-orange-600 hover:bg-orange-700 text-xs"
                            >
                              ⚠️ Force Import This Order
                            </SmallButton>
                          </div>
                        </div>
                      ))}
                    </div>
                  </details>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
