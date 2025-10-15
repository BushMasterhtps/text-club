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
          <div className="mt-4 p-3 bg-green-900/20 border border-green-500/30 rounded-lg">
            <h3 className="font-semibold text-green-200 mb-2">Import Results:</h3>
            <div className="text-sm text-green-100">
              <p>✅ Imported: {result.results?.imported || 0}</p>
              <p>🔄 Updated: {result.results?.updated || 0}</p>
              <p>❌ Errors: {result.results?.errors || 0}</p>
              <p>📊 Total Rows: {result.results?.totalRows || 0}</p>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
}
