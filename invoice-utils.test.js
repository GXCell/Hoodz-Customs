const test = require('node:test');
const assert = require('node:assert/strict');

const { parseAmount, calculateTotals } = require('./invoice-utils');

test('parseAmount returns zero for invalid or negative values', () => {
  assert.equal(parseAmount(-1), 0);
  assert.equal(parseAmount('nope'), 0);
  assert.equal(parseAmount(Infinity), 0);
});

test('parseAmount preserves valid positive values', () => {
  assert.equal(parseAmount('12.5'), 12.5);
  assert.equal(parseAmount(0), 0);
  assert.equal(parseAmount('95'), 95);
});

test('calculateTotals computes subtotal, tax, and total', () => {
  const totals = calculateTotals(
    [
      { type: 'Labor', description: 'Diagnostic inspection', quantity: 1, price: 95 },
      { type: 'Part', description: 'Brake pads set', quantity: 1, price: 125 },
    ],
    8.25
  );

  assert.equal(totals.subtotal, 220);
  assert.equal(totals.tax, 18.15);
  assert.equal(totals.total, 238.15);
});

test('calculateTotals normalizes invalid values to zero', () => {
  const totals = calculateTotals(
    [{ type: 'Fee', description: 'Shop supplies', quantity: -2, price: 'invalid' }],
    -5
  );

  assert.equal(totals.subtotal, 0);
  assert.equal(totals.tax, 0);
  assert.equal(totals.total, 0);
});
