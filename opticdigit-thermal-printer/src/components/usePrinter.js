// usePrinter.js — React hook that exposes printer state and actions
import { useEffect, useState, useCallback } from 'react';
import {
  connectPrinter, disconnectPrinter, isConnected, isSupported,
  getPrinterName, onConnectionChange, printBytes, printTest,
} from '../lib/thermalPrinter';

export function usePrinter() {
  const [connected, setConnected] = useState(isConnected());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => onConnectionChange(setConnected), []);

  const run = useCallback(async (fn) => {
    setError('');
    setBusy(true);
    try {
      await fn();
      return true;
    } catch (e) {
      // NotFoundError = user closed the printer picker; not a real error
      if (e?.name !== 'NotFoundError') setError(e?.message || String(e));
      return false;
    } finally {
      setBusy(false);
    }
  }, []);

  return {
    supported: isSupported(),
    connected,
    busy,
    error,
    printerName: getPrinterName(),
    connect: () => run(connectPrinter),
    disconnect: disconnectPrinter,
    print: (bytes) => run(() => printBytes(bytes)),
    test: () => run(printTest),
  };
}
