export interface ScaleReading {
  weight: number;
  unit: string;
  timestamp: number;
}

export interface ScannerListener {
  remove: () => void;
}

export interface PrinterOptions {
  width: number;
  height: number;
  density: number;
  copies: number;
}

export interface BarcodeResult {
  barcode: string;
  format: string;
  timestamp: number;
}

const DEFAULT_PRINTER_OPTIONS: PrinterOptions = {
  width: 4,
  height: 6,
  density: 8,
  copies: 1,
};

export class HardwareBridge {

  static async connectToScale(baudRate: number = 9600): Promise<ReadableStreamDefaultReader<Uint8Array>> {
    if (typeof navigator === 'undefined' || !('serial' in navigator)) {
      throw new Error('Web Serial API is not supported in this environment');
    }

    try {
      const port = await (navigator as any).serial.requestPort();
      await port.open({ baudRate });
      return port.readable.getReader();
    } catch (error) {
      console.error('Failed to connect to scale:', error);
      throw error;
    }
  }

  static async readWeight(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<ScaleReading> {
    const { value, done } = await reader.read();

    if (done) {
      throw new Error('Scale connection closed');
    }

    const decoder = new TextDecoder();
    const rawData = decoder.decode(value);

    const weightMatch = rawData.match(/(\d+\.?\d*)/);
    if (!weightMatch) {
      throw new Error('Invalid scale data format');
    }

    return {
      weight: parseFloat(weightMatch[1]),
      unit: rawData.includes('kg') ? 'kg' : 'g',
      timestamp: Date.now()
    };
  }

  static async tareScale(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    const encoder = new TextEncoder();
    const writer = (reader as any).port?.writable?.getWriter();
    if (writer) {
      await writer.write(encoder.encode('T'));
      writer.releaseLock();
    }
  }

  static async disconnectScale(reader: ReadableStreamDefaultReader<Uint8Array>): Promise<void> {
    try {
      await reader.cancel();
    } catch (error) {
      console.error('Error disconnecting scale:', error);
    }
  }

  static listenToPdaScanner(onScan: (barcode: string) => void): ScannerListener {
    let listener: any = null;

    if (typeof window !== 'undefined' && (window as any).DeviceEventEmitter) {
      listener = (window as any).DeviceEventEmitter.addListener('pda_scan_event', (event: any) => {
        if (event && event.barcode) {
          onScan(event.barcode);
        }
      });
    }

    return {
      remove: () => {
        if (listener && listener.remove) {
          listener.remove();
        }
      }
    };
  }

  static listenToUsbHidScanner(onScan: (result: BarcodeResult) => void): ScannerListener {
    let removeHandler = () => {};

    if (typeof document !== 'undefined') {
      const handler = (event: KeyboardEvent) => {
        if (event.key === 'Enter') {
          const input = event.target as HTMLInputElement;
          if (input && input.dataset?.scannerTarget === 'true') {
            const barcode = input.value.trim();
            if (barcode) {
              onScan({
                barcode,
                format: 'USB_HID',
                timestamp: Date.now(),
              });
              input.value = '';
              event.preventDefault();
            }
          }
        }
      };

      document.addEventListener('keydown', handler);
      removeHandler = () => document.removeEventListener('keydown', handler);
    }

    return { remove: removeHandler };
  }

  static async connectToBluetoothScanner(): Promise<any> {
    if (typeof navigator === 'undefined' || !('bluetooth' in navigator)) {
      console.warn('Web Bluetooth API is not supported');
      return null;
    }

    try {
      const device = await (navigator as any).bluetooth.requestDevice({
        acceptAllDevices: true,
        optionalServices: ['00001101-0000-1000-8000-00805f9b34fb'],
      });

      const server = await device.gatt.connect();
      const service = await server.getPrimaryService('00001101-0000-1000-8000-00805f9b34fb');
      const characteristic = await service.getCharacteristic('00001101-0000-1000-8000-00805f9b34fb');

      return characteristic;
    } catch (error) {
      console.error('Bluetooth scanner connection failed:', error);
      return null;
    }
  }

  static listenToBluetoothScanner(
    characteristic: any,
    onScan: (result: BarcodeResult) => void
  ): ScannerListener {
    const handler = (event: Event) => {
      const value = (event.target as any).value;
      if (value) {
        const decoder = new TextDecoder('utf-8');
        const barcode = decoder.decode(value).trim();
        if (barcode) {
          onScan({
            barcode,
            format: 'BLUETOOTH_SPP',
            timestamp: Date.now(),
          });
        }
      }
    };

    characteristic.addEventListener('characteristicvaluechanged', handler);
    characteristic.startNotifications();

    return {
      remove: () => {
        characteristic.stopNotifications();
        characteristic.removeEventListener('characteristicvaluechanged', handler);
      }
    };
  }

  static generateZplLabel(options: {
    barcode: string;
    productName: string;
    weight?: string;
    destination?: string;
    orderId?: string;
  }): string {
    const { barcode, productName, weight, destination, orderId } = options;

    let zpl = '^XA\n';

    zpl += '^CF0,30\n';
    zpl += `^FO50,20^FD${productName}^FS\n`;

    if (orderId) {
      zpl += '^CF0,20\n';
      zpl += `^FO50,60^FDMa Don: ${orderId}^FS\n`;
    }

    zpl += '^FO50,100^BY2^BCN,80,Y,N,N\n';
    zpl += `^FD${barcode}^FS\n`;

    zpl += '^CF0,20\n';
    zpl += `^FO50,200^FDBarcode: ${barcode}^FS\n`;

    if (weight) {
      zpl += `^FO50,230^FDKL: ${weight}^FS\n`;
    }

    if (destination) {
      zpl += `^FO50,260^FDDia chi: ${destination}^FS\n`;
    }

    zpl += '^XZ';
    return zpl;
  }

  static async printZplLabel(
    zpl: string,
    printerName?: string,
    options: Partial<PrinterOptions> = {}
  ): Promise<boolean> {
    const opts = { ...DEFAULT_PRINTER_OPTIONS, ...options };

    if (typeof window !== 'undefined' && (window as any).chrome?.runtime) {
      try {
        const encodedData = encodeURIComponent(zpl);
        const printWindow = window.open(
          `data:application/x-zpl,${encodedData}`,
          '_blank'
        );
        if (printWindow) {
          printWindow.print();
          return true;
        }
      } catch (error) {
        console.error('ZPL print failed:', error);
        return false;
      }
    }

    if (typeof navigator !== 'undefined' && (navigator as any).usb) {
      try {
        const device = await (navigator as any).usb.requestDevice({
          filters: [{ vendorId: 0x0a5f }],
        });
        await device.open();
        await device.selectConfiguration(1);
        await device.claimInterface(0);

        const encoder = new TextEncoder();
        await device.transferOut(1, encoder.encode(zpl));

        await device.close();
        return true;
      } catch (error) {
        console.error('USB printer error:', error);
        return false;
      }
    }

    console.warn('No printer API available. ZPL output:', zpl);
    return false;
  }

  static async detectConnectedHardware(): Promise<{
    scale: boolean;
    serialScanner: boolean;
    bluetoothScanner: boolean;
    usbPrinter: boolean;
  }> {
    const result = {
      scale: false,
      serialScanner: false,
      bluetoothScanner: false,
      usbPrinter: false,
    };

    if (typeof navigator !== 'undefined') {
      result.serialScanner = 'serial' in navigator;
      result.bluetoothScanner = 'bluetooth' in navigator;
      result.usbPrinter = 'usb' in navigator;
    }

    return result;
  }
}
