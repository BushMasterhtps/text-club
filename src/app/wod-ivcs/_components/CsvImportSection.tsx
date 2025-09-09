"use client";

import { useState } from "react";
import { Card } from "@/app/_components/Card";
import { SmallButton } from "@/app/_components/SmallButton";

interface ImportResult {
  imported: number;
  duplicates: number;
  errors: number;
  filtered: number;
  duplicateDetails: any[];
  errorDetails: any[];
}

interface CsvImportSectionProps {
  onImportComplete?: () => void;
}

export function CsvImportSection({ onImportComplete }: CsvImportSectionProps = {}) {
  const [selectedSource, setSelectedSource] = useState<string>("");
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [importing, setImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [clearing, setClearing] = useState(false);

  const sources = [
    {
      value: "INVALID_CASH_SALE",
      label: "GH | Pending - Invalid Cash Sale Results",
      description: "Import invalid cash sale data from NetSuite",
    },
    {
      value: "ORDERS_NOT_DOWNLOADING", 
      label: "GH | Orders Not Downloading to WMS (Public)",
      description: "Import orders not downloading to WMS data (excludes $0 discrepancies)",
    },
    {
      value: "SO_VS_WEB_DIFFERENCE",
      label: "GHM | SO vs Web Order Difference (Small Differences)",
      description: "Import sales order vs web order differences for small differences",
    },
  ];

  const handleFileSelect = (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (file) {
      setSelectedFile(file);
      setImportResult(null);
    }
  };

  const clearResults = () => {
    setImportResult(null);
  };

  const handleImport = async () => {
    if (!selectedFile || !selectedSource) {
      alert("Please select both a source and a file");
      return;
    }

    setImporting(true);
    try {
      const formData = new FormData();
      formData.append("file", selectedFile);
      formData.append("source", selectedSource);

      const response = await fetch("/api/wod-ivcs/import", {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }

      const data = await response.json();

      if (data.success) {
        setImportResult(data.results);
        
        // Call the callback to refresh overview data
        if (onImportComplete) {
          onImportComplete();
        }
      } else {
        setImportResult({
          imported: 0,
          duplicates: 0,
          errors: 1,
          filtered: 0,
          duplicateDetails: [],
          errorDetails: [{ row: 0, record: {}, error: data.error }]
        });
      }
    } catch (error) {
      console.error("Import error:", error);
      setImportResult({
        imported: 0,
        duplicates: 0,
        errors: 1,
        filtered: 0,
        duplicateDetails: [],
        errorDetails: [{ row: 0, record: {}, error: "Import failed. Please try again." }]
      });
    } finally {
      setImporting(false);
    }
  };

  const handleClearData = async () => {
    if (!confirm("Are you sure you want to delete ALL WOD/IVCS tasks? This cannot be undone.")) {
      return;
    }

    setClearing(true);
    try {
      const response = await fetch("/api/wod-ivcs/clear", {
        method: "DELETE",
      });

      const result = await response.json();

      if (result.success) {
        alert(`Successfully deleted ${result.deletedCount} WOD/IVCS tasks`);
        setImportResult(null);
        if (onImportComplete) {
          onImportComplete();
        }
      } else {
        alert(`Error clearing data: ${result.error}`);
      }
    } catch (error) {
      console.error("Clear data error:", error);
      alert("Error clearing data");
    } finally {
      setClearing(false);
    }
  };

  return (
    <Card className="p-6">
      <h3 className="text-lg font-semibold mb-4">📥 CSV Import</h3>
      
      <div className="space-y-4">
        {/* Source Selection */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Select NetSuite Report Source
          </label>
          <select
            value={selectedSource}
            onChange={(e) => setSelectedSource(e.target.value)}
            className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white"
          >
            <option value="">Choose a source...</option>
            {sources.map((source) => (
              <option key={source.value} value={source.value}>
                {source.label}
              </option>
            ))}
          </select>
          {selectedSource && (
            <p className="text-sm text-white/60 mt-1">
              {sources.find(s => s.value === selectedSource)?.description}
            </p>
          )}
        </div>

        {/* File Selection */}
        <div>
          <label className="block text-sm font-medium text-white/80 mb-2">
            Select CSV File
          </label>
          <input
            type="file"
            accept=".csv"
            onChange={handleFileSelect}
            className="w-full p-3 bg-white/10 border border-white/20 rounded-lg text-white file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-semibold file:bg-blue-600 file:text-white hover:file:bg-blue-700"
          />
          {selectedFile && (
            <p className="text-sm text-white/60 mt-1">
              Selected: {selectedFile.name} ({(selectedFile.size / 1024).toFixed(1)} KB)
            </p>
          )}
        </div>

        {/* Import Button */}
        <div className="flex gap-4">
          <SmallButton
            onClick={handleImport}
            disabled={!selectedFile || !selectedSource || importing}
            className="bg-green-600 hover:bg-green-700 text-white"
          >
            {importing ? "Importing..." : "📥 Import CSV"}
          </SmallButton>
          
          <SmallButton
            onClick={handleClearData}
            disabled={clearing}
            className="bg-red-600 hover:bg-red-700 text-white"
          >
            {clearing ? "Clearing..." : "🗑️ Clear All Data"}
          </SmallButton>
          
          {selectedFile && selectedSource && (
            <SmallButton
              onClick={() => {
                setSelectedFile(null);
                setSelectedSource("");
                setImportResult(null);
              }}
              className="bg-gray-600 hover:bg-gray-700 text-white"
            >
              Clear
            </SmallButton>
          )}
        </div>

        {/* Import Results */}
        {importResult && (
          <div className="mt-6 p-4 bg-white/5 rounded-lg">
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-medium text-white">Import Results</h4>
              <SmallButton onClick={clearResults} className="bg-gray-600 hover:bg-gray-700 text-xs">
                ✕ Clear
              </SmallButton>
            </div>
            <div className="grid grid-cols-4 gap-4 mb-4">
              <div className="text-center">
                <div className="text-2xl font-bold text-green-400">{importResult.imported}</div>
                <div className="text-sm text-white/60">Imported</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-orange-400">{importResult.duplicates}</div>
                <div className="text-sm text-white/60">Duplicates</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-blue-400">{importResult.filtered}</div>
                <div className="text-sm text-white/60">Filtered Out</div>
              </div>
              <div className="text-center">
                <div className="text-2xl font-bold text-red-400">{importResult.errors}</div>
                <div className="text-sm text-white/60">Errors</div>
              </div>
            </div>

            {/* Duplicate Details */}
            {importResult.duplicateDetails.length > 0 && (
              <div className="mb-4">
                <h5 className="font-medium text-orange-400 mb-2">Duplicate Details</h5>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {importResult.duplicateDetails.slice(0, 5).map((dup, index) => (
                    <div key={index} className="text-xs text-white/70 p-2 bg-orange-500/10 rounded">
                      Row {dup.row}: {dup.age}+ days old
                    </div>
                  ))}
                  {importResult.duplicateDetails.length > 5 && (
                    <div className="text-xs text-white/50">
                      ... and {importResult.duplicateDetails.length - 5} more
                    </div>
                  )}
                </div>
              </div>
            )}

            {/* Error Details */}
            {importResult.errorDetails.length > 0 && (
              <div>
                <h5 className="font-medium text-red-400 mb-2">Error Details</h5>
                <div className="max-h-32 overflow-y-auto space-y-1">
                  {importResult.errorDetails.slice(0, 5).map((error, index) => (
                    <div key={index} className="text-xs text-white/70 p-2 bg-red-500/10 rounded">
                      Row {error.row}: {error.error}
                    </div>
                  ))}
                  {importResult.errorDetails.length > 5 && (
                    <div className="text-xs text-white/50">
                      ... and {importResult.errorDetails.length - 5} more
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </Card>
  );
}
