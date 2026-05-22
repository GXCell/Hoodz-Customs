const form = document.querySelector('#invoice-form');
const lineItems = document.querySelector('#line-items');
const lineItemTemplate = document.querySelector('#line-item-template');
const addLineItemButton = document.querySelector('#add-line-item');
const printButton = document.querySelector('#print-invoice');
const subtotalDisplay = document.querySelector('#subtotal-display');
const taxDisplay = document.querySelector('#tax-display');
const totalDisplay = document.querySelector('#total-display');
const previewEmpty = document.querySelector('#preview-empty');
const previewContent = document.querySelector('#preview-content');

const { parseAmount, calculateTotals } = window.InvoiceUtils;

const formatter = new Intl.NumberFormat('en-US', {
  style: 'currency',
  currency: 'USD',
});

const previewFields = {
  shopName: document.querySelector('#preview-shop-name'),
  shopEmail: document.querySelector('#preview-shop-email'),
  invoiceNumber: document.querySelector('#preview-invoice-number'),
  invoiceDate: document.querySelector('#preview-invoice-date'),
  paymentStatus: document.querySelector('#preview-payment-status'),
  customerName: document.querySelector('#preview-customer-name'),
  customerPhone: document.querySelector('#preview-customer-phone'),
  vehicle: document.querySelector('#preview-vehicle'),
  vin: document.querySelector('#preview-vin'),
  repairConcern: document.querySelector('#preview-repair-concern'),
  technicianNotes: document.querySelector('#preview-technician-notes'),
  lineItems: document.querySelector('#preview-line-items'),
  subtotal: document.querySelector('#preview-subtotal'),
  tax: document.querySelector('#preview-tax'),
  total: document.querySelector('#preview-total'),
};

const formatCurrency = (value) => formatter.format(value || 0);

const appendPreviewCell = (row, value) => {
  const cell = document.createElement('td');
  cell.textContent = String(value);
  row.appendChild(cell);
};

const createInvoiceNumber = () => {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, '').slice(0, 14);
  return `ARI-${stamp}`;
};

const setDefaults = () => {
  document.querySelector('#invoice-number').value = createInvoiceNumber();
  document.querySelector('#invoice-date').value = new Date().toISOString().split('T')[0];
};

const createLineItem = (item = {}) => {
  const fragment = lineItemTemplate.content.cloneNode(true);
  const row = fragment.querySelector('.line-item');
  row.querySelector('.item-type').value = item.type || 'Labor';
  row.querySelector('.item-description').value = item.description || '';
  row.querySelector('.item-quantity').value = item.quantity || 1;
  row.querySelector('.item-price').value = item.price || 0;
  lineItems.appendChild(fragment);
  updateTotals();
};

const getLineItemRows = () => Array.from(document.querySelectorAll('.line-item'));

const summarizeRow = (row) => {
  const quantity = parseAmount(row.querySelector('.item-quantity').value);
  const price = parseAmount(row.querySelector('.item-price').value);
  const amount = quantity * price;
  row.querySelector('.item-total').textContent = formatCurrency(amount);

  return {
    type: row.querySelector('.item-type').value,
    description: row.querySelector('.item-description').value.trim(),
    quantity,
    price,
    amount,
  };
};

const updateTotals = () => {
  const items = getLineItemRows().map(summarizeRow);
  const { subtotal, tax, total } = calculateTotals(items, document.querySelector('#tax-rate').value);

  subtotalDisplay.textContent = formatCurrency(subtotal);
  taxDisplay.textContent = formatCurrency(tax);
  totalDisplay.textContent = formatCurrency(total);

  return { items, subtotal, tax, total };
};

const setPreviewText = (field, value, fallback = '—') => {
  previewFields[field].textContent = value && value.trim() ? value.trim() : fallback;
};

const renderPreview = () => {
  const { items, subtotal, tax, total } = updateTotals();
  const data = new FormData(form);

  setPreviewText('shopName', data.get('shopName'));
  setPreviewText('shopEmail', data.get('shopEmail'));
  setPreviewText('invoiceNumber', data.get('invoiceNumber'));
  setPreviewText('invoiceDate', data.get('invoiceDate'));
  setPreviewText('paymentStatus', data.get('paymentStatus'));
  setPreviewText('customerName', data.get('customerName'));
  setPreviewText('customerPhone', data.get('customerPhone'));
  setPreviewText('vehicle', data.get('vehicle'));
  setPreviewText('vin', data.get('vin'));
  setPreviewText('repairConcern', data.get('repairConcern'));
  setPreviewText('technicianNotes', data.get('technicianNotes'));

  previewFields.lineItems.innerHTML = '';

  items
    .filter((item) => item.description)
    .forEach((item) => {
      const row = document.createElement('tr');
      appendPreviewCell(row, item.type);
      appendPreviewCell(row, item.description);
      appendPreviewCell(row, item.quantity);
      appendPreviewCell(row, formatCurrency(item.price));
      appendPreviewCell(row, formatCurrency(item.amount));
      previewFields.lineItems.appendChild(row);
    });

  if (!previewFields.lineItems.children.length) {
    const row = document.createElement('tr');
    const cell = document.createElement('td');
    cell.colSpan = 5;
    cell.textContent = 'No repair items added.';
    row.appendChild(cell);
    previewFields.lineItems.appendChild(row);
  }

  previewFields.subtotal.textContent = formatCurrency(subtotal);
  previewFields.tax.textContent = formatCurrency(tax);
  previewFields.total.textContent = formatCurrency(total);

  previewEmpty.hidden = true;
  previewContent.hidden = false;
  printButton.disabled = false;
};

lineItems.addEventListener('input', updateTotals);
lineItems.addEventListener('click', (event) => {
  if (!event.target.classList.contains('remove-line-item')) {
    return;
  }

  event.target.closest('.line-item').remove();
  updateTotals();
});

addLineItemButton.addEventListener('click', () => {
  createLineItem();
});

document.querySelector('#tax-rate').addEventListener('input', updateTotals);

form.addEventListener('submit', (event) => {
  event.preventDefault();
  renderPreview();
});

printButton.addEventListener('click', () => {
  window.print();
});

setDefaults();
createLineItem({
  type: 'Labor',
  description: 'Diagnostic inspection',
  quantity: 1,
  price: 95,
});
createLineItem({
  type: 'Part',
  description: 'Brake pads set',
  quantity: 1,
  price: 125,
});
