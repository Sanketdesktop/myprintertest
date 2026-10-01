// PrinterStatus.jsx — put this in the dashboard header / top bar
import { usePrinter } from './usePrinter';

export default function PrinterStatus() {
  const {
    supported, autoReconnect, connected, reconnecting, busy, error,
    printerName, connect, disconnect, test,
  } = usePrinter();

  if (!supported) {
    return <span title="Use Chrome on Android or Windows">Printing not supported in this browser</span>;
  }

  const label = connected
    ? `Printer: ${printerName || 'connected'}`
    : reconnecting ? 'Printer: reconnecting…' : 'Printer: not connected';
  const color = connected ? '#1d8049' : reconnecting ? '#e2600b' : '#6c645b';

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
      <span style={{ color, fontWeight: 600 }}>● {label}</span>
      {connected ? (
        <>
          <button onClick={test} disabled={busy}>Test</button>
          <button onClick={disconnect} title="Disconnect and forget this printer">Disconnect</button>
        </>
      ) : !reconnecting && (
        <button onClick={connect} disabled={busy}>{busy ? 'Connecting…' : 'Connect printer'}</button>
      )}
      {!autoReconnect && !connected && (
        <small style={{ color: '#6c645b' }}>
          Auto-reconnect is off in this Chrome. Enable chrome://flags/#enable-web-bluetooth-new-permissions-backend
        </small>
      )}
      {error && <span style={{ color: '#bb3326' }}>{error}</span>}
    </div>
  );
}
