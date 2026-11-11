import { useState, useCallback, useEffect } from 'react';
import { HardwareBridge } from 'hardware-bridge';

export function useScale() {
  const [weight, setWeight] = useState<number | null>(null);
  const [isReading, setIsReading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isConnected, setIsConnected] = useState(false);

  // Auto-reconnect & Hardware Event Listeners
  useEffect(() => {
    if (typeof navigator !== 'undefined' && 'serial' in navigator) {
      const handleConnect = () => {
        console.log('Scale connected.');
        setIsConnected(true);
      };
      const handleDisconnect = () => {
        console.warn('Scale disconnected.');
        setIsConnected(false);
        setWeight(null);
        setError("Scale disconnected. Please check USB.");
      };

      const serial = (navigator as any).serial as EventTarget;
      serial.addEventListener('connect', handleConnect);
      serial.addEventListener('disconnect', handleDisconnect);

      return () => {
        serial.removeEventListener('connect', handleConnect);
        serial.removeEventListener('disconnect', handleDisconnect);
      };
    }
  }, []);

  const readWeight = useCallback(async () => {
    setIsReading(true);
    setError(null);
    try {
      const reader = await HardwareBridge.connectToScale();
      setIsConnected(true);
      
      // Basic reading logic (decoding stream)
      const { value, done } = await reader.read();
      if (done) {
        throw new Error("Stream closed unexpectedly");
      }
      
      const decoder = new TextDecoder();
      const text = decoder.decode(value);
      
      const parsedWeight = parseFloat(text.replace(/[^0-9.]/g, ''));
      if (!isNaN(parsedWeight)) {
        setWeight(parsedWeight);
      } else {
        throw new Error("Failed to parse weight data");
      }
      
      await reader.cancel(); 
    } catch (err: any) {
      console.error("Scale reading error:", err);
      setError(err.message || "Failed to connect to scale");
      setIsConnected(false);
    } finally {
      setIsReading(false);
    }
  }, []);

  return { weight, isReading, error, readWeight, isConnected };
}

export function usePdaScanner(onScan: (barcode: string) => void) {
  const [isListening, setIsListening] = useState(false);

  const startListening = useCallback(() => {
    setIsListening(true);
    const listener = HardwareBridge.listenToPdaScanner(onScan);
    return () => {
      listener.remove();
      setIsListening(false);
    };
  }, [onScan]);

  return { isListening, startListening };
}
