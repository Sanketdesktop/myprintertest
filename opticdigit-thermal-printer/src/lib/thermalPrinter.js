// thermalPrinter.js — BLE thermal printing for the browser (Chrome / Edge, HTTPS only)
// Works with 58mm (32 chars) and 80mm (48 chars) ESC/POS printers that support BLE.

const KNOWN_SERVICES = [
    '000018f0-0000-1000-8000-00805f9b34fb', // most cheap 58mm printers (0x18F0)
    'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // common Chinese POS printers
    '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip/ISSC transparent UART
    '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
    '0000ff00-0000-1000-8000-00805f9b34fb',
    '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 style modules
    '0000fff0-0000-1000-8000-00805f9b34fb',
    '0000ae30-0000-1000-8000-00805f9b34fb', // mini/portable label & receipt printers
    '0000ae00-0000-1000-8000-00805f9b34fb',
    '0000af30-0000-1000-8000-00805f9b34fb',
    '0000fee7-0000-1000-8000-00805f9b34fb',
    '0000ff80-0000-1000-8000-00805f9b34fb',
    '0000ffb0-0000-1000-8000-00805f9b34fb',
    '0000ffd0-0000-1000-8000-00805f9b34fb',
  ];

const CHUNK_SIZE = 20;   // safe BLE packet size
const CHUNK_DELAY = 20;  // ms between packets; raise to 40-50 if long receipts get cut off

let device = null;
let characteristic = null;
const listeners = new Set();

const notify = () => listeners.forEach((fn) => fn(isConnected()));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export const isSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;
export const isConnected = () => !!(characteristic && device?.gatt?.connected);
export const getPrinterName = () => device?.name || null;
export const onConnectionChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

// Must be called from a user tap (button click) — browser requirement
export async function connectPrinter() {
  if (!isSupported()) {
    throw new Error('Bluetooth printing needs Chrome or Edge on Android/Windows, over HTTPS. iPhone is not supported.');
  }
  device = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: KNOWN_SERVICES,
  });
  device.addEventListener('gattserverdisconnected', () => {
    characteristic = null;
    notify();
  });
  await attach();
  notify();
  return device.name;
}

export function disconnectPrinter() {
  if (device?.gatt?.connected) device.gatt.disconnect();
  characteristic = null;
  notify();
}

// Find a writable characteristic, preferring known printer services
async function attach() {
  const server = await device.gatt.connect();
  const services = await server.getPrimaryServices();
  services.sort((a, b) => KNOWN_SERVICES.indexOf(b.uuid) - KNOWN_SERVICES.indexOf(a.uuid));

  for (const service of services) {
    const chars = await service.getCharacteristics();
    const writable = chars.find((c) => c.properties.writeWithoutResponse) ||
                     chars.find((c) => c.properties.write);
    if (writable) {
      characteristic = writable;
      return;
    }
  }
  throw new Error('Connected, but no writable characteristic found. Add this printer's service UUID to KNOWN_SERVICES.');
}

// Reconnect silently if the printer went to sleep
async function ensureConnected() {
  if (isConnected()) return;
  if (!device) throw new Error('Printer not connected. Tap "Connect printer" first.');
  await attach();
  notify();
}

async function send(bytes) {
  await ensureConnected();
  for (let i = 0; i < bytes.length; i += CHUNK_SIZE) {
    const chunk = bytes.slice(i, i + CHUNK_SIZE);
    if (characteristic.properties.writeWithoutResponse) {
      await characteristic.writeValueWithoutResponse(chunk);
    } else {
      await characteristic.writeValue(chunk);
    }
    await sleep(CHUNK_DELAY);
  }
}

// Prevent two prints overlapping (double-tap on Print button)
let queue = Promise.resolve();
export function printBytes(bytes) {
  queue = queue.then(() => send(bytes), () => send(bytes));
  return queue;
}

/* ---------------- Receipt builder (ESC/POS) ---------------- */

const ESC = 0x1b;
const GS = 0x1d;

// Printers only understand ASCII; ₹ and Devanagari won't print as text
const encode = (str) =>
  [...String(str).replace(/₹/g, 'Rs.')].map((ch) => {
    const code = ch.charCodeAt(0);
    return code < 128 ? code : 0x3f; // '?' for unsupported chars
  });

export class Receipt {
  constructor(width = 32) { // 32 = 58mm, 48 = 80mm
    this.width = width;
    this.bytes = [ESC, 0x40]; // init + clear buffer
  }
  raw(...b) { this.bytes.push(...b); return this; }
  text(s) { this.bytes.push(...encode(s)); return this; }
  line(s = '') { return this.text(s + '\n'); }
  align(a = 'left') { return this.raw(ESC, 0x61, { left: 0, center: 1, right: 2 }[a]); }
  bold(on = true) { return this.raw(ESC, 0x45, on ? 1 : 0); }
  big(on = true) { return this.raw(GS, 0x21, on ? 0x11 : 0x00); } // double width + height
  divider(ch = '-') { return this.line(ch.repeat(this.width)); }
  row(left, right) {
    left = String(left); right = String(right);
    const maxLeft = this.width - right.length - 1;
    if (left.length > maxLeft) left = left.slice(0, maxLeft);
    return this.line(left + ' '.repeat(this.width - left.length - right.length) + right);
  }
  feed(n = 3) { return this.raw(...Array(n).fill(0x0a)); }
  cut() { return this.raw(GS, 0x56, 0x00); } // ignored if printer has no cutter
  build() { return new Uint8Array(this.bytes); }
}

export const printTest = () =>
  printBytes(new Receipt().align('center').bold().line('OpticDigit').bold(false)
    .line('Printer connected OK').feed(4).build());
