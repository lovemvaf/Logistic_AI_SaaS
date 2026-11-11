import React, { useState } from 'react';

export interface ScannerViewProps {
  onScan: (barcode: string) => void;
  onError?: (error: string) => void;
}

export function ScannerView({ onScan, onError }: ScannerViewProps) {
  const [scanning, setScanning] = useState(false);
  const [lastScan, setLastScan] = useState<string | null>(null);

  const handleManualInput = (value: string) => {
    if (value.trim()) {
      setLastScan(value.trim());
      onScan(value.trim());
    }
  };

  return (
    <div style={{ padding: '16px', textAlign: 'center' }}>
      <div style={{ 
        border: '2px dashed #3B82F6', 
        borderRadius: '12px', 
        padding: '32px',
        marginBottom: '16px',
      }}>
        {scanning ? (
          <p style={{ color: '#3B82F6', fontWeight: 'bold' }}>Scanning...</p>
        ) : (
          <p style={{ color: '#6B7280' }}>Position barcode in front of camera</p>
        )}
      </div>
      
      <input
        type="text"
        placeholder="Manual barcode input"
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            handleManualInput((e.target as HTMLInputElement).value);
            (e.target as HTMLInputElement).value = '';
          }
        }}
        style={{
          width: '100%',
          padding: '12px',
          borderRadius: '8px',
          border: '1px solid #D1D5DB',
          marginBottom: '8px',
        }}
      />
      
      {lastScan && (
        <p style={{ color: '#059669', fontWeight: 'bold' }}>
          Last scanned: {lastScan}
        </p>
      )}
    </div>
  );
}
