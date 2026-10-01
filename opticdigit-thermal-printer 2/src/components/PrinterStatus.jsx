// PrinterStatus.jsx — put this in the dashboard header / top bar
import { usePrinter } from './usePrinter';

export default function PrinterStatus() {
  const { supported, connected, busy, error, printerName, connect, disconnect, test } = usePrinter();

  if (!supported) {
    return <span title="Use Chrome on Android or Windows">Printing not supported in this browser</span>;
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <span style={{ color: connected ? '#1d8049' : '#6c645b', fontWeight: 600 }}>
        ● {connected ? `Printer: ${printerName || 'connected'}` : 'Printer: not connected'}
      </span>
      {connected ? (
        <>
          <button onClick={test} disabled={busy}>Test</button>
          <button onClick={disconnect}>Disconnect</button>
        </>
      ) : (
        <button onClick={connect} disabled={busy}>{busy ? 'Connecting…' : 'Connect printer'}</button>
      )}
      {error && <span style={{ color: '#bb3326' }}>{error}</span>}
    </div>
  );
}
