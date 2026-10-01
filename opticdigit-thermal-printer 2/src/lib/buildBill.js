// buildBill.js — turns an OpticDigit order into ESC/POS receipt bytes
import { Receipt } from './thermalPrinter';

const money = (n) => 'Rs.' + Number(n || 0).toFixed(2);

/**
 * @param {object} shop  { name, address, phone }
 * @param {object} order {
 *   billNo, date, customerName, customerPhone,
 *   items: [{ name, qty, price }],
 *   discount, paid, deliveryDate,
 *   rx?: { right: { sph, cyl, axis, add }, left: { sph, cyl, axis, add } }
 * }
 * @param {number} width 32 for 58mm paper, 48 for 80mm
 */
export function buildBill(shop, order, width = 32) {
  const r = new Receipt(width);

  r.align('center').bold().big().line(shop.name).big(false).bold(false);
  if (shop.address) r.line(shop.address);
  if (shop.phone) r.line('Ph: ' + shop.phone);
  r.align('left').divider();

  r.row('Bill: ' + order.billNo, order.date);
  if (order.customerName) r.line('Customer: ' + order.customerName);
  if (order.customerPhone) r.line('Mobile: ' + order.customerPhone);
  r.divider();

  let subtotal = 0;
  order.items.forEach((item) => {
    const amount = (Number(item.qty) || 0) * (Number(item.price) || 0);
    subtotal += amount;
    r.line(item.name);
    r.row(`  ${item.qty} x ${money(item.price)}`, money(amount));
  });
  r.divider();

  const discount = Number(order.discount) || 0;
  const total = Math.max(0, subtotal - discount);
  const paid = Number(order.paid) || 0;

  r.row('Subtotal', money(subtotal));
  if (discount) r.row('Discount', '-' + money(discount));
  r.bold().row('TOTAL', money(total)).bold(false);
  r.row('Advance paid', money(paid));
  if (total - paid > 0) r.bold().row('Balance due', money(total - paid)).bold(false);
  if (order.deliveryDate) r.line('Delivery: ' + order.deliveryDate);

  if (order.rx) {
    const w = width >= 48 ? 9 : 6;
    const cell = (s, n) => String(s || '-').padEnd(n).slice(0, n);
    const eyeLine = (label, e = {}) =>
      (cell(label, 3) + cell(e.sph, w) + cell(e.cyl, w) + cell(e.axis, w) + cell(e.add, w)).trimEnd();
    r.divider().bold().line('PRESCRIPTION').bold(false);
    r.line((cell('', 3) + cell('SPH', w) + cell('CYL', w) + cell('AXIS', w) + cell('ADD', w)).trimEnd());
    r.line(eyeLine('R', order.rx.right));
    r.line(eyeLine('L', order.rx.left));
  }

  r.divider().align('center').line('Thank you! Visit again').feed(4).cut();
  return r.build();
}
