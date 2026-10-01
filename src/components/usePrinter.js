// usePrinter.js — React hook that exposes printer state and actions
import { useEffect, useState, useCallback } from 'react';
import {
  connectPrinter, disconnectPrinter, isConnected, isReconnecting, isSupported,
  canAutoReconnect, getPrinterName, onConnectionChange, printBytes, printTest,
  reconnectSavedPrinter,
} from '../lib/thermalPrinter';

let autoTried = false; // run the silent reconnect once per page load, not per component

export function usePrinter() {
  const [connected, setConnected] = useState(isConnected());
  const [reconnecting, setReconnecting] = useState(isReconnecting());
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    const off = onConnectionChange((s) => {
      setConnected(s.connected);
      setReconnecting(s.reconnecting);
    });
    if (!autoTried) {
      autoTried = true;
      reconnectSavedPrinter().catch(() => {});
    }
    return off;
  }, []);

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
    autoReconnect: canAutoReconnect(),
    connected,
    reconnecting,
    busy,
    error,
    printerName: getPrinterName(),
    connect: () => run(connectPrinter),
    disconnect: () => disconnectPrinter(),
    print: (bytes) => run(() => printBytes(bytes)),
    test: () => run(printTest),
  };
}
