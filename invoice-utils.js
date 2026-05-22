(function initializeInvoiceUtils(globalScope, factory) {
  const api = factory();

  if (typeof module === 'object' && module.exports) {
    module.exports = api;
  }

  globalScope.InvoiceUtils = api;
})(typeof window !== 'undefined' ? window : globalThis, () => {
  const parseAmount = (value) => {
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) && parsed >= 0 ? parsed : 0;
  };

  const calculateTotals = (items, taxRate) => {
    const normalizedItems = items.map((item) => {
      const quantity = parseAmount(item.quantity);
      const price = parseAmount(item.price);

      return {
        ...item,
        quantity,
        price,
        amount: quantity * price,
      };
    });

    const subtotal = normalizedItems.reduce((sum, item) => sum + item.amount, 0);
    const normalizedTaxRate = parseAmount(taxRate) / 100;
    const tax = subtotal * normalizedTaxRate;

    return {
      items: normalizedItems,
      subtotal,
      tax,
      total: subtotal + tax,
    };
  };

  return {
    parseAmount,
    calculateTotals,
  };
});
