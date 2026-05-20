// ─── FIREBASE COMPAT SDK (globals, no import/export needed) ──────────────────
// All functions here are global — called directly from app.js

const firebaseConfig = {
  apiKey: "AIzaSyDP3gBd-EVrNJ1mXw4q2Fvkz7aK8VBY6Uk",
  authDomain: "exposell-pos.firebaseapp.com",
  projectId: "exposell-pos",
  storageBucket: "exposell-pos.firebasestorage.app",
  messagingSenderId: "141265554854",
  appId: "1:141265554854:web:f3fad212a8d69a8931d367"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.firestore();

// ─── LOADING OVERLAY ─────────────────────────────────────────────────────────
function showLoader(msg) {
  let el = document.getElementById('fb-loader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fb-loader';
    el.style.cssText = [
      'position:fixed','inset:0','background:rgba(250,249,246,0.95)',
      'display:flex','flex-direction:column','align-items:center',
      'justify-content:center','z-index:9999',
      'font-family:DM Sans,sans-serif','gap:14px'
    ].join(';');
    el.innerHTML = `
      <div style="font-size:40px">🌊</div>
      <div id="fb-loader-msg" style="font-size:16px;font-weight:600;color:#1a1917">${msg || 'Loading...'}</div>
      <div style="width:220px;height:4px;background:#e8e5de;border-radius:2px;overflow:hidden">
        <div id="fb-loader-bar" style="height:100%;width:0%;background:#c84b2f;border-radius:2px;transition:width 0.4s ease"></div>
      </div>`;
    document.body.appendChild(el);
  } else {
    document.getElementById('fb-loader-msg').textContent = msg || 'Loading...';
  }
}
function setLoaderProgress(pct) {
  const bar = document.getElementById('fb-loader-bar');
  if (bar) bar.style.width = pct + '%';
}
function hideLoader() {
  const el = document.getElementById('fb-loader');
  if (!el) return;
  el.style.opacity = '0';
  el.style.transition = 'opacity 0.3s';
  setTimeout(() => { if (el.parentNode) el.parentNode.removeChild(el); }, 350);
}

// ─── HELPERS ─────────────────────────────────────────────────────────────────
async function fbGetDoc(col, id) {
  const snap = await db.collection(col).doc(id).get();
  return snap.exists ? snap.data() : null;
}
async function fbSetDoc(col, id, data) {
  await db.collection(col).doc(id).set(data, { merge: true });
}
async function fbDelDoc(col, id) {
  await db.collection(col).doc(id).delete();
}
async function fbGetAll(col) {
  const snap = await db.collection(col).get();
  return snap.docs.map(d => ({ _id: d.id, ...d.data() }));
}
async function fbAddDoc(col, data) {
  const ref = await db.collection(col).add({ ...data, _ts: firebase.firestore.FieldValue.serverTimestamp() });
  return ref.id;
}

// ─── SETTINGS ────────────────────────────────────────────────────────────────
async function loadSettings() {
  const s = await fbGetDoc('config', 'settings');
  return s || { bizName: 'Blue Ocean Mall Express', taxRate: 8, currency: '$' };
}
async function saveSettings(settings) {
  await fbSetDoc('config', 'settings', settings);
}

// ─── USERS ───────────────────────────────────────────────────────────────────
async function fbGetUsers()            { return fbGetAll('users'); }
async function fbGetUser(username)     { return fbGetDoc('users', username); }
async function fbSaveUser(user)        { await fbSetDoc('users', user.username, user); }
async function fbDeleteUser(username)  { await fbDelDoc('users', username); }

// ─── PRODUCTS ────────────────────────────────────────────────────────────────
const _DEFAULT_PRODUCTS = [
  // ── PlayStation Store ──────────────────────────────────────────────────────
  { id: 1,  name: 'PlayStation®VR2', category: 'PlayStation Store', price: 399.00, stock: 100, emoji: '🥽' },
  { id: 2,  name: 'DualSense Edge® Wireless Controller – Midnight Black', category: 'PlayStation Store', price: 199.00, stock: 100, emoji: '🕹️' },
  { id: 3,  name: 'DualSense Edge™ Wireless Controller – 30th Anniversary Limited Edition', category: 'PlayStation Store', price: 219.99, stock: 100, emoji: '🕹️' },
  { id: 4,  name: 'PlayStation®5 Pro Console – 2 TB', category: 'PlayStation Store', price: 899.00, stock: 100, emoji: '🖥️' },
  { id: 5,  name: 'DualSense® Wireless Controller – Nova Pink', category: 'PlayStation Store', price: 74.00, stock: 100, emoji: '🕹️' },
  { id: 6,  name: 'Victrix™ Pro BFG™ Reloaded Wireless Modular Controller & Atlas™ 200 Wired Headset Bundle', category: 'PlayStation Store', price: 24.99, stock: 100, emoji: '🎧' },
  { id: 7,  name: 'PS5® Console Covers (Slim) – Techno Red', category: 'PlayStation Store', price: 74.00, stock: 100, emoji: '🔴' },
  { id: 8,  name: 'Certified Refurbished PlayStation®5 Console (Slim)', category: 'PlayStation Store', price: 549.00, stock: 100, emoji: '🖥️' },
  { id: 9,  name: '2TB WD BLACK Internal SN850P NVMe™ SSD', category: 'PlayStation Store', price: 909.99, stock: 75, emoji: '💾' },
  { id: 10, name: '4TB WD BLACK Internal SN850P NVMe™ SSD', category: 'PlayStation Store', price: 1369.99, stock: 50, emoji: '💾' },
  // ── GameStop ───────────────────────────────────────────────────────────────
  { id: 11, name: 'Nintendo Switch 2', category: 'GameStop', price: 417.99, stock: 100, emoji: '🎮' },
  { id: 12, name: 'MacBook Pro (M1, 13-inch) – 8GB 256GB Silver', category: 'GameStop', price: 449.99, stock: 100, emoji: '💻' },
  { id: 13, name: 'Samsung 980 PRO 1TB PCIe 4.0 NVMe SSD (PS5 Compatible)', category: 'GameStop', price: 89.97, stock: 125, emoji: '💾' },
  { id: 14, name: 'External Hard Drive 1TB', category: 'GameStop', price: 21.99, stock: 150, emoji: '🗄️' },
  { id: 15, name: 'Logitech PRO Wireless Gaming Mouse', category: 'GameStop', price: 89.97, stock: 100, emoji: '🖱️' },
  { id: 16, name: 'GameStop Air Wired Gaming Mouse with RGB – White', category: 'GameStop', price: 16.97, stock: 115, emoji: '🖱️' },
  { id: 17, name: 'GameStop 60% Wired Mechanical Keyboard', category: 'GameStop', price: 31.98, stock: 100, emoji: '⌨️' },
  { id: 18, name: 'Razer BlackWidow V3 Mini HyperSpeed 65% Wireless Keyboard – Black', category: 'GameStop', price: 136.97, stock: 75, emoji: '⌨️' },
  { id: 19, name: 'AMD Ryzen 5 5600X Processor 6-core up to 4.6 GHz AM4', category: 'GameStop', price: 165.98, stock: 80, emoji: '🔲' },
  { id: 20, name: 'PNY XLR8 Gaming 16GB (2×8GB) DDR4 Desktop Memory Kit', category: 'GameStop', price: 58.97, stock: 75, emoji: '🧩' },
  // ── Best Buy ───────────────────────────────────────────────────────────────
  { id: 21, name: 'CORSAIR VENGEANCE 16GB DDR5 4800MHz SODIMM Laptop Memory – Black', category: 'Best Buy', price: 164.99, stock: 50, emoji: '🧩' },
  { id: 22, name: 'Intel Core Ultra 7 Processor 270K – 24 cores up to 5.5 GHz', category: 'Best Buy', price: 329.99, stock: 50, emoji: '🔲' },
];
async function fbGetProducts() {
  let prods = await fbGetAll('products');
  if (prods.length === 0) {
    for (const p of _DEFAULT_PRODUCTS) await fbSetDoc('products', String(p.id), p);
    return _DEFAULT_PRODUCTS.slice();
  }
  return prods;
}
async function fbSaveProduct(product)  { await fbSetDoc('products', String(product.id), product); }
async function fbDeleteProduct(id)     { await fbDelDoc('products', String(id)); }

// ─── SALES ───────────────────────────────────────────────────────────────────
async function fbGetSales()            { return fbGetAll('sales'); }
async function fbAddSale(sale)         { return fbAddDoc('sales', sale); }

// ─── SHIFTS ──────────────────────────────────────────────────────────────────
async function fbGetShifts()           { return fbGetAll('shifts'); }
async function fbSaveShift(shift)      { await fbSetDoc('shifts', String(shift.id), shift); }

// ─── RESTAURANT ──────────────────────────────────────────────────────────────
const _DEFAULT_MENU = [
  { id:'r1',  name:'Garlic Bread',    category:'Starters', price:4.00,  emoji:'🥖', available:true },
  { id:'r2',  name:'Soup of the Day', category:'Starters', price:5.50,  emoji:'🍲', available:true },
  { id:'r3',  name:'Burger',          category:'Mains',    price:10.00, emoji:'🍔', available:true },
  { id:'r4',  name:'Pasta',           category:'Mains',    price:9.00,  emoji:'🍝', available:true },
  { id:'r5',  name:'Grilled Chicken', category:'Mains',    price:12.00, emoji:'🍗', available:true },
  { id:'r6',  name:'Salad',           category:'Mains',    price:7.50,  emoji:'🥗', available:true },
  { id:'r7',  name:'Lemonade',        category:'Drinks',   price:2.50,  emoji:'🍋', available:true },
  { id:'r8',  name:'Water',           category:'Drinks',   price:1.00,  emoji:'💧', available:true },
  { id:'r9',  name:'Soda',            category:'Drinks',   price:2.00,  emoji:'🥤', available:true },
  { id:'r10', name:'Brownie',         category:'Desserts', price:4.50,  emoji:'🍫', available:true },
  { id:'r11', name:'Ice Cream',       category:'Desserts', price:3.50,  emoji:'🍨', available:true },
];
async function fbGetRestaurantMenu() {
  let items = await fbGetAll('restaurant_menu');
  if (items.length === 0) {
    for (const item of _DEFAULT_MENU) await fbSetDoc('restaurant_menu', item.id, item);
    return _DEFAULT_MENU.slice();
  }
  return items;
}
async function fbSaveMenuItem(item)        { await fbSetDoc('restaurant_menu', item.id, item); }
async function fbDeleteMenuItem(id)        { await fbDelDoc('restaurant_menu', id); }
async function fbGetRestaurantOrders()     { return fbGetAll('restaurant_orders'); }
async function fbSaveRestaurantOrder(order){ await fbSetDoc('restaurant_orders', String(order.id), order); }

// ─── BOOTSTRAP ───────────────────────────────────────────────────────────────
async function bootstrapApp(state, rState, setUsers, setShifts, onReady) {
  showLoader('Connecting to database...');
  setLoaderProgress(10);
  try {
    const [settings, products, sales, users, shifts, rMenu, rOrders] = await Promise.all([
      loadSettings(),
      fbGetProducts(),
      fbGetSales(),
      fbGetUsers(),
      fbGetShifts(),
      fbGetRestaurantMenu(),
      fbGetRestaurantOrders(),
    ]);
    setLoaderProgress(85);

    state.settings     = settings;
    state.products     = products;
    state.sales        = sales;
    state.nextId       = products.reduce((m, p) => Math.max(m, Number(p.id) || 0), 10) + 1;

    rState.menu        = rMenu;
    rState.orders      = rOrders;
    rState.nextOrderId = rOrders.reduce((m, o) => Math.max(m, Number(o.id) || 0), 0) + 1;
    rState.nextMenuId  = rMenu.reduce((m, i) => Math.max(m, Number(String(i.id).replace('r','')) || 0), 100) + 1;

    setUsers(users);
    setShifts(shifts);

    setLoaderProgress(100);
    setTimeout(hideLoader, 500);
    onReady();
  } catch (err) {
    console.error('Firebase error:', err);
    const msgEl = document.getElementById('fb-loader-msg');
    if (msgEl) msgEl.textContent = 'Database error — check console (F12).';
  }
}