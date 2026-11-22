'use strict';

var test = require('node:test');
var assert = require('node:assert/strict');

var pricing = require('../lib/pricing');
var invoice = require('../lib/invoice');
var reports = require('../lib/reports');
var tax = require('../lib/tax');

function makeCheckoutOrder(items, coupon) {
  var totals = pricing.computeTotals(items, coupon || '');
  return {
    id: 42,
    date: '22/11/2026',
    customer: 'In-memory test customer',
    paymentMode: 'cash',
    status: 'completed',
    items: items,
    coupon: coupon || '',
    subtotal: totals.subtotal,
    discount: totals.discount,
    tax: totals.tax,
    total: totals.total
  };
}

test('invoice GST and total match checkout for a discounted HSN-rated order', function () {
  var items = [{ id: 4, name: 'Rice', sku: 'RICE-4', hsn: '1006', price: 640, qty: 1 }];
  var order = makeCheckoutOrder(items, 'SAVE10');
  var invoiceFigures = invoice.computeInvoiceFigures(order);
  var checkoutSplit = tax.splitCgstSgst(order.tax);

  assert.equal(invoiceFigures.tax, order.tax);
  assert.equal(invoiceFigures.cgst, checkoutSplit.cgst);
  assert.equal(invoiceFigures.sgst, checkoutSplit.sgst);
  assert.equal(invoiceFigures.total, order.total);
  assert.equal(invoiceFigures.discount, order.discount);
  assert.equal(invoiceFigures.rows[0].gstPercent, 5);
});

test('invoice uses the checkout HSN GST rate without requiring gstRate on stored lines', function () {
  var items = [{ id: 1, name: 'Rice', sku: 'RICE-1', hsn: '1006', price: 600, qty: 1 }];
  var order = makeCheckoutOrder(items, '');
  var invoiceFigures = invoice.computeInvoiceFigures(order);

  assert.equal(order.tax, 30);
  assert.equal(order.total, 630);
  assert.equal(invoiceFigures.rows[0].gstPercent, 5);
  assert.equal(invoiceFigures.tax, order.tax);
  assert.equal(invoiceFigures.total, order.total);
});

test('invoice applies coupon discount before GST, matching checkout tax breakdown', function () {
  var items = [{ id: 2, name: 'Rice', sku: 'RICE-2', hsn: '1006', gstRate: 5, price: 600, qty: 1 }];
  var order = makeCheckoutOrder(items, 'SAVE10');
  var invoiceFigures = invoice.computeInvoiceFigures(order);
  var checkoutSplit = tax.splitCgstSgst(order.tax);

  assert.equal(order.discount, 60);
  assert.equal(order.tax, 27);
  assert.equal(checkoutSplit.cgst, 13.5);
  assert.equal(checkoutSplit.sgst, 13.5);
  assert.equal(order.total, 567);
  assert.equal(invoiceFigures.discount, order.discount);
  assert.equal(invoiceFigures.tax, order.tax);
  assert.equal(invoiceFigures.cgst, checkoutSplit.cgst);
  assert.equal(invoiceFigures.sgst, checkoutSplit.sgst);
  assert.equal(invoiceFigures.total, order.total);

  var reconciliation = reports.getGstReconciliation({ orders: [order] });
  assert.equal(reconciliation.mismatchCount, 0);
  assert.equal(reconciliation.rows[0].delta, 0);
  assert.equal(reconciliation.rows[0].matched, true);
});

test('invoice respects SAVE10 maximum discount and matches checkout totals', function () {
  var items = [{ id: 3, name: 'Rice', sku: 'RICE-3', hsn: '1006', gstRate: 5, price: 2500, qty: 1 }];
  var order = makeCheckoutOrder(items, 'SAVE10');
  var invoiceFigures = invoice.computeInvoiceFigures(order);

  assert.equal(order.discount, 150);
  assert.equal(order.tax, 117.5);
  assert.equal(order.total, 2467.5);
  assert.equal(invoiceFigures.discount, order.discount);
  assert.equal(invoiceFigures.tax, order.tax);
  assert.equal(invoiceFigures.total, order.total);
});
