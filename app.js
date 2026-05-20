// ─── IN-MEMORY USER & SHIFT STORE (synced from Firebase) ─────────────────────
let _users  = [];
let _shifts = [];
function getUsers()       { return _users; }
function saveUsers(u)     { _users = u; }  // local only — individual saves go to FB
function getShifts()      { return _shifts; }
function saveShifts(s)    { _shifts = s; }

// Session stays in localStorage (device-local — intentional)
function getSession()            { return localStorage.getItem('exposell_session'); }
function setSession(username)    { localStorage.setItem('exposell_session', username); }
function clearSession()          { localStorage.removeItem('exposell_session'); }
function currentUser()           { const u = getSession(); return _users.find(x => x.username === u) || null; }
function currentRole()           { const u = currentUser(); return u ? (u.role || 'manager') : 'manager'; }

// ─── AUTH ─────────────────────────────────────────────────────────────────────

function hashPassword(pw) {
  let h = 0;
  for (let i = 0; i < pw.length; i++) { h = (Math.imul(31, h) + pw.charCodeAt(i)) | 0; }
  return h.toString(36);
}

// Role-based nav visibility
const ROLE_NAV = {
  manager:  ['pos','inventory','reports','restaurant','invoice','admin','shifts'],
  cashier:  ['pos','restaurant','shifts'],
  kitchen:  ['restaurant','shifts'],
};

function applyRoleNav(role) {
  const allowed = ROLE_NAV[role] || ROLE_NAV.manager;
  document.querySelectorAll('.nav-btn').forEach(btn => {
    const page = btn.dataset.page;
    btn.style.display = allowed.includes(page) ? 'flex' : 'none';
  });
  // If current active page not allowed, redirect
  const activePage = document.querySelector('.nav-btn.active')?.dataset?.page;
  if (activePage && !allowed.includes(activePage)) {
    const first = allowed[0];
    document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
    const firstBtn = document.querySelector(`[data-page="${first}"]`);
    if (firstBtn) firstBtn.classList.add('active');
    const firstPage = document.getElementById('page-' + first);
    if (firstPage) firstPage.classList.add('active');
  }
}

function showApp(username) {
  document.getElementById('auth-modal').classList.remove('open');
  document.getElementById('mall-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  const user = getUsers().find(u => u.username === username);
  const role = user ? (user.role || 'manager') : 'manager';
  const outlet = user ? (user.outlet || 'Main Outlet') : '';
  const roleLabel = { manager: '🔑', cashier: '🧾', kitchen: '👨‍🍳' }[role] || '👤';
  document.getElementById('logged-in-user').innerHTML =
    `${roleLabel} <strong>${user ? user.name : username}</strong><br/>
     <span style="font-size:11px;opacity:0.6">${role} · ${outlet}</span>`;
  applyRoleNav(role);
  updateShiftBadge();
}

function showAuth() {
  document.getElementById('app').style.display = 'none';
  document.getElementById('mall-screen').style.display = 'block';
}

// Staff login button on mall header
document.getElementById('mall-staff-btn').addEventListener('click', () => {
  document.getElementById('auth-modal').classList.add('open');
  document.getElementById('login-error').textContent = '';
  document.getElementById('signup-error').textContent = '';
});
document.getElementById('auth-modal-close').addEventListener('click', () => {
  document.getElementById('auth-modal').classList.remove('open');
});

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
document.getElementById('login-btn').addEventListener('click', async () => {
  const username = document.getElementById('login-username').value.trim();
  const password = document.getElementById('login-password').value;
  const errEl = document.getElementById('login-error');
  if (!username || !password) { errEl.textContent = 'Fill in all fields.'; return; }
  const user = await fbGetUser(username);
  if (!user || user.passwordHash !== hashPassword(password)) {
    errEl.textContent = 'Wrong username or password.'; return;
  }
  setSession(user.username);
  showApp(user.username);
  initApp();
});

['login-username','login-password'].forEach(id => {
  document.getElementById(id).addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('login-btn').click();
  });
});

// Signup — role & outlet added
document.getElementById('signup-btn').addEventListener('click', async () => {
  const name     = document.getElementById('signup-name').value.trim();
  const username = document.getElementById('signup-username').value.trim();
  const password = document.getElementById('signup-password').value;
  const confirm  = document.getElementById('signup-confirm').value;
  const role     = document.getElementById('signup-role').value;
  const outlet   = document.getElementById('signup-outlet').value.trim() || 'Main Outlet';
  const errEl    = document.getElementById('signup-error');
  if (!name || !username || !password || !confirm) { errEl.textContent = 'Fill in all fields.'; return; }
  if (username.length < 3) { errEl.textContent = 'Username too short.'; return; }
  if (password.length < 4) { errEl.textContent = 'Password too short.'; return; }
  if (password !== confirm) { errEl.textContent = "Passwords don't match."; return; }
  const existing = await fbGetUser(username);
  if (existing) { errEl.textContent = 'Username taken.'; return; }
  const users = await fbGetUsers();
  const finalRole = users.length === 0 ? 'manager' : role;
  const newUser = { name, username, passwordHash: hashPassword(password), role: finalRole, outlet, createdAt: new Date().toISOString() };
  await fbSaveUser(newUser);
  _users = await fbGetUsers();
  setSession(username);
  showApp(username);
  initApp();
});

// Logout — also clock out if on shift
document.getElementById('logout-btn').addEventListener('click', () => {
  const active = getActiveShift();
  if (active) {
    if (!confirm('You have an active shift. Clock out and log out?')) return;
    clockOut();
  }
  clearSession();
  document.querySelectorAll('.nav-btn').forEach(b => b.classList.remove('active'));
  document.querySelector('[data-page="pos"]').classList.add('active');
  document.querySelectorAll('.page').forEach(p => p.classList.remove('active'));
  document.getElementById('page-pos').classList.add('active');
  showAuth();
  initMall();
});

// Check existing session on load — show mall by default, POS if already logged in
// ─── SHIFTS ───────────────────────────────────────────────────────────────────
// getShifts and saveShifts use in-memory _shifts (populated from Firebase on boot)

function getActiveShift() {
  const u = getSession();
  return getShifts().find(s => s.username === u && !s.clockOut) || null;
}

function clockIn() {
  const u = currentUser();
  if (!u) return;
  const shifts = getShifts();
  shifts.push({
    id: Date.now(),
    username: u.username,
    name: u.name,
    role: u.role || 'manager',
    outlet: u.outlet || 'Main Outlet',
    clockIn: new Date().toISOString(),
    clockOut: null,
    breaks: [],
    salesCount: 0,
    salesTotal: 0,
  });
  _shifts = shifts; fbSaveShift(shifts[shifts.length-1]);
  updateShiftBadge();
  toast(`Shift started — ${u.name}`);
}

function clockOut() {
  const shifts = getShifts();
  const idx = shifts.findIndex(s => s.username === getSession() && !s.clockOut);
  if (idx === -1) return;
  // tally sales made during shift
  const shift = shifts[idx];
  const shiftStart = new Date(shift.clockIn);
  const myS = state.sales.filter(s => {
    const st = new Date(s.timestamp || 0);
    return s.cashier === shift.username && st >= shiftStart;
  });
  shift.salesCount = myS.length;
  shift.salesTotal = myS.reduce((a, s) => a + s.total, 0);
  shift.clockOut = new Date().toISOString();
  _shifts = shifts; fbSaveShift(shifts[idx]);
  updateShiftBadge();
  toast('Clocked out. Good work!');
}

function startBreak() {
  const shifts = getShifts();
  const shift = shifts.find(s => s.username === getSession() && !s.clockOut);
  if (!shift) return;
  if (shift.breaks.length && !shift.breaks[shift.breaks.length - 1].end) {
    toast('Already on break.'); return;
  }
  shift.breaks.push({ start: new Date().toISOString(), end: null });
  _shifts = shifts; fbSaveShift(shift);
  toast('Break started.');
  renderShiftsPage();
}

function endBreak() {
  const shifts = getShifts();
  const shift = shifts.find(s => s.username === getSession() && !s.clockOut);
  if (!shift) return;
  const last = shift.breaks[shift.breaks.length - 1];
  if (!last || last.end) { toast('No active break.'); return; }
  last.end = new Date().toISOString();
  _shifts = shifts; fbSaveShift(shift);
  toast('Break ended.');
  renderShiftsPage();
}

function shiftDuration(s) {
  const start = new Date(s.clockIn);
  const end   = s.clockOut ? new Date(s.clockOut) : new Date();
  const ms    = end - start;
  const breakMs = (s.breaks || []).reduce((a, b) => {
    if (!b.start) return a;
    const bs = new Date(b.start);
    const be = b.end ? new Date(b.end) : new Date();
    return a + (be - bs);
  }, 0);
  const worked = ms - breakMs;
  const h = Math.floor(worked / 3600000);
  const m = Math.floor((worked % 3600000) / 60000);
  return `${h}h ${m}m`;
}

function updateShiftBadge() {
  const active = getActiveShift();
  const btn = document.querySelector('[data-page="shifts"]');
  if (!btn) return;
  btn.innerHTML = `<span class="nav-icon">⏱</span> Shifts${active ? ' <span class="shift-dot"></span>' : ''}`;
}

function renderShiftsPage() {
  const active = getActiveShift();
  const el = document.getElementById('shifts-clock-area');
  if (!el) return;

  if (active) {
    const onBreak = active.breaks.length && !active.breaks[active.breaks.length - 1].end;
    el.innerHTML = `
      <div class="shift-active-card">
        <div class="shift-active-header">
          <div>
            <div class="shift-active-name">${active.name}</div>
            <div class="shift-active-meta">${active.role} · ${active.outlet}</div>
          </div>
          <div class="shift-live-badge ${onBreak ? 'on-break' : 'on-shift'}">${onBreak ? '☕ On Break' : '🟢 On Shift'}</div>
        </div>
        <div class="shift-active-stats">
          <div class="shift-stat"><div class="shift-stat-val" id="shift-timer">–</div><div class="shift-stat-label">Time worked</div></div>
          <div class="shift-stat"><div class="shift-stat-val">${active.breaks.length}</div><div class="shift-stat-label">Breaks</div></div>
          <div class="shift-stat"><div class="shift-stat-val">${fmt(active.salesTotal || 0)}</div><div class="shift-stat-label">Sales</div></div>
        </div>
        <div class="shift-clock-btns">
          ${!onBreak ? `<button class="btn-outline" id="break-start-btn">☕ Start Break</button>` : `<button class="btn-outline" id="break-end-btn">▶ End Break</button>`}
          <button class="btn-auth" id="clock-out-btn" style="background:var(--red)">Clock Out</button>
        </div>
        <div style="font-size:12px;color:var(--text3);margin-top:8px">Clocked in at ${new Date(active.clockIn).toLocaleTimeString([], {hour:'2-digit',minute:'2-digit'})}</div>
      </div>`;
    // Live timer
    const timerEl = document.getElementById('shift-timer');
    if (timerEl) {
      clearInterval(window._shiftTimer);
      window._shiftTimer = setInterval(() => {
        if (timerEl && document.contains(timerEl)) timerEl.textContent = shiftDuration(active);
        else clearInterval(window._shiftTimer);
      }, 10000);
      timerEl.textContent = shiftDuration(active);
    }
    document.getElementById('break-start-btn')?.addEventListener('click', startBreak);
    document.getElementById('break-end-btn')?.addEventListener('click', endBreak);
    document.getElementById('clock-out-btn')?.addEventListener('click', () => {
      if (confirm('Clock out now?')) { clockOut(); renderShiftsPage(); }
    });
  } else {
    el.innerHTML = `
      <div class="shift-clocked-out">
        <div style="font-size:48px;margin-bottom:12px">⏱</div>
        <div style="font-size:18px;font-weight:600;margin-bottom:6px">Not clocked in</div>
        <div style="font-size:14px;color:var(--text3);margin-bottom:20px">Start a shift to track your time and sales.</div>
        <button class="btn-auth" id="clock-in-btn">Clock In</button>
      </div>`;
    document.getElementById('clock-in-btn')?.addEventListener('click', () => { clockIn(); renderShiftsPage(); });
  }

  // Shift history
  const allShifts = getShifts().filter(s => {
    const role = currentRole();
    return role === 'manager' ? true : s.username === getSession();
  }).slice().reverse();

  const histEl = document.getElementById('shifts-history');
  if (!histEl) return;
  if (allShifts.length === 0) {
    histEl.innerHTML = '<div style="color:var(--text3);font-size:14px;padding:12px 0">No shifts yet.</div>';
    return;
  }
  histEl.innerHTML = allShifts.map(s => {
    const start = new Date(s.clockIn);
    const end   = s.clockOut ? new Date(s.clockOut) : null;
    const roleLabel = {manager:'🔑',cashier:'🧾',kitchen:'👨‍🍳'}[s.role] || '👤';
    return `
    <div class="shift-history-row">
      <div class="shift-h-left">
        <div class="shift-h-name">${roleLabel} ${s.name} <span class="shift-h-outlet">${s.outlet}</span></div>
        <div class="shift-h-time">${start.toLocaleDateString()} · ${start.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'})} → ${end ? end.toLocaleTimeString([],{hour:'2-digit',minute:'2-digit'}) : '<span style="color:var(--green)">Active</span>'}</div>
      </div>
      <div class="shift-h-right">
        <div class="shift-h-dur">${shiftDuration(s)}</div>
        <div class="shift-h-sales">${fmt(s.salesTotal || 0)} · ${s.salesCount || 0} sales</div>
      </div>
    </div>`;
  }).join('');
}

function updateShiftBadge() {
  const active = getActiveShift();
  const btn = document.querySelector('[data-page="shifts"]');
  if (!btn) return;
  if (active) {
    btn.innerHTML = `<span class="nav-icon">⏱</span> Shifts <span class="shift-dot"></span>`;
  } else {
    btn.innerHTML = `<span class="nav-icon">⏱</span> Shifts`;
  }
}

// ─── STATE (populated by Firebase bootstrap) ──────────────────────────────────
let state = {
  products: [],
  sales: [],
  settings: { bizName: 'Blue Ocean Mall Express', taxRate: 8, currency: '$' },
  nextId: 10,
};

// saveState now writes only the changed pieces to Firebase
async function saveState() {
  await saveSettings(state.settings);
  // Products and sales are saved individually — see their own save calls
}

// Individual product save
async function saveProduct(product) {
  await fbSaveProduct(product);
}
async function deleteProduct(id) {
  await fbDeleteProduct(id);
}
// Individual sale save
async function saveSale(sale) {
  await fbAddSale(sale);
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
    if (page === 'shifts') renderShiftsPage();
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
    timestamp: new Date().toISOString(),
    cashier: getSession() || 'unknown',
  };
  state.sales.push(sale);
  saveSale(sale);

  // Deduct stock
  cart.forEach(item => {
    const prod = state.products.find(p => p.id === item.id);
    if (prod) { prod.stock -= item.qty; fbSaveProduct(prod); }
  });

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
        const delProdId = parseInt(btn.dataset.id);
        state.products = state.products.filter(p => p.id !== delProdId);
        fbDeleteProduct(delProdId);
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
        if (prod) { prod.stock += qty; fbSaveProduct(prod); renderInventory(); renderProducts(); toast(`+${qty} added.`); }
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
    fbSaveProduct(state.products[idx]);
    toast('Saved.');
  } else {
    const newProd = { id: state.nextId++, name, category: cat, price, stock, emoji };
    state.products.push(newProd);
    fbSaveProduct(newProd);
    toast('Added.');
  }
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
  const roleLabel = { manager:'🔑 Manager', cashier:'🧾 Cashier', kitchen:'👨‍🍳 Kitchen' };
  if (users.length === 0) {
    accEl.innerHTML = '<div style="color:var(--text3);font-size:14px;padding:8px 0">No accounts yet.</div>';
  } else {
    accEl.innerHTML = users.map(u => `
      <div class="account-row">
        <div>
          <div class="account-name">${u.name} ${u.username === getSession() ? '<span style="font-size:11px;color:var(--accent)">(you)</span>' : ''}</div>
          <div class="account-user">@${u.username} · ${roleLabel[u.role] || '🔑 Manager'} · ${u.outlet || 'Main Outlet'}</div>
        </div>
        <div class="action-btns">
          ${u.username !== getSession() ? `
            <select class="role-select" data-user="${u.username}" style="padding:4px 6px;border:1px solid var(--border2);border-radius:4px;font-size:12px;background:var(--bg)">
              <option value="manager" ${u.role==='manager'?'selected':''}>Manager</option>
              <option value="cashier" ${u.role==='cashier'?'selected':''}>Cashier</option>
              <option value="kitchen" ${u.role==='kitchen'?'selected':''}>Kitchen</option>
            </select>
            <button class="tbl-btn del" data-deluser="${u.username}">Remove</button>
          ` : ''}
        </div>
      </div>
    `).join('');
    accEl.querySelectorAll('.role-select').forEach(sel => {
      sel.addEventListener('change', () => {
        const uToUpdate = _users.find(u => u.username === sel.dataset.user);
        if (uToUpdate) { uToUpdate.role = sel.value; fbSaveUser(uToUpdate); }
        toast('Role updated.');
      });
    });
    accEl.querySelectorAll('[data-deluser]').forEach(btn => {
      btn.addEventListener('click', () => {
        if (!confirm(`Remove account @${btn.dataset.deluser}?`)) return;
        fbDeleteUser(btn.dataset.deluser).then(() => fbGetUsers().then(u => { _users = u; renderAdmin(); toast('Removed.'); }));
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
  saveSettings(state.settings);
  renderCart();
  toast('Saved.');
});

document.getElementById('reset-sales-btn').addEventListener('click', () => {
  if (confirm("Clear all sales? This can't be undone.")) {
    state.sales = [];
    // Note: Firestore docs remain but local view is cleared — for expo this is fine
    saveSettings(state.settings);
    renderAdmin();
    updateSidebarTotal();
    toast('Sales cleared.');
  }
});

document.getElementById('reset-all-btn').addEventListener('click', () => {
  if (confirm("Reset everything? This can't be undone.")) {
    state = { products: [], sales: [], settings: { bizName: 'Blue Ocean Mall Express', taxRate: 8, currency: '$' }, nextId: 10 };
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
  return { menu: [], orders: [], tables: 10, nextOrderId: 1, nextMenuId: 100 };
}
function saveRestaurantState() { /* Firebase saves happen individually */ }

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

// ── Payment Modal ─────────────────────────────────────────────────────────────
let rPendingOrder = null;

function openRPaymentModal() {
  if (rCart.length === 0) { toast('Add items first.'); return; }
  const subtotal = rCartTotal();
  const tax = subtotal * (state.settings.taxRate / 100);
  const grand = subtotal + tax;
  rPendingOrder = {
    id: rState.nextOrderId++,
    type: rOrderType,
    table: rOrderType === 'dine-in' ? rSelectedTable : null,
    items: JSON.parse(JSON.stringify(rCart)),
    subtotal, tax, total: grand,
    status: 'pending',
    time: now(), date: today(),
    timestamp: new Date().toISOString(),
    cashier: getSession() || 'unknown',
    paymentMethod: 'cash',
  };

  // Build modal content
  const modal = document.getElementById('r-payment-modal');
  document.getElementById('rp-order-label').textContent =
    rOrderType === 'dine-in' ? `Table ${rSelectedTable}` : 'Takeaway';
  document.getElementById('rp-items-list').innerHTML = rCart.map(i =>
    `<div class="receipt-row"><span>${i.emoji} ${i.name} ×${i.qty}</span><span>${rFmt(i.price * i.qty)}</span></div>`
  ).join('');
  document.getElementById('rp-subtotal').textContent = rFmt(subtotal);
  document.getElementById('rp-tax').textContent = rFmt(tax);
  document.getElementById('rp-total').textContent = rFmt(grand);
  document.getElementById('rp-cash-received').value = '';
  document.getElementById('rp-change').textContent = '';
  document.getElementById('rp-error').textContent = '';

  // reset payment method
  document.querySelectorAll('.rp-method').forEach(b => b.classList.toggle('active', b.dataset.method === 'cash'));
  document.getElementById('rp-cash-area').style.display = 'block';
  rPendingOrder.paymentMethod = 'cash';

  modal.classList.add('open');
}

function setupROrderBtn() {
  const btn = document.getElementById('r-place-order-btn');
  if (!btn || btn.dataset.bound) return;
  btn.dataset.bound = '1';
  btn.addEventListener('click', openRPaymentModal);
}

function initRPaymentModal() {
  if (document.getElementById('r-payment-modal').dataset.bound) return;
  document.getElementById('r-payment-modal').dataset.bound = '1';

  // Payment method tabs
  document.querySelectorAll('.rp-method').forEach(btn => {
    btn.addEventListener('click', () => {
      document.querySelectorAll('.rp-method').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      rPendingOrder.paymentMethod = btn.dataset.method;
      document.getElementById('rp-cash-area').style.display =
        btn.dataset.method === 'cash' ? 'block' : 'none';
      document.getElementById('rp-change').textContent = '';
    });
  });

  // Cash change calc
  document.getElementById('rp-cash-received').addEventListener('input', () => {
    const received = parseFloat(document.getElementById('rp-cash-received').value) || 0;
    const grand = rPendingOrder ? rPendingOrder.total : 0;
    const chEl = document.getElementById('rp-change');
    if (received >= grand && grand > 0) {
      chEl.textContent = `Change: ${rFmt(received - grand)}`;
      chEl.style.color = 'var(--green)';
    } else if (received > 0) {
      chEl.textContent = `Short: ${rFmt(grand - received)}`;
      chEl.style.color = 'var(--red)';
    } else {
      chEl.textContent = '';
    }
  });

  // Cancel
  document.getElementById('rp-cancel-btn').addEventListener('click', () => {
    document.getElementById('r-payment-modal').classList.remove('open');
    rPendingOrder = null;
  });

  // Confirm payment + send to kitchen
  document.getElementById('rp-confirm-btn').addEventListener('click', () => {
    if (!rPendingOrder) return;
    const errEl = document.getElementById('rp-error');
    if (rPendingOrder.paymentMethod === 'cash') {
      const received = parseFloat(document.getElementById('rp-cash-received').value) || 0;
      if (received < rPendingOrder.total) { errEl.textContent = 'Not enough cash.'; return; }
      rPendingOrder.cashReceived = received;
      rPendingOrder.change = received - rPendingOrder.total;
    }

    // Save to restaurant orders
    const rOrderToSave = { ...rPendingOrder, paid: true };
    rState.orders.push(rOrderToSave);
    fbSaveRestaurantOrder(rOrderToSave);

    // Also record in global sales for reports
    const rSale = {
      id: Date.now(),
      items: rPendingOrder.items,
      subtotal: rPendingOrder.subtotal,
      tax: rPendingOrder.tax,
      total: rPendingOrder.total,
      paymentMethod: rPendingOrder.paymentMethod,
      cashReceived: rPendingOrder.cashReceived || null,
      time: rPendingOrder.time,
      date: rPendingOrder.date,
      timestamp: rPendingOrder.timestamp,
      cashier: rPendingOrder.cashier,
      source: 'restaurant',
      tableOrType: rPendingOrder.type === 'dine-in' ? `Table ${rPendingOrder.table}` : 'Takeaway',
    };
    state.sales.push(rSale);
    saveSale(rSale);
    updateSidebarTotal();

    // Show receipt then close
    showRReceipt(rPendingOrder);
    document.getElementById('r-payment-modal').classList.remove('open');

    // Clear cart
    rCart = [];
    renderRCart();
    renderKitchen();
    renderRTables();
    toast(`Order #${rPendingOrder.id} paid & sent to kitchen!`);
    rPendingOrder = null;
  });

  // Print receipt from restaurant
  document.getElementById('rp-print-btn').addEventListener('click', () => {
    const content = document.getElementById('r-receipt-content').innerHTML;
    const win = window.open('', '_blank', 'width=380,height=680');
    win.document.write(`<!DOCTYPE html><html><head><title>Receipt</title><style>
      body{font-family:'Courier New',monospace;font-size:13px;padding:24px;max-width:320px;margin:0 auto}
      .receipt-header{text-align:center;margin-bottom:10px}.r-biz{font-size:16px;font-weight:bold}
      .receipt-divider{border:none;border-top:1px dashed #aaa;margin:8px 0}
      .receipt-row,.receipt-total-row{display:flex;justify-content:space-between;margin:3px 0}
      .receipt-total-row{font-weight:bold;font-size:15px}
      .receipt-qr{text-align:center;margin:12px 0 8px}
      .receipt-footer{text-align:center;color:#888;margin-top:8px;font-size:12px}
    </style></head><body>${content}</body></html>`);
    win.document.close(); win.focus();
    setTimeout(() => { win.print(); win.close(); }, 500);
  });

  document.getElementById('rp-new-order-btn').addEventListener('click', () => {
    document.getElementById('r-receipt-modal').classList.remove('open');
  });
}

function showRReceipt(order) {
  const change = order.change != null ? order.change : null;
  const receiptText = [
    state.settings.bizName,
    order.type === 'dine-in' ? `Table ${order.table}` : 'Takeaway',
    `Order #${order.id}  ${order.time}`,
    '----------------------------',
    ...order.items.map(i => `${i.emoji} ${i.name} x${i.qty}   ${rFmt(i.price * i.qty)}`),
    '----------------------------',
    `Subtotal: ${rFmt(order.subtotal)}`,
    `Tax: ${rFmt(order.tax)}`,
    `TOTAL: ${rFmt(order.total)}`,
    order.paymentMethod === 'cash' ? `Cash: ${rFmt(order.cashReceived)}  Change: ${rFmt(change)}` : `Paid by: ${order.paymentMethod}`,
    '----------------------------',
    'Thanks for dining with us!',
  ].join('\n');

  document.getElementById('r-receipt-content').innerHTML = `
    <div class="receipt-header">
      <div class="r-biz">${state.settings.bizName}</div>
      <div style="font-size:12px;color:#888">${order.type === 'dine-in' ? `Table ${order.table}` : 'Takeaway'} · Order #${order.id}</div>
      <div style="font-size:11px;color:#aaa">${order.date} · ${order.time}</div>
    </div>
    <hr class="receipt-divider"/>
    ${order.items.map(i => `<div class="receipt-row"><span>${i.emoji} ${i.name} ×${i.qty}</span><span>${rFmt(i.price*i.qty)}</span></div>`).join('')}
    <hr class="receipt-divider"/>
    <div class="receipt-row"><span>Subtotal</span><span>${rFmt(order.subtotal)}</span></div>
    <div class="receipt-row"><span>Tax (${state.settings.taxRate}%)</span><span>${rFmt(order.tax)}</span></div>
    <hr class="receipt-divider"/>
    <div class="receipt-total-row"><span>Total</span><span>${rFmt(order.total)}</span></div>
    ${order.paymentMethod === 'cash'
      ? `<hr class="receipt-divider"/>
         <div class="receipt-row"><span>Cash</span><span>${rFmt(order.cashReceived)}</span></div>
         <div class="receipt-row"><span>Change</span><span>${rFmt(change)}</span></div>`
      : `<div class="receipt-row" style="margin-top:6px"><span>Paid by</span><span>${order.paymentMethod}</span></div>`}
    <hr class="receipt-divider"/>
    <div class="receipt-qr">
      <div style="font-size:11px;color:#999;margin-bottom:6px">Scan for receipt</div>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(receiptText)}" width="110" height="110" alt="QR"/>
    </div>
    <div class="receipt-footer">Thanks for dining with us! 🍽</div>
  `;
  document.getElementById('r-receipt-modal').classList.add('open');
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
      if (order) { order.status = btn.dataset.status; fbSaveRestaurantOrder(order); renderKitchen(); renderRTables(); }
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
      if (item) { item.available = !item.available; fbSaveMenuItem(item); renderRMenuManager(); renderRMenuGrid(); }
    });
  });
  tbody.querySelectorAll('.r-del-menu-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      if (!confirm('Delete this item?')) return;
      const delId = btn.dataset.rid;
      rState.menu = rState.menu.filter(i => i.id !== delId);
      fbDeleteMenuItem(delId); renderRMenuManager(); renderRMenuGrid(); toast('Deleted.');
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
  initRPaymentModal();

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
      const savedItem = rState.menu.find(i => i.id === (rEditingMenuId || rState.menu[rState.menu.length-1].id));
      if (savedItem) fbSaveMenuItem(savedItem);
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

// ─── MALL STOREFRONT ──────────────────────────────────────────────────────────

const MALL_SHOPS = [
  {
    id: 'adidas', name: 'Adidas', emoji: '🦅', color: '#000000', tagline: 'Impossible is Nothing',
    products: [
      { id: 'ad1', name: 'Ultraboost 22', price: 180, emoji: '👟', desc: 'Running shoes' },
      { id: 'ad2', name: 'Tiro Track Pants', price: 55, emoji: '👖', desc: 'Training pants' },
      { id: 'ad3', name: 'Trefoil Hoodie', price: 70, emoji: '🧥', desc: 'Classic hoodie' },
      { id: 'ad4', name: 'Cap', price: 30, emoji: '🧢', desc: 'Adjustable cap' },
      { id: 'ad5', name: 'Socks 3-Pack', price: 18, emoji: '🧦', desc: 'Crew socks' },
    ]
  },
  {
    id: 'nike', name: 'Nike', emoji: '✔️', color: '#FF6600', tagline: 'Just Do It',
    products: [
      { id: 'nk1', name: 'Air Max 270', price: 160, emoji: '👟', desc: 'Lifestyle sneakers' },
      { id: 'nk2', name: 'Dri-FIT Tee', price: 35, emoji: '👕', desc: 'Performance tee' },
      { id: 'nk3', name: 'Tech Fleece', price: 120, emoji: '🧥', desc: 'Fleece joggers' },
      { id: 'nk4', name: 'Swoosh Cap', price: 28, emoji: '🧢', desc: 'Classic cap' },
      { id: 'nk5', name: 'Sport Bag', price: 45, emoji: '🎒', desc: 'Gym bag' },
    ]
  },
  {
    id: 'puma', name: 'Puma', emoji: '🐆', color: '#D4AF37', tagline: 'Forever Faster',
    products: [
      { id: 'pu1', name: 'RS-X Sneakers', price: 110, emoji: '👟', desc: 'Retro runners' },
      { id: 'pu2', name: 'Essentials Tee', price: 28, emoji: '👕', desc: 'Logo tee' },
      { id: 'pu3', name: 'Liga Shorts', price: 25, emoji: '🩳', desc: 'Training shorts' },
      { id: 'pu4', name: 'Phase Backpack', price: 40, emoji: '🎒', desc: 'Sports backpack' },
      { id: 'pu5', name: 'Drift Cat', price: 90, emoji: '👟', desc: 'Motorsport shoes' },
    ]
  },
  {
    id: 'lv', name: 'Louis Vuitton', emoji: '🟡', color: '#8B6914', tagline: 'The Art of Travel',
    products: [
      { id: 'lv1', name: 'Neverfull Tote', price: 1550, emoji: '👜', desc: 'Iconic canvas tote' },
      { id: 'lv2', name: 'Pochette Métis', price: 2050, emoji: '👛', desc: 'Chain bag' },
      { id: 'lv3', name: 'Speedy 25', price: 1200, emoji: '👜', desc: 'Classic handbag' },
      { id: 'lv4', name: 'Belt 35mm', price: 450, emoji: '🥋', desc: 'Monogram belt' },
      { id: 'lv5', name: 'Card Holder', price: 320, emoji: '💳', desc: 'Slim wallet' },
    ]
  },
  {
    id: 'gucci', name: 'Gucci', emoji: '🌿', color: '#1B4D3E', tagline: 'Quality is Remembered',
    products: [
      { id: 'gc1', name: 'GG Marmont Bag', price: 1290, emoji: '👜', desc: 'Matelassé leather' },
      { id: 'gc2', name: 'Ace Sneakers', price: 620, emoji: '👟', desc: 'Web stripe' },
      { id: 'gc3', name: 'Horsebit Loafer', price: 850, emoji: '👞', desc: 'Classic loafer' },
      { id: 'gc4', name: 'GG Belt', price: 390, emoji: '🥋', desc: 'Interlocking G' },
      { id: 'gc5', name: 'Sunglasses', price: 320, emoji: '🕶', desc: 'Oval frame' },
    ]
  },
  {
    id: 'playstation', name: 'PlayStation Store', emoji: '🎮', color: '#003087', tagline: 'Play Has No Limits',
    products: [
      { id: 'ps1',  name: 'PlayStation®VR2', price: 399.00, emoji: '🥽', desc: 'Next-gen VR headset' },
      { id: 'ps2',  name: 'DualSense Edge® Wireless Controller – Midnight Black', price: 199.00, emoji: '🕹️', desc: 'Pro wireless controller' },
      { id: 'ps3',  name: 'DualSense Edge™ Wireless Controller – 30th Anniversary Limited Edition', price: 219.99, emoji: '🕹️', desc: '30th Anniversary edition' },
      { id: 'ps4',  name: 'PlayStation®5 Pro Console – 2 TB', price: 899.00, emoji: '🖥️', desc: '2TB PS5 Pro console' },
      { id: 'ps5',  name: 'DualSense® Wireless Controller – Nova Pink', price: 74.00, emoji: '🕹️', desc: 'Nova Pink wireless controller' },
      { id: 'ps6',  name: 'Victrix™ Pro BFG™ Reloaded Wireless Modular Controller & Atlas™ 200 Wired Headset Bundle', price: 24.99, emoji: '🎧', desc: 'Controller & headset bundle' },
      { id: 'ps7',  name: 'PS5® Console Covers (model group – slim) – Techno Red', price: 74.00, emoji: '🔴', desc: 'Techno Red slim covers' },
      { id: 'ps8',  name: 'Certified Refurbished PlayStation®5 Console (model group – slim)*', price: 549.00, emoji: '🖥️', desc: 'Refurbished PS5 slim' },
      { id: 'ps9',  name: '2TB WD BLACK Internal SN850P NVMe™ SSD Game Drive', price: 909.99, emoji: '💾', desc: '2TB PS5 internal SSD' },
      { id: 'ps10', name: '4TB WD BLACK Internal SN850P NVMe™ SSD Game Drive', price: 1369.99, emoji: '💾', desc: '4TB PS5 internal SSD' },
    ]
  },
  {
    id: 'gamestop', name: 'GameStop', emoji: '🛑', color: '#E31837', tagline: 'Power to the Players',
    products: [
      { id: 'gs1',  name: 'Nintendo Switch 2', price: 417.99, emoji: '🎮', desc: 'Latest Nintendo console' },
      { id: 'gs2',  name: 'MacBook Pro (M1, 13-inch, 2020) – 8GB, SSD 256GB – Silver', price: 449.99, emoji: '💻', desc: 'Apple M1 MacBook Pro' },
      { id: 'gs3',  name: 'Samsung 980 PRO 1TB PCIe 4.0 NVMe M.2 Internal V-NAND Solid State Drive PlayStation 5 Compatible', price: 89.97, emoji: '💾', desc: 'PS5-compatible 1TB SSD' },
      { id: 'gs4',  name: 'External Hard Drive 1TB (Styles May Vary)', price: 21.99, emoji: '🗄️', desc: '1TB portable hard drive' },
      { id: 'gs5',  name: 'Logitech PRO Wireless Gaming Mouse', price: 89.97, emoji: '🖱️', desc: 'Pro wireless mouse' },
      { id: 'gs6',  name: 'GameStop Air Wired Gaming Mouse with RGB – White', price: 16.97, emoji: '🖱️', desc: 'RGB wired gaming mouse' },
      { id: 'gs7',  name: 'GameStop 60 Percent Wired Mechanical Keyboard', price: 31.98, emoji: '⌨️', desc: '60% mechanical keyboard' },
      { id: 'gs8',  name: 'Razer BlackWidow V3 Mini HyperSpeed 65% Wireless Mechanical Keyboard – Green Switch – Black with Chroma RGB', price: 136.97, emoji: '⌨️', desc: 'Razer 65% wireless keyboard' },
      { id: 'gs9',  name: 'AMD Ryzen 5 5600X Processor 6-core 12 Threads up to 4.6 GHz AM4', price: 165.98, emoji: '🔲', desc: '6-core AM4 processor' },
      { id: 'gs10', name: 'PNY XLR8 Gaming EPICX RGB 16GB (2×8GB) Desktop Memory Kit MD16GK2D4320016XRGB', price: 58.97, emoji: '🧩', desc: '16GB DDR4 RGB RAM kit' },
    ]
  },
  {
    id: 'bestbuy', name: 'Best Buy', emoji: '💛', color: '#0046BE', tagline: 'Expert Service. Unbeatable Price.',
    products: [
      { id: 'bb1', name: 'CORSAIR – VENGEANCE 16GB (1×16GB) DDR5 4800MHz C40 SODIMM Laptop Memory – Black', price: 164.99, emoji: '🧩', desc: 'DDR5 laptop memory' },
      { id: 'bb2', name: 'Intel – Core Ultra 7 Processor 270K Plus 24 cores (8 P-cores + 16 E-cores) up to 5.5 GHz – Multi', price: 329.99, emoji: '🔲', desc: '24-core Intel Ultra 7' },
    ]
  },
];

let mallCart = []; // { shopId, shopName, productId, name, price, emoji, qty }
let mallActiveShop = null;
let mallPayMethod = 'cash';

function getMallCartTotal() {
  return mallCart.reduce((s, i) => s + i.price * i.qty, 0);
}

function initMall() {
  renderMallShops();
  bindMallEvents();
}

function renderMallShops() {
  const grid = document.getElementById('mall-shops-grid');
  if (!grid) return;
  grid.innerHTML = MALL_SHOPS.map(shop => `
    <div class="mall-shop-card" data-shopid="${shop.id}" style="--shop-color:${shop.color}">
      <div class="mall-shop-emoji">${shop.emoji}</div>
      <div class="mall-shop-name">${shop.name}</div>
      <div class="mall-shop-tag">${shop.tagline}</div>
      <div class="mall-shop-count">${shop.products.length} items</div>
      <button class="mall-shop-enter">Shop Now →</button>
    </div>
  `).join('');

  grid.querySelectorAll('.mall-shop-card').forEach(card => {
    card.addEventListener('click', () => openMallShop(card.dataset.shopid));
  });
}

function openMallShop(shopId) {
  const shop = MALL_SHOPS.find(s => s.id === shopId);
  if (!shop) return;
  mallActiveShop = shopId;
  document.getElementById('mall-shops').style.display = 'none';
  document.getElementById('mall-products-section').style.display = 'block';
  document.getElementById('mall-products-title').textContent = `${shop.emoji} ${shop.name}`;
  document.getElementById('mall-products-section').scrollIntoView({ behavior: 'smooth' });

  const grid = document.getElementById('mall-products-grid');
  grid.innerHTML = shop.products.map(p => `
    <div class="mall-product-card">
      <div class="mall-product-emoji">${p.emoji}</div>
      <div class="mall-product-name">${p.name}</div>
      <div class="mall-product-desc">${p.desc}</div>
      <div class="mall-product-price">${fmt(p.price)}</div>
      <button class="mall-add-btn" data-shopid="${shop.id}" data-pid="${p.id}">Add to Cart</button>
    </div>
  `).join('');

  grid.querySelectorAll('.mall-add-btn').forEach(btn => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      addToMallCart(btn.dataset.shopid, btn.dataset.pid);
      btn.textContent = '✓ Added';
      btn.style.background = 'var(--green)';
      setTimeout(() => { btn.textContent = 'Add to Cart'; btn.style.background = ''; }, 1200);
    });
  });
}

function addToMallCart(shopId, productId) {
  const shop = MALL_SHOPS.find(s => s.id === shopId);
  const product = shop?.products.find(p => p.id === productId);
  if (!product) return;
  const existing = mallCart.find(i => i.productId === productId);
  if (existing) existing.qty++;
  else mallCart.push({ shopId, shopName: shop.name, productId, name: product.name, price: product.price, emoji: product.emoji, qty: 1 });
  updateMallCartBadge();
  toast(`${product.emoji} ${product.name} added to cart`);
}

function updateMallCartBadge() {
  const count = mallCart.reduce((s, i) => s + i.qty, 0);
  const badge = document.getElementById('mall-cart-count');
  if (badge) badge.textContent = count;
}

function renderMallCart() {
  const el = document.getElementById('mall-cart-items');
  const footer = document.getElementById('mall-cart-footer');
  if (!el) return;
  if (mallCart.length === 0) {
    el.innerHTML = '<div class="mall-cart-empty">Your cart is empty.</div>';
    if (footer) footer.style.display = 'none';
    return;
  }
  // Group by shop
  const byShop = {};
  mallCart.forEach(i => {
    if (!byShop[i.shopName]) byShop[i.shopName] = [];
    byShop[i.shopName].push(i);
  });
  el.innerHTML = Object.entries(byShop).map(([shop, items]) => `
    <div class="mall-cart-shop-group">
      <div class="mall-cart-shop-label">${shop}</div>
      ${items.map(item => `
        <div class="mall-cart-item">
          <span class="mall-ci-emoji">${item.emoji}</span>
          <div class="mall-ci-info">
            <div class="mall-ci-name">${item.name}</div>
            <div class="mall-ci-price">${fmt(item.price)}</div>
          </div>
          <div class="ci-controls">
            <button class="qty-btn" data-mc-action="dec" data-mc-pid="${item.productId}">−</button>
            <span class="qty-val">${item.qty}</span>
            <button class="qty-btn" data-mc-action="inc" data-mc-pid="${item.productId}">+</button>
          </div>
          <span class="ci-total">${fmt(item.price * item.qty)}</span>
        </div>
      `).join('')}
    </div>
  `).join('');

  el.querySelectorAll('[data-mc-action]').forEach(btn => {
    btn.addEventListener('click', () => {
      const idx = mallCart.findIndex(i => i.productId === btn.dataset.mcPid);
      if (btn.dataset.mcAction === 'inc') mallCart[idx].qty++;
      else { mallCart[idx].qty--; if (mallCart[idx].qty <= 0) mallCart.splice(idx, 1); }
      updateMallCartBadge();
      renderMallCart();
    });
  });

  const total = getMallCartTotal();
  if (document.getElementById('mall-cart-total')) document.getElementById('mall-cart-total').textContent = fmt(total);
  if (footer) footer.style.display = 'block';
}

function bindMallEvents() {
  // Cart open/close
  const cartBtn = document.getElementById('mall-cart-btn');
  const overlay = document.getElementById('mall-cart-overlay');
  const closeBtn = document.getElementById('mall-cart-close');
  if (cartBtn && !cartBtn.dataset.bound) {
    cartBtn.dataset.bound = '1';
    cartBtn.addEventListener('click', () => { renderMallCart(); overlay.classList.add('open'); });
    closeBtn.addEventListener('click', () => overlay.classList.remove('open'));
    overlay.addEventListener('click', e => { if (e.target === overlay) overlay.classList.remove('open'); });
  }

  // Back button
  const backBtn = document.getElementById('mall-back-btn');
  if (backBtn && !backBtn.dataset.bound) {
    backBtn.dataset.bound = '1';
    backBtn.addEventListener('click', () => {
      document.getElementById('mall-products-section').style.display = 'none';
      document.getElementById('mall-shops').style.display = 'block';
      mallActiveShop = null;
    });
  }

  // Checkout button
  const checkoutBtn = document.getElementById('mall-checkout-btn');
  if (checkoutBtn && !checkoutBtn.dataset.bound) {
    checkoutBtn.dataset.bound = '1';
    checkoutBtn.addEventListener('click', () => {
      document.getElementById('mall-cart-overlay').classList.remove('open');
      openMallCheckout();
    });
  }

  // Payment method
  document.querySelectorAll('.mall-pay-method').forEach(btn => {
    if (btn.dataset.bound) return;
    btn.dataset.bound = '1';
    btn.addEventListener('click', () => {
      document.querySelectorAll('.mall-pay-method').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      mallPayMethod = btn.dataset.method;
      document.getElementById('mall-cash-area').style.display = mallPayMethod === 'cash' ? 'block' : 'none';
      document.getElementById('mall-change-display').textContent = '';
    });
  });

  // Cash change calc
  const cashInput = document.getElementById('mall-cash-given');
  if (cashInput && !cashInput.dataset.bound) {
    cashInput.dataset.bound = '1';
    cashInput.addEventListener('input', () => {
      const given = parseFloat(cashInput.value) || 0;
      const total = getMallCartTotal();
      const el = document.getElementById('mall-change-display');
      if (given >= total && total > 0) { el.textContent = `Change: ${fmt(given - total)}`; el.style.color = 'var(--green)'; }
      else if (given > 0) { el.textContent = `Short: ${fmt(total - given)}`; el.style.color = 'var(--red)'; }
      else el.textContent = '';
    });
  }

  // Confirm order
  const confirmBtn = document.getElementById('mall-confirm-btn');
  if (confirmBtn && !confirmBtn.dataset.bound) {
    confirmBtn.dataset.bound = '1';
    confirmBtn.addEventListener('click', completeMallOrder);
  }

  // Cancel checkout
  const cancelBtn = document.getElementById('mall-cancel-checkout-btn');
  if (cancelBtn && !cancelBtn.dataset.bound) {
    cancelBtn.dataset.bound = '1';
    cancelBtn.addEventListener('click', () => document.getElementById('mall-checkout-modal').classList.remove('open'));
  }

  // Receipt close & print
  const receiptClose = document.getElementById('mall-receipt-close-btn');
  if (receiptClose && !receiptClose.dataset.bound) {
    receiptClose.dataset.bound = '1';
    receiptClose.addEventListener('click', () => document.getElementById('mall-receipt-modal').classList.remove('open'));
  }
  const printBtn = document.getElementById('mall-print-receipt-btn');
  if (printBtn && !printBtn.dataset.bound) {
    printBtn.dataset.bound = '1';
    printBtn.addEventListener('click', () => {
      const content = document.getElementById('mall-receipt-content').innerHTML;
      const win = window.open('', '_blank', 'width=380,height=680');
      win.document.write(`<!DOCTYPE html><html><head><title>Receipt</title><style>
        body{font-family:'Courier New',monospace;font-size:13px;padding:24px;max-width:320px;margin:0 auto}
        .receipt-header{text-align:center;margin-bottom:10px}.r-biz{font-size:16px;font-weight:bold}
        .receipt-divider{border:none;border-top:1px dashed #aaa;margin:8px 0}
        .receipt-row,.receipt-total-row{display:flex;justify-content:space-between;margin:3px 0}
        .receipt-total-row{font-weight:bold;font-size:15px}
        .receipt-qr{text-align:center;margin:12px 0 8px}
        .receipt-footer{text-align:center;color:#888;font-size:12px;margin-top:8px}
      </style></head><body>${content}</body></html>`);
      win.document.close(); win.focus(); setTimeout(() => { win.print(); win.close(); }, 500);
    });
  }
}

function openMallCheckout() {
  const total = getMallCartTotal();
  document.getElementById('mall-checkout-total').textContent = fmt(total);
  document.getElementById('mall-buyer-name').value = '';
  document.getElementById('mall-cash-given').value = '';
  document.getElementById('mall-change-display').textContent = '';
  document.getElementById('mall-checkout-error').textContent = '';
  document.getElementById('mall-cash-area').style.display = 'block';
  document.querySelectorAll('.mall-pay-method').forEach(b => b.classList.toggle('active', b.dataset.method === 'cash'));
  mallPayMethod = 'cash';

  // Group by shop
  const byShop = {};
  mallCart.forEach(i => { if (!byShop[i.shopName]) byShop[i.shopName] = []; byShop[i.shopName].push(i); });
  document.getElementById('mall-checkout-items').innerHTML =
    Object.entries(byShop).map(([shop, items]) => `
      <div style="margin-bottom:10px">
        <div style="font-size:12px;font-weight:600;color:var(--text3);text-transform:uppercase;letter-spacing:0.4px;margin-bottom:4px">${shop}</div>
        ${items.map(i => `
          <div class="receipt-row" style="font-size:13px;font-family:'DM Mono',monospace">
            <span>${i.emoji} ${i.name} ×${i.qty}</span><span>${fmt(i.price * i.qty)}</span>
          </div>`).join('')}
      </div>`).join('<hr style="border:none;border-top:1px solid var(--border);margin:8px 0"/>');

  document.getElementById('mall-checkout-modal').classList.add('open');
}

function completeMallOrder() {
  const name = document.getElementById('mall-buyer-name').value.trim() || 'Customer';
  const total = getMallCartTotal();
  const errEl = document.getElementById('mall-checkout-error');
  if (mallPayMethod === 'cash') {
    const given = parseFloat(document.getElementById('mall-cash-given').value) || 0;
    if (given < total) { errEl.textContent = 'Not enough cash.'; return; }
  }

  const orderId = Date.now();
  const receiptText = [
    '🌊 Blue Ocean Mall Express',
    `Order #${orderId}`,
    `Customer: ${name}`,
    `${today()} ${now()}`,
    '----------------------------',
    ...mallCart.map(i => `${i.shopName}: ${i.emoji} ${i.name} x${i.qty}  ${fmt(i.price * i.qty)}`),
    '----------------------------',
    `TOTAL: ${fmt(total)}`,
    mallPayMethod === 'cash'
      ? `Cash: ${fmt(parseFloat(document.getElementById('mall-cash-given').value))}  Change: ${fmt(parseFloat(document.getElementById('mall-cash-given').value) - total)}`
      : `Paid by: ${mallPayMethod}`,
    '----------------------------',
    'Thank you for shopping!',
  ].join('\n');

  // Record each shop's sales
  const byShop = {};
  mallCart.forEach(i => { if (!byShop[i.shopId]) byShop[i.shopId] = []; byShop[i.shopId].push(i); });
  Object.entries(byShop).forEach(([shopId, items]) => {
    const shopTotal = items.reduce((s, i) => s + i.price * i.qty, 0);
    state.sales.push({
      id: Date.now() + Math.random(),
      items: items.map(i => ({ name: i.name, emoji: i.emoji, price: i.price, qty: i.qty })),
      subtotal: shopTotal, tax: 0, total: shopTotal,
      paymentMethod: mallPayMethod, time: now(), date: today(),
      timestamp: new Date().toISOString(),
      cashier: 'mall-customer',
      source: 'mall',
      shopId, shopName: MALL_SHOPS.find(s => s.id === shopId)?.name,
      buyerName: name,
    });
  });
  for (const s of state.sales.slice(-Object.keys(byShop).length)) { saveSale(s); }
  updateSidebarTotal();

  // Show receipt
  const given = mallPayMethod === 'cash' ? parseFloat(document.getElementById('mall-cash-given').value) : null;
  document.getElementById('mall-receipt-content').innerHTML = `
    <div class="receipt-header">
      <div class="r-biz">🌊 Blue Ocean Mall Express</div>
      <div style="font-size:13px">Thank you, ${name}!</div>
      <div style="font-size:11px;color:#aaa">Order #${orderId} · ${today()} ${now()}</div>
    </div>
    <hr class="receipt-divider"/>
    ${Object.entries(byShop).map(([sid, items]) => `
      <div style="font-size:11px;font-weight:bold;color:#888;margin:6px 0 2px">${MALL_SHOPS.find(s=>s.id===sid)?.name}</div>
      ${items.map(i=>`<div class="receipt-row"><span>${i.emoji} ${i.name} ×${i.qty}</span><span>${fmt(i.price*i.qty)}</span></div>`).join('')}
    `).join('<hr class="receipt-divider"/>')}
    <hr class="receipt-divider"/>
    <div class="receipt-total-row"><span>Total</span><span>${fmt(total)}</span></div>
    ${given != null ? `<hr class="receipt-divider"/>
    <div class="receipt-row"><span>Cash</span><span>${fmt(given)}</span></div>
    <div class="receipt-row"><span>Change</span><span>${fmt(given - total)}</span></div>` : `<div class="receipt-row"><span>Paid by</span><span>${mallPayMethod}</span></div>`}
    <hr class="receipt-divider"/>
    <div class="receipt-qr">
      <div style="font-size:11px;color:#999;margin-bottom:6px">Scan for receipt</div>
      <img src="https://api.qrserver.com/v1/create-qr-code/?size=140x140&data=${encodeURIComponent(receiptText)}" width="110" height="110" alt="QR"/>
    </div>
    <div class="receipt-footer">🌊 Blue Ocean Mall Express · School Expo</div>
  `;

  document.getElementById('mall-checkout-modal').classList.remove('open');
  document.getElementById('mall-receipt-modal').classList.add('open');
  mallCart = [];
  updateMallCartBadge();
}


// ─── INIT ─────────────────────────────────────────────────────────────────────
function initApp() {
  renderProducts();
  renderCart();
  updateSidebarTotal();
}

// Bootstrap: load everything from Firebase, then decide what to show
bootstrapApp(state, rState, saveUsers, saveShifts, () => {
  const session = getSession();
  if (session && _users.find(u => u.username === session)) {
    showApp(session);
    initApp();
  } else {
    clearSession();
    document.getElementById('mall-screen').style.display = 'block';
    document.getElementById('app').style.display = 'none';
    initMall();
  }
});