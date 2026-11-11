'use client';
import { useState, useCallback } from 'react';

export function useSerialPort() {
  const [isConnected, setIsConnected] = useState(false);
  const [data, setData] = useState<string>('');
  const [error, setError] = useState<string>('');

  const connect = useCallback(async () => {
    try {
      if (!('serial' in navigator)) {
        throw new Error('Web Serial API not supported in this browser. Please use Chrome/Edge.');
      }
      
      // Prompt user to select a serial port
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate: 9600 });
      setIsConnected(true);
      setError('');

      // Create a reader to continuously read from the port
      const textDecoder = new TextDecoderStream();
      const readableStreamClosed = port.readable.pipeTo(textDecoder.writable);
      const reader = textDecoder.readable.getReader();

      // Read loop
      while (true) {
        const { value, done } = await reader.read();
        if (done) {
          reader.releaseLock();
          break;
        }
        if (value) {
          setData(prev => (prev + value).slice(-50)); // Keep last 50 chars
        }
      }
    } catch (err: any) {
      setError(err.message);
      setIsConnected(false);
    }
  }, []);

  return { isConnected, data, error, connect };
}
