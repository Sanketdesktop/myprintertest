// PrintBillButton.jsx — put this on the bill / order page
import { usePrinter } from './usePrinter';
import { buildBill } from '../lib/buildBill';

export default function PrintBillButton({ shop, order, paperWidth = 32 }) {
  const { supported, connected, busy, error, connect, print } = usePrinter();

  if (!supported) return null;

  const handleClick = async () => {
    // First tap connects if needed, then prints
    if (!connected) {
      const ok = await connect();
      if (!ok) return;
    }
    await print(buildBill(shop, order, paperWidth));
  };

  return (
    <>
      <button onClick={handleClick} disabled={busy}>
        {busy ? 'Printing…' : connected ? 'Print bill' : 'Connect & print'}
      </button>
      {error && <p style={{ color: '#bb3326' }}>{error}</p>}
    </>
  );
}
