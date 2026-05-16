// ─── AUTH ─────────────────────────────────────────────────────────────────────
function getUsers() { return JSON.parse(localStorage.getItem('exposell_users') || '[]'); }
function saveUsers(users) { localStorage.setItem('exposell_users', JSON.stringify(users)); }
function getSession() { return localStorage.getItem('exposell_session'); }
function setSession(username) { localStorage.setItem('exposell_session', username); }
function clearSession() { localStorage.removeItem('exposell_session'); }

function hashPassword(pw) {
  // Simple deterministic hash for local storage (not cryptographic, fine for local-only app)
  let h = 0;
  for (let i = 0; i < pw.length; i++) { h = (Math.imul(31, h) + pw.charCodeAt(i)) | 0; }
  return h.toString(36);
}

function showApp(username) {
  document.getElementById('auth-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  const users = getUsers();
  const user = users.find(u => u.username === username);
  document.getElementById('logged-in-user').textContent = `👤 ${user ? user.name || user.username : username}`;
}

function showAuth() {
  document.getElementById('app').style.display = 'none';
  document.getElementById('auth-screen').style.display = 'flex';
}

// Tab switching
document.getElementById('tab-login').addEventListener('click', () => {
  document.getElementById('tab-login').classList.add('active');
  document.getElementById('tab-signup').classList.remove('active');
  document.getElementById('form-login').style.display = 'block';
  document.getElementById('form-signup').style.display = 'none';
  document.getElementById('login-error').textContent = '';
});
document.getElementById('tab-signup').addEventListener('click', () => {
  document.getElementById('tab-signup').classList.add('active');
  document.getElementById('tab-login').classList.remove('active');
  document.getElementById('form-signup').style.display = 'block';
  document.getElementById('form-login').style.display = 'none';
  document.getElementById('signup-error').textContent = '';
});

// Login
document.getElementById('login-btn').addEventListener('click', () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  if (!username || !password) { errEl.textContent = 'Fill in all fields.'; return; }
  const users = getUsers();
  const user = users.find(u => u.username.toLowerCase() === username.toLowerCase());
  if (!user || user.passwordHash !== hashPassword(password)) {
    errEl.textContent = 'Wrong username or password.'; return;
  }
  setSession(user.username);
  showApp(user.username);
  initApp();
});

// Enter key on login
['login-username','login-password'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
  });
});

// Signup
document.getElementById('signup-btn').addEventListener('click', () => {
  const name = document.getElementById('signup-name').value.trim();
  const username = document.getElementById('signup-username').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirm = document.getElementById('signup-confirm').value;
  const errEl = document.getElementById('signup-error');
  if (!name || !username || !password || !confirm) { errEl.textContent = 'Fill in all fields.'; return; }
  if (username.length < 3) { errEl.textContent = 'Username too short.'; return; }
  if (password.length < 4) { errEl.textContent = 'Password too short.'; return; }
  if (password !== confirm) { errEl.textContent = "Passwords don't match."; return; }
  const users = getUsers();
  if (users.find(u => u.username.toLowerCase() === username.toLowerCase())) {
    errEl.textContent = 'Username taken.'; return;
  }
  users.push({ name, username, passwordHash: hashPassword(password), createdAt: new Date().toISOString() });
  saveUsers(users);
  setSession(username);
  showApp(username);
  initApp();
});

// Logout
document.getElementById('logout-btn').addEventListener('click', () => {
  clearSession();
  showAuth();
  // Reset nav to POS
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-page="pos"]').classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-pos').classList.add('active');
});

// Check existing session on load
(function checkSession() {
  const session = getSession();
  if (session) {
    const users = getUsers();
    if (users.find(u => u.username === session)) {
      showApp(session);
      return;
    }
    clearSession();
  }
  showAuth();
})();

// ─── STATE ───────────────────────────────────────────────────────────────────
const DEFAULT_PRODUCTS = [
  { id: 1, name: 'Lemonade', category: 'Drinks', price: 2.50, stock: 30, emoji: '🍋' },
  { id: 2, name: 'Cookies (2pk)', category: 'Snacks', price: 1.50, stock: 40, emoji: '🍪' },
  { id: 3, name: 'Bracelet', category: 'Crafts', price: 5.00, stock: 15, emoji: '📿' },
  { id: 4, name: 'Cupcake', category: 'Baked Goods', price: 3.00, stock: 20, emoji: '🧁' },
  { id: 5, name: 'Bookmarks', category: 'Crafts', price: 1.00, stock: 50, emoji: '🔖' },
  { id: 6, name: 'Smoothie', category: 'Drinks', price: 4.00, stock: 12, emoji: '🥤' },
];

let state = loadState();

function loadState() {
  try {
    const saved = localStorage.getItem('exposell_state');
    if (saved) return JSON.parse(saved);
  } catch(e) {}
  return {
    products: JSON.parse(JSON.stringify(DEFAULT_PRODUCTS)),
    sales: [],
    settings: { bizName: 'My School Business', taxRate: 8, currency: '$' },
    nextId: 10,
  };
}

function saveState() {
  localStorage.setItem('exposell_state', JSON.stringify(state));
}

// ─── CART ─────────────────────────────────────────────────────────────────────
let cart = [];
let paymentMethod = 'cash';
let editingProductId = null;

function cartTotal() {
  return cart.reduce((s, i) => s + i.price * i.qty, 0);
}
function cartTax() {
  return cartTotal() * (state.settings.taxRate / 100);
}
function cartGrand() {
  return cartTotal() + cartTax();
}

// ─── UTILS ────────────────────────────────────────────────────────────────────
const sym = () => state.settings.currency;
const fmt = n => `${sym()}${parseFloat(n).toFixed(2)}`;

function toast(msg) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2400);
}

function now() {
  return new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}
function today() {
  return new Date().toLocaleDateString([], { month: 'short', day: 'numeric', year: 'numeric' });
}

// ─── NAV ──────────────────────────────────────────────────────────────────────
document.querySelectorAll('.nav-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    const page = btn.dataset.page;
    document.getElementById('page-' + page).classList.add('active');
    if (page === 'inventory') renderInventory();
    if (page === 'reports') renderReports();
    if (page === 'admin') renderAdmin();
    if (page === 'invoice') renderInvoicePage();
    if (page === 'restaurant') initRestaurant();
  });
});

// ─── POS PAGE ─────────────────────────────────────────────────────────────────
function renderProducts(filter = '') {
  const grid = document.getElementById('product-grid');
  const filtered = state.products.filter(p =>
    p.name.toLowerCase().includes(filter.toLowerCase()) ||
    p.category.toLowerCase().includes(filter.toLowerCase())
  );
  grid.innerHTML = filtered.map(p => `
    <div class="product-card ${p.stock <= 0 ? 'out-of-stock' : ''}" data-id="${p.id}">
      <span class="product-emoji">${p.emoji}</span>
      <div class="product-name">${p.name}</div>
      <div class="product-price">${fmt(p.price)}</div>
      <div class="product-stock ${p.stock <= 3 && p.stock > 0 ? 'low' : ''}">
        ${p.stock <= 0 ? 'Out of stock' : p.stock <= 3 ? `⚠ Only ${p.stock} left` : `${p.stock} in stock`}
      </div>
    </div>
  `).join('');

  grid.querySelectorAll('.product-card').forEach(card => {
    card.addEventListener('click', () => addToCart(parseInt(card.dataset.id)));
  });
}

function addToCart(id) {
  const product = state.products.find(p => p.id === id);
  if (!product || product.stock <= 0) return;
  const existing = cart.find(i => i.id === id);
  if (existing) {
    if (existing.qty >= product.stock) { toast('Out of stock.'); return; }
    existing.qty++;
  } else {
    cart.push({ id, name: product.name, price: product.price, qty: 1, emoji: product.emoji });
  }
  renderCart();
}

function renderCart() {
  const el = document.getElementById('cart-items');
  if (cart.length === 0) {
    el.innerHTML = '<div class="cart-empty">Nothing here yet.<br/>Tap a product to add it.</div>';
  } else {
    el.innerHTML = cart.map(item => `
      <div class="cart-item" data-id="${item.id}">
        <span class="ci-emoji">${item.emoji}</span>
        <div class="ci-info">
          <div class="ci-name">${item.name}</div>
          <div class="ci-price">${fmt(item.price)} each</div>
        </div>
        <div class="ci-controls">
          <button class="qty-btn" data-action="dec" data-id="${item.id}">−</button>
          <span class="qty-val">${item.qty}</span>
          <button class="qty-btn" data-action="inc" data-id="${item.id}">+</button>
        </div>
        <span class="ci-total">${fmt(item.price * item.qty)}</span>
      </div>
    `).join('');

    el.querySelectorAll('.qty-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        const id = parseInt(btn.dataset.id);
        const action = btn.dataset.action;
        const idx = cart.findIndex(i => i.id === id);
        if (action === 'inc') {
          const prod = state.products.find(p => p.id === id);
          if (cart[idx].qty >= prod.stock) { toast('Out of stock.'); return; }
          cart[idx].qty++;
        } else {
          cart[idx].qty--;
          if (cart[idx].qty <= 0) cart.splice(idx, 1);
        }
        renderCart();
      });
    });
  }

  const sub = cartTotal();
  const tax = cartTax();
  const grand = cartGrand();
  document.getElementById('subtotal').textContent = fmt(sub);
  document.getElementById('tax').textContent = fmt(tax);
  document.getElementById('total').textContent = fmt(grand);
  updateSidebarTotal();
  updateChange();
}

function updateSidebarTotal() {
  const todaySales = state.sales
    .filter(s => s.date === today())
    .reduce((sum, s) => sum + s.total, 0);
  document.getElementById('sidebar-total').textContent = fmt(todaySales);
}

document.getElementById('product-search').addEventListener('input', e => renderProducts(e.target.value));
document.getElementById('clear-cart-btn').addEventListener('click', () => { cart = []; renderCart(); });

// Payment methods
document.querySelectorAll('.pay-method').forEach(btn => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.pay-method').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
    paymentMethod = btn.dataset.method;
    const cashArea = document.getElementById('cash-input-area');
    cashArea.style.display = paymentMethod === 'cash' ? 'block' : 'none';
  });
});

function updateChange() {
  if (paymentMethod !== 'cash') return;
  const received = parseFloat(document.getElementById('cash-received').value) || 0;
  const grand = cartGrand();
  const el = document.getElementById('change-display');
  if (received >= grand && grand > 0) {
    el.textContent = `Change: ${fmt(received - grand)}`;
    el.style.color = 'var(--green)';
  } else if (received > 0 && received < grand) {
    el.textContent = `Short: ${fmt(grand - received)}`;
    el.style.color = 'var(--red)';
  } else {
    el.textContent = '';
  }
}

document.getElementById('cash-received').addEventListener('input', updateChange);

// CHECKOUT
document.getElementById('checkout-btn').addEventListener('click', () => {
  if (cart.length === 0) { toast('Nothing in the cart.'); return; }
  if (paymentMethod === 'cash') {
    const received = parseFloat(document.getElementById('cash-received').value) || 0;
    if (received < cartGrand()) { toast('Not enough cash.'); return; }
  }

  // Record sale
  const sale = {
    id: Date.now(),
    items: JSON.parse(JSON.stringify(cart)),
    subtotal: cartTotal(),
    tax: cartTax(),
    total: cartGrand(),
    paymentMethod,
    cashReceived: paymentMethod === 'cash' ? parseFloat(document.getElementById('cash-received').value) : null,
    time: now(),
    date: today(),
  };
  state.sales.push(sale);

  // Deduct stock
  cart.forEach(item => {
    const prod = state.products.find(p => p.id === item.id);
    if (prod) prod.stock -= item.qty;
  });

  saveState();
  showReceipt(sale);
  renderProducts();
  updateSidebarTotal();
});

function buildReceiptText(sale) {
  const change = sale.cashReceived != null ? sale.cashReceived - sale.total : null;
  const lines = [
    state.settings.bizName,
    'Open Source Free POS',
    `${sale.date}  ${sale.time}`,
    '----------------------------',
    ...sale.items.map(i => `${i.emoji} ${i.name} x${i.qty}   ${fmt(i.price * i.qty)}`),
    '----------------------------',
    `Subtotal: ${fmt(sale.subtotal)}`,
    `Tax (${state.settings.taxRate}%): ${fmt(sale.tax)}`,
    `TOTAL: ${fmt(sale.total)}`,
    sale.paymentMethod === 'cash'
      ? `Cash: ${fmt(sale.cashReceived)}  Change: ${fmt(change)}`
      : `Paid by: ${sale.paymentMethod}`,
    '----------------------------',
    'Thanks for your purchase!',
  ];
  return lines.join('\n');
}

function qrUrl(text) {
  return `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(text)}`;
}

function showReceipt(sale) {
  const change = sale.cashReceived != null ? sale.cashReceived - sale.total : null;
  const receiptText = buildReceiptText(sale);
  const content = `
    <div class="receipt-header">
      <div class="r-biz">${state.settings.bizName}</div>
      <div style="font-size:12px;color:#888">${sale.date} · ${sale.time}</div>
    </div>
    <hr class="receipt-divider"/>
    ${sale.items.map(i => `
      <div class="receipt-row">
        <span>${i.emoji} ${i.name} ×${i.qty}</span>
        <span>${fmt(i.price * i.qty)}</span>
      </div>
    `).join('')}
    <hr class="receipt-divider"/>
    <div class="receipt-row"><span>Subtotal</span><span>${fmt(sale.subtotal)}</span></div>
    <div class="receipt-row"><span>Tax (${state.settings.taxRate}%)</span><span>${fmt(sale.tax)}</span></div>
    <hr class="receipt-divider"/>
    <div class="receipt-total-row"><span>Total</span><span>${fmt(sale.total)}</span></div>
    ${sale.paymentMethod === 'cash' ? `
    <hr class="receipt-divider"/>
    <div class="receipt-row"><span>Cash</span><span>${fmt(sale.cashReceived)}</span></div>
    <div class="receipt-row"><span>Change</span><span>${fmt(change)}</span></div>
    ` : `<div class="receipt-row" style="margin-top:6px"><span>Paid by</span><span>${sale.paymentMethod}</span></div>`}
    <hr class="receipt-divider"/>
    <div class="receipt-qr">
      <div style="font-size:11px;color:#999;margin-bottom:6px">Scan for your receipt</div>
      <img src="${qrUrl(receiptText)}" width="120" height="120" alt="Receipt QR code" />
    </div>
    <div class="receipt-footer">Thanks for your purchase! 🎉</div>
  `;
  document.getElementById('receipt-content').innerHTML = content;
  document.getElementById('receipt-modal').classList.add('open');
}

document.getElementById('print-receipt-btn').addEventListener('click', () => {
  const sale = state.sales[state.sales.length - 1];
  const receiptText = sale ? buildReceiptText(sale) : '';
  const content = document.getElementById('receipt-content').innerHTML;
  const win = window.open('', '_blank', 'width=380,height=680');
  win.document.write(`<!DOCTYPE html><html><head><title>Receipt</title><style>
    body { font-family: 'Courier New', monospace; font-size: 13px; padding: 24px; max-width: 320px; margin: 0 auto; }
    .receipt-header { text-align: center; margin-bottom: 10px; }
    .r-biz { font-size: 16px; font-weight: bold; }
    .receipt-divider { border: none; border-top: 1px dashed #aaa; margin: 8px 0; }
    .receipt-row, .receipt-total-row { display: flex; justify-content: space-between; margin: 3px 0; }
    .receipt-total-row { font-weight: bold; font-size: 15px; }
    .receipt-qr { text-align: center; margin: 12px 0 8px; }
    .receipt-footer { text-align: center; color: #888; margin-top: 8px; font-size: 12px; }
    @media print { body { padding: 0; } }
  </style></head><body>${content}</body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); win.close(); }, 600);
});
document.getElementById('close-receipt-btn').addEventListener('click', () => {
  document.getElementById('receipt-modal').classList.remove('open');
  cart = [];
  document.getElementById('cash-received').value = '';
  document.getElementById('change-display').textContent = '';
  renderCart();
});

// ─── INVENTORY PAGE ───────────────────────────────────────────────────────────
function renderInventory() {
  const products = state.products;
  const total = products.length;
  const lowStock = products.filter(p => p.stock > 0 && p.stock <= 5).length;
  const outOfStock = products.filter(p => p.stock <= 0).length;
  const totalValue = products.reduce((s, p) => s + p.price * p.stock, 0);

  document.getElementById('inventory-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Products</div><div class="stat-val">${total}</div></div>
    <div class="stat-card"><div class="stat-label">Low Stock</div><div class="stat-val amber">${lowStock}</div></div>
    <div class="stat-card"><div class="stat-label">Out of Stock</div><div class="stat-val red">${outOfStock}</div></div>
    <div class="stat-card"><div class="stat-label">Inventory Value</div><div class="stat-val green">${fmt(totalValue)}</div></div>
  `;

  document.getElementById('inventory-tbody').innerHTML = products.map(p => `
    <tr>
      <td>${p.emoji} <strong>${p.name}</strong></td>
      <td>${p.category}</td>
      <td style="font-family:'DM Mono',monospace">${fmt(p.price)}</td>
      <td style="font-family:'DM Mono',monospace">${p.stock}</td>
      <td>
        <span class="badge ${p.stock <= 0 ? 'badge-out' : p.stock <= 5 ? 'badge-low' : 'badge-ok'}">
          ${p.stock <= 0 ? 'Out of Stock' : p.stock <= 5 ? 'Low Stock' : 'In Stock'}
        </span>
      </td>
      <td>
        <div class="action-btns">
          <button class="tbl-btn edit-btn" data-id="${p.id}">Edit</button>
          <button class="tbl-btn restock-btn" data-id="${p.id}">+Restock</button>
          <button class="tbl-btn del delete-btn" data-id="${p.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');

  document.querySelectorAll('.edit-btn').forEach(btn => {
    btn.addEventListener('click', () => openEditProduct(parseInt(btn.dataset.id)));
  });
  document.querySelectorAll('.delete-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (confirm('Delete this item?')) {
        state.products = state.products.filter(p => p.id !== parseInt(btn.dataset.id));
        saveState();
        renderInventory();
        renderProducts();
        toast('Deleted.');
      }
    });
  });
  document.querySelectorAll('.restock-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const qty = parseInt(prompt('How many to add?', '10'));
      if (!isNaN(qty) && qty > 0) {
        const prod = state.products.find(p => p.id === parseInt(btn.dataset.id));
        if (prod) { prod.stock += qty; saveState(); renderInventory(); renderProducts(); toast(`+${qty} added.`); }
      }
    });
  });
}

// Add/Edit product modal
document.getElementById('open-add-product').addEventListener('click', () => openAddProduct());

function openAddProduct() {
  editingProductId = null;
  document.getElementById('product-modal-title').textContent = 'Add Product';
  document.getElementById('p-name').value = '';
  document.getElementById('p-cat').value = '';
  document.getElementById('p-price').value = '';
  document.getElementById('p-stock').value = '';
  document.getElementById('p-emoji').value = '';
  document.getElementById('product-modal').classList.add('open');
}

function openEditProduct(id) {
  const p = state.products.find(x => x.id === id);
  if (!p) return;
  editingProductId = id;
  document.getElementById('product-modal-title').textContent = 'Edit Product';
  document.getElementById('p-name').value = p.name;
  document.getElementById('p-cat').value = p.category;
  document.getElementById('p-price').value = p.price;
  document.getElementById('p-stock').value = p.stock;
  document.getElementById('p-emoji').value = p.emoji;
  document.getElementById('product-modal').classList.add('open');
}

document.getElementById('save-product-btn').addEventListener('click', () => {
  const name = document.getElementById('p-name').value.trim();
  const cat = document.getElementById('p-cat').value.trim();
  const price = parseFloat(document.getElementById('p-price').value);
  const stock = parseInt(document.getElementById('p-stock').value);
  const emoji = document.getElementById('p-emoji').value.trim() || '📦';

  if (!name || isNaN(price) || isNaN(stock)) { toast('Fill in all fields.'); return; }

  if (editingProductId !== null) {
    const idx = state.products.findIndex(p => p.id === editingProductId);
    state.products[idx] = { ...state.products[idx], name, category: cat, price, stock, emoji };
    toast('Saved.');
  } else {
    state.products.push({ id: state.nextId++, name, category: cat, price, stock, emoji });
    toast('Added.');
  }

  saveState();
  document.getElementById('product-modal').classList.remove('open');
  renderInventory();
  renderProducts();
});

document.getElementById('cancel-product-btn').addEventListener('click', () => {
  document.getElementById('product-modal').classList.remove('open');
});

// ─── REPORTS PAGE ─────────────────────────────────────────────────────────────
function renderReports() {
  const sales = state.sales;
  const todaySales = sales.filter(s => s.date === today());
  const totalRev = sales.reduce((s, x) => s + x.total, 0);
  const todayRev = todaySales.reduce((s, x) => s + x.total, 0);
  const totalTx = sales.length;

  document.getElementById('report-stats').innerHTML = `
    <div class="stat-card"><div class="stat-label">Total Revenue</div><div class="stat-val green">${fmt(totalRev)}</div></div>
    <div class="stat-card"><div class="stat-label">Today's Revenue</div><div class="stat-val green">${fmt(todayRev)}</div></div>
    <div class="stat-card"><div class="stat-label">Total Transactions</div><div class="stat-val">${totalTx}</div></div>
    <div class="stat-card"><div class="stat-label">Avg Order</div><div class="stat-val">${totalTx > 0 ? fmt(totalRev / totalTx) : fmt(0)}</div></div>
  `;

  // Top products
  const productSales = {};
  sales.forEach(sale => {
    sale.items.forEach(item => {
      if (!productSales[item.name]) productSales[item.name] = { qty: 0, revenue: 0, emoji: item.emoji };
      productSales[item.name].qty += item.qty;
      productSales[item.name].revenue += item.price * item.qty;
    });
  });

  const sorted = Object.entries(productSales).sort((a, b) => b[1].revenue - a[1].revenue).slice(0, 6);
  const topList = document.getElementById('top-products-list');
  if (sorted.length === 0) {
    topList.innerHTML = '<div style="color:var(--text3);font-size:14px;padding:10px 0">No sales yet.</div>';
  } else {
    topList.innerHTML = sorted.map(([name, data], i) => `
      <div class="top-product-row">
        <span class="tp-rank">#${i + 1}</span>
        <span>${data.emoji}</span>
        <span class="tp-name">${name}</span>
        <span class="tp-count">${data.qty} sold</span>
        <span class="tp-rev">${fmt(data.revenue)}</span>
      </div>
    `).join('');
  }

  // Sales log
  const log = document.getElementById('sales-log');
  if (sales.length === 0) {
    log.innerHTML = '<div style="color:var(--text3);font-size:14px;padding:10px 0">No sales yet.</div>';
  } else {
    log.innerHTML = [...sales].reverse().map(s => `
      <div class="sale-entry">
        <div class="sale-entry-top">
          <span>${s.date} <span class="sale-time">${s.time}</span></span>
          <span class="sale-amount">${fmt(s.total)}</span>
        </div>
        <div class="sale-items">${s.items.map(i => `${i.emoji} ${i.name} x${i.qty}`).join(', ')} · ${s.paymentMethod}</div>
      </div>
    `).join('');
  }
}

document.getElementById('export-csv-btn').addEventListener('click', () => {
  if (state.sales.length === 0) { toast('No sales yet.'); return; }
  let csv = 'Date,Time,Items,Subtotal,Tax,Total,Payment\n';
  state.sales.forEach(s => {
    const items = s.items.map(i => `${i.name} x${i.qty}`).join(' | ');
    csv += `"${s.date}","${s.time}","${items}",${s.subtotal.toFixed(2)},${s.tax.toFixed(2)},${s.total.toFixed(2)},${s.paymentMethod}\n`;
  });
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'sales-report.csv'; a.click();
  URL.revokeObjectURL(url);
  toast('Exported.');
});

// ─── ADMIN PAGE ───────────────────────────────────────────────────────────────
function renderAdmin() {
  document.getElementById('biz-name').value = state.settings.bizName;
  document.getElementById('tax-rate').value = state.settings.taxRate;
  document.getElementById('currency-sym').value = state.settings.currency;

  // Low stock
  const low = state.products.filter(p => p.stock <= 5);
  const lowEl = document.getElementById('low-stock-list');
  if (low.length === 0) {
    lowEl.innerHTML = '<div style="color:var(--green);font-size:14px;padding:8px 0">✓ All products are well stocked.</div>';
  } else {
    lowEl.innerHTML = low.map(p => `
      <div class="low-stock-item">
        <span>${p.emoji} ${p.name}</span>
        <span class="ls-qty">${p.stock <= 0 ? 'OUT' : p.stock + ' left'}</span>
      </div>
    `).join('');
  }

  // Accounts list
  const users = getUsers();
  const accEl = document.getElementById('accounts-list');
  if (users.length === 0) {
    accEl.innerHTML = '<div style="color:var(--text3);font-size:14px;padding:8px 0">No accounts yet.</div>';
  } else {
    accEl.innerHTML = users.map(u => `
      <div class="account-row">
        <div>
          <div class="account-name">${u.name}</div>
          <div class="account-user">@${u.username}</div>
        </div>
        ${u.username !== getSession() ? `<button class="tbl-btn del" data-deluser="${u.username}">Remove</button>` : '<span style="font-size:12px;color:var(--text3)">You</span>'}
      </div>
    `).join('');
    accEl.querySelectorAll('[data-deluser]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm(`Remove account @${btn.dataset.deluser}?`)) return;
        const updated = getUsers().filter(u => u.username !== btn.dataset.deluser);
        saveUsers(updated);
        renderAdmin();
        toast('Removed.');
      });
    });
  }

  const totalSold = state.sales.reduce((s, sale) => s + sale.items.reduce((a, i) => a + i.qty, 0), 0);
  const totalRev = state.sales.reduce((s, x) => s + x.total, 0);
  const cashSales = state.sales.filter(s => s.paymentMethod === 'cash').length;
  const cardSales = state.sales.filter(s => s.paymentMethod === 'card').length;
  document.getElementById('admin-quick-stats').innerHTML = `
    <div class="admin-stat-row"><span>Total Items Sold</span><span class="admin-stat-val">${totalSold}</span></div>
    <div class="admin-stat-row"><span>Total Revenue</span><span class="admin-stat-val">${fmt(totalRev)}</span></div>
    <div class="admin-stat-row"><span>Transactions</span><span class="admin-stat-val">${state.sales.length}</span></div>
    <div class="admin-stat-row"><span>Cash Sales</span><span class="admin-stat-val">${cashSales}</span></div>
    <div class="admin-stat-row"><span>Card Sales</span><span class="admin-stat-val">${cardSales}</span></div>
    <div class="admin-stat-row"><span>Products Listed</span><span class="admin-stat-val">${state.products.length}</span></div>
  `;
}

document.getElementById('save-settings-btn').addEventListener('click', () => {
  state.settings.bizName = document.getElementById('biz-name').value.trim() || 'My Business';
  state.settings.taxRate = parseFloat(document.getElementById('tax-rate').value) || 0;
  state.settings.currency = document.getElementById('currency-sym').value.trim() || '$';
  saveState();
  renderCart();
  toast('Saved.');
});

document.getElementById('reset-sales-btn').addEventListener('click', () => {
  if (confirm("Clear all sales? This can't be undone.")) {
    state.sales = [];
    saveState();
    renderAdmin();
    updateSidebarTotal();
    toast('Sales cleared.');
  }
});

document.getElementById('reset-all-btn').addEventListener('click', () => {
  if (confirm("Reset everything? This can't be undone.")) {
    localStorage.removeItem('exposell_state');
    state = loadState();
    cart = [];
    renderProducts();
    renderCart();
    renderAdmin();
    updateSidebarTotal();
    toast('Reset done.');
  }
});

// Close modals when clicking overlay
document.querySelectorAll('.modal-overlay').forEach(overlay => {
  overlay.addEventListener('click', e => {
    if (e.target === overlay) overlay.classList.remove('open');
  });
});

// ─── INVOICE PAGE ─────────────────────────────────────────────────────────────
let invLineItems = [{ desc: '', qty: 1, price: '' }];
let savedInvoices = JSON.parse(localStorage.getItem('exposell_invoices') || '[]');
let invCounter = savedInvoices.length + 1;

function saveInvoices() {
  localStorage.setItem('exposell_invoices', JSON.stringify(savedInvoices));
}

function renderInvoicePage() {
  // Pre-fill from settings
  const fromName = document.getElementById('inv-from-name');
  if (!fromName.value) fromName.value = state.settings.bizName;

  // Set today's date
  const dateEl = document.getElementById('inv-date');
  if (!dateEl.value) dateEl.value = new Date().toISOString().split('T')[0];

  // Set invoice number
  const numEl = document.getElementById('inv-number');
  if (!numEl.value) numEl.value = `INV-${String(invCounter).padStart(3, '0')}`;

  renderLineItems();
  renderInvSummary();
  renderSavedInvoices();
}

function renderLineItems() {
  const container = document.getElementById('inv-line-items');
  container.innerHTML = `
    <div class="line-item-header">
      <span style="padding-left:10px">Description</span>
      <span>Qty</span>
      <span>Unit Price</span>
      <span></span>
    </div>
  ` + invLineItems.map((item, i) => `
    <div class="line-item-row" data-index="${i}">
      <input type="text" class="li-desc" value="${item.desc}" placeholder="Item description" />
      <input type="number" class="li-qty" value="${item.qty}" min="1" step="1" />
      <input type="number" class="li-price" value="${item.price}" min="0" step="0.01" placeholder="0.00" />
      <button class="remove-line-btn" data-index="${i}" title="Remove">×</button>
    </div>
  `).join('');

  // Sync inputs back to state
  container.querySelectorAll('.line-item-row').forEach(row => {
    const i = parseInt(row.dataset.index);
    row.querySelector('.li-desc').addEventListener('input', e => { invLineItems[i].desc = e.target.value; renderInvSummary(); });
    row.querySelector('.li-qty').addEventListener('input', e => { invLineItems[i].qty = parseFloat(e.target.value) || 0; renderInvSummary(); });
    row.querySelector('.li-price').addEventListener('input', e => { invLineItems[i].price = parseFloat(e.target.value) || 0; renderInvSummary(); });
    row.querySelector('.remove-line-btn').addEventListener('click', () => {
      if (invLineItems.length === 1) { toast('Need at least one item.'); return; }
      invLineItems.splice(i, 1);
      renderLineItems();
      renderInvSummary();
    });
  });
}

function renderInvSummary() {
  const taxRate = parseFloat(document.getElementById('inv-tax').value) || 0;
  const rows = document.getElementById('inv-summary');
  const validItems = invLineItems.filter(i => i.desc && i.price > 0);
  const subtotal = validItems.reduce((s, i) => s + (parseFloat(i.price) * parseFloat(i.qty || 1)), 0);
  const tax = subtotal * (taxRate / 100);
  const grand = subtotal + tax;

  rows.innerHTML = validItems.length === 0
    ? '<div style="color:var(--text3);font-size:13px;padding:8px 0">Nothing here yet.</div>'
    : validItems.map(i => `
      <div class="inv-summary-row">
        <span>${i.desc} ×${i.qty}</span>
        <span>${fmt(parseFloat(i.price) * parseFloat(i.qty || 1))}</span>
      </div>
    `).join('') + `
      <div class="inv-summary-row" style="color:var(--text2)"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
      <div class="inv-summary-row" style="color:var(--text3)"><span>Tax (${taxRate}%)</span><span>${fmt(tax)}</span></div>
    `;

  document.getElementById('inv-grand-total').textContent = fmt(grand);
}

function renderSavedInvoices() {
  const el = document.getElementById('inv-saved-list');
  if (savedInvoices.length === 0) { el.innerHTML = ''; return; }
  el.innerHTML = `<div class="inv-saved-title">Saved Invoices</div>` +
    [...savedInvoices].reverse().slice(0, 5).map((inv, i) => `
      <div class="inv-saved-item">
        <div>
          <div style="font-weight:500">${inv.number}</div>
          <div style="font-size:12px;color:var(--text3)">${inv.toName || 'No customer'} · ${fmt(inv.grand)}</div>
        </div>
        <div class="inv-saved-actions">
          <button class="inv-saved-btn" data-print="${savedInvoices.length - 1 - i}">Print</button>
          <button class="inv-saved-btn del" data-del="${savedInvoices.length - 1 - i}" style="color:var(--red)">Del</button>
        </div>
      </div>
    `).join('');

  el.querySelectorAll('[data-print]').forEach(btn => {
    btn.addEventListener('click', () => printInvoice(savedInvoices[parseInt(btn.dataset.print)]));
  });
  el.querySelectorAll('[data-del]').forEach(btn => {
    btn.addEventListener('click', () => {
      savedInvoices.splice(parseInt(btn.dataset.del), 1);
      saveInvoices();
      renderSavedInvoices();
      toast('Deleted.');
    });
  });
}

document.getElementById('inv-add-line-btn').addEventListener('click', () => {
  invLineItems.push({ desc: '', qty: 1, price: '' });
  renderLineItems();
});

document.getElementById('inv-tax').addEventListener('input', renderInvSummary);

document.getElementById('invoice-clear-btn').addEventListener('click', () => {
  if (!confirm('Clear this invoice?')) return;
  invLineItems = [{ desc: '', qty: 1, price: '' }];
  ['inv-from-name','inv-from-email','inv-to-name','inv-to-email','inv-number','inv-date','inv-due','inv-notes'].forEach(id => {
    document.getElementById(id).value = '';
  });
  invCounter++;
  renderInvoicePage();
  toast('Cleared.');
});

document.getElementById('invoice-preview-btn').addEventListener('click', () => {
  const taxRate = parseFloat(document.getElementById('inv-tax').value) || 0;
  const validItems = invLineItems.filter(i => i.desc && i.price > 0);
  if (validItems.length === 0) { toast('Add an item first.'); return; }

  const inv = {
    number: document.getElementById('inv-number').value || `INV-${String(invCounter).padStart(3,'0')}`,
    fromName: document.getElementById('inv-from-name').value || state.settings.bizName,
    fromEmail: document.getElementById('inv-from-email').value,
    toName: document.getElementById('inv-to-name').value,
    toEmail: document.getElementById('inv-to-email').value,
    date: document.getElementById('inv-date').value,
    due: document.getElementById('inv-due').value,
    notes: document.getElementById('inv-notes').value,
    items: validItems.map(i => ({ ...i, price: parseFloat(i.price), qty: parseFloat(i.qty) || 1 })),
    taxRate,
    subtotal: validItems.reduce((s, i) => s + parseFloat(i.price) * parseFloat(i.qty || 1), 0),
    get tax() { return this.subtotal * (this.taxRate / 100); },
    get grand() { return this.subtotal + this.tax; },
  };

  savedInvoices.push({ ...inv, tax: inv.tax, grand: inv.grand });
  saveInvoices();
  invCounter++;
  renderSavedInvoices();
  printInvoice(inv);
});

function printInvoice(inv) {
  const subtotal = inv.subtotal;
  const tax = typeof inv.tax === 'number' ? inv.tax : subtotal * ((inv.taxRate||0)/100);
  const grand = typeof inv.grand === 'number' ? inv.grand : subtotal + tax;
  const win = window.open('', '_blank', 'width=760,height=900');
  win.document.write(`<!DOCTYPE html><html><head><title>${inv.number}</title><style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Segoe UI', Arial, sans-serif; font-size: 14px; color: #1a1917; padding: 48px; max-width: 720px; margin: 0 auto; }
    .inv-header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 40px; }
    .inv-biz { font-size: 22px; font-weight: 700; letter-spacing: -0.5px; }
    .inv-biz-email { font-size: 13px; color: #888; margin-top: 4px; }
    .inv-title { font-size: 32px; font-weight: 700; color: #c84b2f; text-align: right; }
    .inv-number { font-size: 14px; color: #888; text-align: right; margin-top: 4px; }
    .inv-meta { display: flex; justify-content: space-between; margin-bottom: 36px; gap: 20px; }
    .inv-bill { flex: 1; }
    .inv-bill-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.5px; color: #aaa; margin-bottom: 6px; }
    .inv-bill-name { font-size: 15px; font-weight: 600; }
    .inv-bill-email { font-size: 13px; color: #888; }
    .inv-dates { text-align: right; }
    .inv-date-row { font-size: 13px; margin-bottom: 4px; color: #555; }
    .inv-date-row strong { color: #1a1917; }
    table { width: 100%; border-collapse: collapse; margin-bottom: 24px; }
    thead th { background: #f5f4f0; padding: 10px 14px; text-align: left; font-size: 12px; text-transform: uppercase; letter-spacing: 0.4px; color: #888; }
    thead th:last-child { text-align: right; }
    tbody td { padding: 11px 14px; border-bottom: 1px solid #eee; font-size: 14px; }
    tbody td:nth-child(2), tbody td:nth-child(3) { text-align: center; }
    tbody td:last-child { text-align: right; font-family: 'Courier New', monospace; }
    .totals { margin-left: auto; width: 260px; }
    .tot-row { display: flex; justify-content: space-between; padding: 6px 0; border-bottom: 1px solid #eee; font-size: 14px; }
    .tot-row.grand { font-size: 16px; font-weight: 700; border-bottom: none; border-top: 2px solid #1a1917; padding-top: 10px; margin-top: 4px; }
    .tot-row span:last-child { font-family: 'Courier New', monospace; }
    .inv-notes { margin-top: 32px; padding: 16px; background: #f9f8f5; border-radius: 8px; border-left: 3px solid #c84b2f; }
    .inv-notes-label { font-size: 11px; text-transform: uppercase; letter-spacing: 0.4px; color: #aaa; margin-bottom: 4px; }
    .inv-notes-text { font-size: 13px; color: #555; line-height: 1.6; }
    .inv-footer { margin-top: 40px; text-align: center; font-size: 12px; color: #bbb; }
    @media print { body { padding: 24px; } }
  </style></head><body>
    <div class="inv-header">
      <div>
        <div class="inv-biz">${inv.fromName || 'My Business'}</div>
        ${inv.fromEmail ? `<div class="inv-biz-email">${inv.fromEmail}</div>` : ''}
      </div>
      <div>
        <div class="inv-title">INVOICE</div>
        <div class="inv-number">${inv.number}</div>
      </div>
    </div>
    <div class="inv-meta">
      <div class="inv-bill">
        <div class="inv-bill-label">Bill To</div>
        <div class="inv-bill-name">${inv.toName || '—'}</div>
        ${inv.toEmail ? `<div class="inv-bill-email">${inv.toEmail}</div>` : ''}
      </div>
      <div class="inv-dates">
        ${inv.date ? `<div class="inv-date-row">Date: <strong>${inv.date}</strong></div>` : ''}
        ${inv.due ? `<div class="inv-date-row">Due: <strong>${inv.due}</strong></div>` : ''}
      </div>
    </div>
    <table>
      <thead><tr><th>Description</th><th>Qty</th><th>Unit Price</th><th>Amount</th></tr></thead>
      <tbody>
        ${inv.items.map(i => `
          <tr>
            <td>${i.desc}</td>
            <td>${i.qty}</td>
            <td>${fmt(i.price)}</td>
            <td>${fmt(i.price * i.qty)}</td>
          </tr>
        `).join('')}
      </tbody>
    </table>
    <div class="totals">
      <div class="tot-row"><span>Subtotal</span><span>${fmt(subtotal)}</span></div>
      <div class="tot-row"><span>Tax (${inv.taxRate}%)</span><span>${fmt(tax)}</span></div>
      <div class="tot-row grand"><span>Total Due</span><span>${fmt(grand)}</span></div>
    </div>
    ${inv.notes ? `<div class="inv-notes"><div class="inv-notes-label">Notes</div><div class="inv-notes-text">${inv.notes}</div></div>` : ''}
    <div class="inv-footer">Open Source Free POS · ${inv.fromName || 'My Business'}</div>
  </body></html>`);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 500);
}


// ─── RESTAURANT MODULE ────────────────────────────────────────────────────────

const DEFAULT_MENU = [
  { id: 'r1', name: 'Garlic Bread', category: 'Starters', price: 4.00, emoji: '🥖', available: true },
  { id: 'r2', name: 'Soup of the Day', category: 'Starters', price: 5.50, emoji: '🍲', available: true },
  { id: 'r3', name: 'Burger', category: 'Mains', price: 10.00, emoji: '🍔', available: true },
  { id: 'r4', name: 'Pasta', category: 'Mains', price: 9.00, emoji: '🍝', available: true },
  { id: 'r5', name: 'Grilled Chicken', category: 'Mains', price: 12.00, emoji: '🍗', available: true },
  { id: 'r6', name: 'Salad', category: 'Mains', price: 7.50, emoji: '🥗', available: true },
  { id: 'r7', name: 'Lemonade', category: 'Drinks', price: 2.50, emoji: '🍋', available: true },
  { id: 'r8', name: 'Water', category: 'Drinks', price: 1.00, emoji: '💧', available: true },
  { id: 'r9', name: 'Soda', category: 'Drinks', price: 2.00, emoji: '🥤', available: true },
  { id: 'r10', name: 'Brownie', category: 'Desserts', price: 4.50, emoji: '🍫', available: true },
  { id: 'r11', name: 'Ice Cream', category: 'Desserts', price: 3.50, emoji: '🍨', available: true },
];

function loadRestaurantState() {
  try {
    const s = localStorage.getItem('exposell_restaurant');
    if (s) return JSON.parse(s);
  } catch(e) {}
  return {
    menu: JSON.parse(JSON.stringify(DEFAULT_MENU)),
    orders: [],
    tables: 10,
    nextOrderId: 1,
    nextMenuId: 100,
  };
}
function saveRestaurantState() { localStorage.setItem('exposell_restaurant', JSON.stringify(rState)); }

let rState = loadRestaurantState();
let rCart = []; // { menuItem, qty, notes }
let rOrderType = 'dine-in';
let rSelectedTable = 1;
let rMenuCategory = 'All';
let rEditingMenuId = null;

// ── Helpers ──────────────────────────────────────────────────────────────────
const rFmt = n => fmt(n);

function rCartTotal() { return rCart.reduce((s, i) => s + i.price * i.qty, 0); }

function getCategories() {
  const cats = [...new Set(rState.menu.map(i => i.category))];
  return ['All', ...cats];
}

// ── Main Render ───────────────────────────────────────────────────────────────
function renderRestaurant() {
  renderRMenuTabs();
  renderRMenuGrid();
  renderRCart();
  renderRTables();
  renderKitchen();
  renderRMenuManager();
}

// ── Menu Tabs ─────────────────────────────────────────────────────────────────
function renderRMenuTabs() {
  const tabs = document.getElementById('r-category-tabs');
  if (!tabs) return;
  tabs.innerHTML = getCategories().map(cat => `
    <button class="r-cat-tab ${rMenuCategory === cat ? 'active' : ''}" data-cat="${cat}">${cat}</button>
  `).join('');
  tabs.querySelectorAll('.r-cat-tab').forEach(btn => {
    btn.addEventListener('click', () => { rMenuCategory = btn.dataset.cat; renderRMenuGrid(); renderRMenuTabs(); });
  });
}

// ── Menu Grid ─────────────────────────────────────────────────────────────────
function renderRMenuGrid() {
  const grid = document.getElementById('r-menu-grid');
  if (!grid) return;
  const items = rState.menu.filter(i =>
    (rMenuCategory === 'All' || i.category === rMenuCategory) && i.available
  );
  grid.innerHTML = items.length === 0
    ? '<div style="color:var(--text3);padding:20px;grid-column:1/-1">No items.</div>'
    : items.map(i => `
    <div class="r-menu-card" data-rid="${i.id}">
      <span class="product-emoji">${i.emoji}</span>
      <div class="product-name">${i.name}</div>
      <div class="product-price">${rFmt(i.price)}</div>
      <div style="font-size:11px;color:var(--text3)">${i.category}</div>
    </div>
  `).join('');
  grid.querySelectorAll('.r-menu-card').forEach(card => {
    card.addEventListener('click', () => addToRCart(card.dataset.rid));
  });
}

// ── Restaurant Cart ───────────────────────────────────────────────────────────
function addToRCart(id) {
  const item = rState.menu.find(i => i.id === id);
  if (!item) return;
  const existing = rCart.find(i => i.id === id);
  if (existing) existing.qty++;
  else rCart.push({ id, name: item.name, price: item.price, emoji: item.emoji, qty: 1 });
  renderRCart();
}

function renderRCart() {
  const el = document.getElementById('r-cart-items');
  if (!el) return;

  // Order type buttons
  document.querySelectorAll('.r-order-type').forEach(btn => {
    btn.classList.toggle('active', btn.dataset.type === rOrderType);
  });

  // Table selector
  const tableRow = document.getElementById('r-table-row');
  if (tableRow) tableRow.style.display = rOrderType === 'dine-in' ? 'flex' : 'none';

  if (rCart.length === 0) {
    el.innerHTML = '<div class="cart-empty">No items.<br/>Tap the menu to add.</div>';
  } else {
    el.innerHTML = rCart.map(item => `
      <div class="cart-item">
        <span class="ci-emoji">${item.emoji}</span>
        <div class="ci-info"><div class="ci-name">${item.name}</div><div class="ci-price">${rFmt(item.price)} each</div></div>
        <div class="ci-controls">
          <button class="qty-btn" data-raction="dec" data-rid="${item.id}">−</button>
          <span class="qty-val">${item.qty}</span>
          <button class="qty-btn" data-raction="inc" data-rid="${item.id}">+</button>
        </div>
        <span class="ci-total">${rFmt(item.price * item.qty)}</span>
      </div>
    `).join('');
    el.querySelectorAll('[data-raction]').forEach(btn => {
      btn.addEventListener('click', () => {
        const idx = rCart.findIndex(i => i.id === btn.dataset.rid);
        if (btn.dataset.raction === 'inc') rCart[idx].qty++;
        else { rCart[idx].qty--; if (rCart[idx].qty <= 0) rCart.splice(idx, 1); }
        renderRCart();
      });
    });
  }

  const total = rCartTotal();
  const tax = total * (state.settings.taxRate / 100);
  if (document.getElementById('r-subtotal')) {
    document.getElementById('r-subtotal').textContent = rFmt(total);
    document.getElementById('r-tax').textContent = rFmt(tax);
    document.getElementById('r-total').textContent = rFmt(total + tax);
  }
}

// ── Place Order ───────────────────────────────────────────────────────────────
function setupROrderBtn() {
  const btn = document.getElementById('r-place-order-btn');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', () => {
    if (rCart.length === 0) { toast('Add items first.'); return; }
    const order = {
      id: rState.nextOrderId++,
      type: rOrderType,
      table: rOrderType === 'dine-in' ? rSelectedTable : null,
      items: JSON.parse(JSON.stringify(rCart)),
      subtotal: rCartTotal(),
      tax: rCartTotal() * (state.settings.taxRate / 100),
      total: rCartTotal() * (1 + state.settings.taxRate / 100),
      status: 'pending',
      time: now(),
      date: today(),
    };
    rState.orders.push(order);
    saveRestaurantState();
    rCart = [];
    renderRCart();
    renderKitchen();
    renderRTables();
    toast(`Order #${order.id} sent to kitchen!`);
  });
}

// ── Tables View ───────────────────────────────────────────────────────────────
function renderRTables() {
  const grid = document.getElementById('r-tables-grid');
  if (!grid) return;
  const activeOrders = rState.orders.filter(o => o.type === 'dine-in' && o.status !== 'done');
  const occupiedTables = new Set(activeOrders.map(o => o.table));
  let html = '';
  for (let t = 1; t <= rState.tables; t++) {
    const isOccupied = occupiedTables.has(t);
    const isSelected = rSelectedTable === t;
    const tableOrders = activeOrders.filter(o => o.table === t);
    html += `
      <div class="r-table-card ${isOccupied ? 'occupied' : 'free'} ${isSelected ? 'selected' : ''}" data-table="${t}">
        <div class="r-table-num">T${t}</div>
        <div class="r-table-status">${isOccupied ? `${tableOrders.length} order${tableOrders.length > 1 ? 's' : ''}` : 'Free'}</div>
      </div>
    `;
  }
  grid.innerHTML = html;
  grid.querySelectorAll('.r-table-card').forEach(card => {
    card.addEventListener('click', () => {
      rSelectedTable = parseInt(card.dataset.table);
      rOrderType = 'dine-in';
      document.querySelectorAll('.r-order-type').forEach(b => b.classList.toggle('active', b.dataset.type === 'dine-in'));
      renderRTables();
      renderRCart();
      const sel = document.getElementById('r-table-select');
      if (sel) sel.value = rSelectedTable;
    });
  });
}

// ── Kitchen Display ───────────────────────────────────────────────────────────
function renderKitchen() {
  const board = document.getElementById('kitchen-board');
  if (!board) return;
  const active = rState.orders.filter(o => o.status !== 'done');
  if (active.length === 0) {
    board.innerHTML = '<div class="kitchen-empty">No active orders. All clear! ✅</div>';
    return;
  }
  board.innerHTML = active.map(o => `
    <div class="kitchen-ticket ${o.status}">
      <div class="kt-header">
        <div>
          <span class="kt-id">#${o.id}</span>
          <span class="kt-type ${o.type === 'dine-in' ? 'dine' : 'take'}">${o.type === 'dine-in' ? `Table ${o.table}` : 'Takeaway'}</span>
        </div>
        <span class="kt-time">${o.time}</span>
      </div>
      <div class="kt-items">
        ${o.items.map(i => `<div class="kt-item">${i.emoji} ${i.name} <span class="kt-qty">×${i.qty}</span></div>`).join('')}
      </div>
      <div class="kt-actions">
        ${o.status === 'pending' ? `<button class="kt-btn preparing" data-oid="${o.id}" data-status="preparing">Start Cooking</button>` : ''}
        ${o.status === 'preparing' ? `<button class="kt-btn ready" data-oid="${o.id}" data-status="ready">Ready</button>` : ''}
        ${o.status === 'ready' ? `<button class="kt-btn done" data-oid="${o.id}" data-status="done">Done / Served</button>` : ''}
        <span class="kt-status-badge ${o.status}">${o.status}</span>
      </div>
    </div>
  `).join('');
  board.querySelectorAll('[data-oid]').forEach(btn => {
    btn.addEventListener('click', () => {
      const order = rState.orders.find(o => o.id === parseInt(btn.dataset.oid));
      if (order) { order.status = btn.dataset.status; saveRestaurantState(); renderKitchen(); renderRTables(); }
    });
  });
}

// ── Menu Manager ──────────────────────────────────────────────────────────────
function renderRMenuManager() {
  const tbody = document.getElementById('r-menu-tbody');
  if (!tbody) return;
  tbody.innerHTML = rState.menu.map(i => `
    <tr>
      <td>${i.emoji} <strong>${i.name}</strong></td>
      <td>${i.category}</td>
      <td style="font-family:'DM Mono',monospace">${rFmt(i.price)}</td>
      <td><span class="badge ${i.available ? 'badge-ok' : 'badge-out'}">${i.available ? 'On' : 'Off'}</span></td>
      <td>
        <div class="action-btns">
          <button class="tbl-btn r-edit-menu-btn" data-rid="${i.id}">Edit</button>
          <button class="tbl-btn r-toggle-btn" data-rid="${i.id}">${i.available ? 'Disable' : 'Enable'}</button>
          <button class="tbl-btn del r-del-menu-btn" data-rid="${i.id}">Delete</button>
        </div>
      </td>
    </tr>
  `).join('');
  tbody.querySelectorAll('.r-toggle-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      const item = rState.menu.find(i => i.id === btn.dataset.rid);
      if (item) { item.available = !item.available; saveRestaurantState(); renderRMenuManager(); renderRMenuGrid(); }
    });
  });
  tbody.querySelectorAll('.r-del-menu-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this item?')) return;
      rState.menu = rState.menu.filter(i => i.id !== btn.dataset.rid);
      saveRestaurantState(); renderRMenuManager(); renderRMenuGrid(); toast('Deleted.');
    });
  });
  tbody.querySelectorAll('.r-edit-menu-btn').forEach(btn => {
    btn.addEventListener('click', () => openRMenuModal(btn.dataset.rid));
  });
}

function openRMenuModal(id) {
  const item = id ? rState.menu.find(i => i.id === id) : null;
  rEditingMenuId = id || null;
  document.getElementById('r-menu-modal-title').textContent = item ? 'Edit Item' : 'Add Item';
  document.getElementById('rm-name').value = item ? item.name : '';
  document.getElementById('rm-cat').value = item ? item.category : '';
  document.getElementById('rm-price').value = item ? item.price : '';
  document.getElementById('rm-emoji').value = item ? item.emoji : '';
  document.getElementById('r-menu-modal').classList.add('open');
}

// ── Wire up restaurant events (called once after DOM ready) ───────────────────
function initRestaurant() {
  // Sub-tab switching
  document.querySelectorAll('.r-tab').forEach(tab => {
    if (tab.dataset.bound) return;
    tab.dataset.bound = '1';
    tab.addEventListener('click', () => {
      document.querySelectorAll('.r-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.r-tab-content').forEach(c => c.style.display = 'none');
      tab.classList.add('active');
      document.getElementById('r-tab-' + tab.dataset.rtab).style.display = 'block';
      if (tab.dataset.rtab === 'kitchen') renderKitchen();
      if (tab.dataset.rtab === 'tables') renderRTables();
      if (tab.dataset.rtab === 'menu') renderRMenuManager();
    });
  });

  // Refresh kitchen button
  const refreshBtn = document.getElementById('r-refresh-kitchen');
  if (refreshBtn && !refreshBtn.dataset.bound) {
    refreshBtn.dataset.bound = '1';
    refreshBtn.addEventListener('click', renderKitchen);
  }


  document.querySelectorAll('.r-order-type').forEach(btn => {
    btn.addEventListener('click', () => {
      rOrderType = btn.dataset.type;
      renderRCart();
      renderRTables();
    });
  });

  // Table select dropdown
  const tSel = document.getElementById('r-table-select');
  if (tSel) {
    tSel.innerHTML = Array.from({length: rState.tables}, (_, i) =>
      `<option value="${i+1}">Table ${i+1}</option>`).join('');
    tSel.addEventListener('change', () => { rSelectedTable = parseInt(tSel.value); renderRTables(); });
  }

  setupROrderBtn();

  // Add menu item button
  const addBtn = document.getElementById('r-add-menu-btn');
  if (addBtn && !addBtn.dataset.bound) {
    addBtn.dataset.bound = '1';
    addBtn.addEventListener('click', () => openRMenuModal(null));
  }

  // Save menu item
  const saveBtn = document.getElementById('r-save-menu-btn');
  if (saveBtn && !saveBtn.dataset.bound) {
    saveBtn.dataset.bound = '1';
    saveBtn.addEventListener('click', () => {
      const name = document.getElementById('rm-name').value.trim();
      const cat = document.getElementById('rm-cat').value.trim();
      const price = parseFloat(document.getElementById('rm-price').value);
      const emoji = document.getElementById('rm-emoji').value.trim() || '🍽';
      if (!name || !cat || isNaN(price)) { toast('Fill in all fields.'); return; }
      if (rEditingMenuId) {
        const idx = rState.menu.findIndex(i => i.id === rEditingMenuId);
        rState.menu[idx] = { ...rState.menu[idx], name, category: cat, price, emoji };
      } else {
        rState.menu.push({ id: 'r' + (rState.nextMenuId++), name, category: cat, price, emoji, available: true });
      }
      saveRestaurantState();
      document.getElementById('r-menu-modal').classList.remove('open');
      renderRMenuManager(); renderRMenuGrid(); renderRMenuTabs();
      toast('Saved.');
    });
  }

  const cancelBtn = document.getElementById('r-cancel-menu-btn');
  if (cancelBtn && !cancelBtn.dataset.bound) {
    cancelBtn.dataset.bound = '1';
    cancelBtn.addEventListener('click', () => document.getElementById('r-menu-modal').classList.remove('open'));
  }

  renderRestaurant();
}

function initApp() {
  renderProducts();
  renderCart();
  updateSidebarTotal();
}

if (getSession()) { initApp(); }