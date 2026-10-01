// thermalPrinter.js — BLE thermal printing for the browser (Chrome / Edge, HTTPS only)
// Works with 58mm (32 chars) and 80mm (48 chars) ESC/POS printers that support BLE.
//
// Connection model:
//   • First time: staff tap "Connect printer" once and pick the printer (browser rule).
//   • After that: reconnectSavedPrinter() reconnects silently on page load,
//     and the printer reconnects by itself after it sleeps or goes out of range.

const KNOWN_SERVICES = [
  '000018f0-0000-1000-8000-00805f9b34fb', // most cheap 58mm printers (0x18F0)
  'e7810a71-73ae-499d-8c15-faa9aef0c3f2', // common Chinese POS printers
  '49535343-fe7d-4ae5-8fa9-9fafd205e455', // Microchip/ISSC transparent UART
  '6e400001-b5a3-f393-e0a9-e50e24dcca9e', // Nordic UART
  '0000ff00-0000-1000-8000-00805f9b34fb',
  '0000ffe0-0000-1000-8000-00805f9b34fb', // HM-10 style modules
  '0000fff0-0000-1000-8000-00805f9b34fb',
  '0000ae30-0000-1000-8000-00805f9b34fb', // mini/portable receipt printers
  '0000ae00-0000-1000-8000-00805f9b34fb',
  '0000af30-0000-1000-8000-00805f9b34fb',
  '0000fee7-0000-1000-8000-00805f9b34fb',
  '0000ff80-0000-1000-8000-00805f9b34fb',
  '0000ffb0-0000-1000-8000-00805f9b34fb',
  '0000ffd0-0000-1000-8000-00805f9b34fb',
];

const CHUNK_SIZE = 20;      // safe BLE packet size
const CHUNK_DELAY = 20;     // ms between packets; raise to 40-50 if long receipts get cut off
const STORAGE_KEY = 'opticdigit.printerId';
const CONNECT_TIMEOUT = 10000;

let device = null;
let characteristic = null;
let manualDisconnect = false;
let reconnectTimer = null;
let reconnecting = false;
const listeners = new Set();

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const withTimeout = (p, ms, msg) =>
  Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(msg)), ms))]);
const store = {
  get: () => { try { return localStorage.getItem(STORAGE_KEY); } catch { return null; } },
  set: (v) => { try { localStorage.setItem(STORAGE_KEY, v); } catch { /* ignore */ } },
  clear: () => { try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ } },
};

export const isSupported = () => typeof navigator !== 'undefined' && !!navigator.bluetooth;
export const canAutoReconnect = () => isSupported() && typeof navigator.bluetooth.getDevices === 'function';
export const isConnected = () => !!(characteristic && device?.gatt?.connected);
export const isReconnecting = () => reconnecting;
export const getPrinterName = () => device?.name || null;
export const hasSavedPrinter = () => !!store.get();

const notify = () => listeners.forEach((fn) => fn({ connected: isConnected(), reconnecting }));
export const onConnectionChange = (fn) => { listeners.add(fn); return () => listeners.delete(fn); };

function useDevice(d) {
  if (device === d) return;
  device = d;
  device.addEventListener('gattserverdisconnected', handleDisconnect);
}

function handleDisconnect() {
  characteristic = null;
  notify();
  if (!manualDisconnect) scheduleReconnect(1);
}

// Retry with backoff: 2s, 4s, 8s … up to 30s, until it reconnects or the user disconnects
function scheduleReconnect(attempt) {
  clearTimeout(reconnectTimer);
  const delay = Math.min(30000, 2000 * 2 ** (attempt - 1));
  reconnectTimer = setTimeout(async () => {
    if (manualDisconnect || isConnected() || !device) return;
    try {
      await attach();
    } catch {
      scheduleReconnect(attempt + 1);
    }
  }, delay);
}

// First-time connect. Must be called from a user tap (browser requirement).
export async function connectPrinter() {
  if (!isSupported()) {
    throw new Error('Bluetooth printing needs Chrome or Edge on Android/Windows, over HTTPS. iPhone is not supported.');
  }
  const picked = await navigator.bluetooth.requestDevice({
    acceptAllDevices: true,
    optionalServices: KNOWN_SERVICES,
  });
  manualDisconnect = false;
  useDevice(picked);
  await attach();
  store.set(picked.id);
  return picked.name;
}

// Silent reconnect on page load — no tap, no picker.
// Returns true if connected. Safe to call on every app start.
export async function reconnectSavedPrinter() {
  if (!canAutoReconnect() || isConnected()) return isConnected();
  const savedId = store.get();
  if (!savedId) return false;

  const devices = await navigator.bluetooth.getDevices();
  const saved = devices.find((d) => d.id === savedId);
  if (!saved) return false; // permission was revoked or browser data cleared

  manualDisconnect = false;
  useDevice(saved);
  reconnecting = true;
  notify();
  try {
    try {
      await attach();
    } catch {
      // Printer may be off or asleep: wait for it to advertise, then connect
      await waitForAdvertisement(saved, 15000);
      await attach();
    }
    return true;
  } catch {
    scheduleReconnect(1); // keep trying quietly in the background
    return false;
  } finally {
    reconnecting = false;
    notify();
  }
}

function waitForAdvertisement(d, ms) {
  if (typeof d.watchAdvertisements !== 'function') return sleep(ms);
  return new Promise((resolve, reject) => {
    const ctrl = new AbortController();
    const timer = setTimeout(() => { ctrl.abort(); reject(new Error('Printer not found nearby')); }, ms);
    d.addEventListener('advertisementreceived', () => {
      clearTimeout(timer);
      ctrl.abort();
      resolve();
    }, { once: true });
    d.watchAdvertisements({ signal: ctrl.signal }).catch(() => { clearTimeout(timer); resolve(); });
  });
}

// "Disconnect" in the UI = also forget the printer, so it won't auto-reconnect
export function disconnectPrinter({ forget = true } = {}) {
  manualDisconnect = true;
  clearTimeout(reconnectTimer);
  if (device?.gatt?.connected) device.gatt.disconnect();
  characteristic = null;
  if (forget) {
    store.clear();
    device?.forget?.().catch(() => {});
    device = null;
  }
  notify();
}

// Find a writable characteristic, preferring known printer services
async function attach() {
  const server = await withTimeout(device.gatt.connect(), CONNECT_TIMEOUT, 'Printer did not respond. Is it switched on?');
  const services = await server.getPrimaryServices();
  services.sort((a, b) => KNOWN_SERVICES.indexOf(b.uuid) - KNOWN_SERVICES.indexOf(a.uuid));

  for (const service of services) {
    let chars = [];
    try { chars = await service.getCharacteristics(); } catch { continue; }
    const writable = chars.find((c) => c.properties.writeWithoutResponse) ||
                     chars.find((c) => c.properties.write);
    if (writable) {
      characteristic = writable;
      clearTimeout(reconnectTimer);
      notify();
      return;
    }
  }
  throw new Error("Connected, but no writable characteristic found. Add this printer's service UUID to KNOWN_SERVICES.");
}

async function ensureConnected() {
  if (isConnected()) return;
  if (!device) {
    // Try the remembered printer before giving up
    if (await reconnectSavedPrinter()) return;
    throw new Error('Printer not connected. Tap "Connect printer" first.');
  }
  await attach();
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
    return this.line(left + ' '.repeat(Math.max(1, this.width - left.length - right.length)) + right);
  }
  feed(n = 3) { return this.raw(...Array(n).fill(0x0a)); }
  cut() { return this.raw(GS, 0x56, 0x00); } // ignored if printer has no cutter
  build() { return new Uint8Array(this.bytes); }
}

export const printTest = () =>
  printBytes(new Receipt().align('center').bold().line('OpticDigit').bold(false)
    .line('Printer connected OK').feed(4).build());
