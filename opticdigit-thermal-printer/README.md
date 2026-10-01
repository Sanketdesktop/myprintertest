# OpticDigit Thermal Printer

Built-in Bluetooth receipt printing for the OpticDigit web dashboard. Shops print bills straight from the website. No RawBT, nRF Connect or any other app is needed.

## How it works

The site uses Chrome's built-in **Web Bluetooth** to talk to BLE thermal printers and sends raw **ESC/POS** commands. On connect, it detects the printer's write channel automatically from a list of common printer services.

## Requirements

| Requirement | Detail |
|---|---|
| Browser | Chrome or Edge on **Android or Windows**. iPhone/Safari is not supported. |
| Hosting | **HTTPS** (app.opticdigit.com already is). `localhost` works for development. |
| Printer | ESC/POS printer with **BLE** or dual-mode Bluetooth. Classic-only (SPP) printers can't be reached from a browser. |
| Paper | 58 mm (32 characters) or 80 mm (48 characters) |

## Files

```
src/
  lib/
    thermalPrinter.js   Bluetooth connection, chunked sending, ESC/POS Receipt builder
    buildBill.js        Turns an OpticDigit order into receipt bytes (items, totals, prescription)
  components/
    usePrinter.js       React hook: connected / busy / error state + actions
    PrinterStatus.jsx   Header chip: "Printer: connected" + Connect / Test / Disconnect
    PrintBillButton.jsx "Print bill" button for the bill page (connects on first tap)
public/
  printer-test.html     Standalone test page, no build step needed
```

## Setup

1. Copy `src/lib` and `src/components` into the dashboard project.
2. Add the status chip to the dashboard header:
   ```jsx
   import PrinterStatus from './components/PrinterStatus';
   <PrinterStatus />
   ```
3. Add the print button to the bill page:
   ```jsx
   import PrintBillButton from './components/PrintBillButton';

   <PrintBillButton
     shop={{ name: shop.name, address: shop.address, phone: shop.phone }}
     order={{
       billNo: order.billNo,
       date: order.date,
       customerName: order.customer.name,
       customerPhone: order.customer.phone,
       items: order.items.map(i => ({ name: i.name, qty: i.qty, price: i.rate })),
       discount: order.discount,
       paid: order.advance,
       deliveryDate: order.deliveryDate,
       rx: order.prescription && {
         right: { sph: '-1.25', cyl: '-0.50', axis: '180', add: '' },
         left:  { sph: '-1.00', cyl: '-0.75', axis: '170', add: '' },
       },
     }}
     paperWidth={32}  // 48 for 80mm printers
   />
   ```
   Map the field names on the right to your real order object.
4. Deploy. To test the printer without touching the dashboard, open `/printer-test.html` on the deployed site.

## Shop owner flow

1. Turn on the printer. Close any other app connected to it, because a printer accepts one connection at a time.
2. Tap **Connect printer** and choose the printer in Chrome's list. Android pairing is not required.
3. Tap **Print bill** on any order.

After a page reload, staff tap **Connect printer** once more. Browsers don't allow a website to reconnect to Bluetooth on its own.

## Troubleshooting

| Symptom | Fix |
|---|---|
| "Printing not supported" | Use Chrome on Android or Windows, over HTTPS. |
| Printer doesn't appear in the picker | Turn the printer off and on. Close RawBT or other apps holding the connection. |
| "No writable characteristic found" | This printer model uses an uncommon service. Find its service UUID (nRF Connect app → Connect → services) and add it to `KNOWN_SERVICES` in `thermalPrinter.js`. |
| Long bills cut off midway | Raise `CHUNK_DELAY` in `thermalPrinter.js` to 40–50 ms. |
| Old text prints together with a new bill | Already handled: every receipt starts with `ESC @`, which clears the buffer. |
| `?` instead of Marathi/Hindi text | Printers only print English characters as text. Devanagari needs image (raster) printing, which isn't built yet. |
| `₹` prints as `Rs.` | Intentional. The printer's font has no rupee sign. |

## Buying printers for shop kits

Choose models listed as **BLE** or **dual-mode (Bluetooth 4.0+)** with ESC/POS support. Before bundling a new model, test it once with `/printer-test.html`.
