// ─── FIREBASE CONFIG ──────────────────────────────────────────────────────────
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.0/firebase-app.js";
import {
  getFirestore, doc, getDoc, setDoc, updateDoc, deleteDoc,
  collection, getDocs, addDoc, onSnapshot, query, orderBy, serverTimestamp
} from "https://www.gstatic.com/firebasejs/10.12.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyDP3gBd-EVrNJ1mXw4q2Fvkz7aK8VBY6Uk",
  authDomain: "exposell-pos.firebaseapp.com",
  projectId: "exposell-pos",
  storageBucket: "exposell-pos.firebasestorage.app",
  messagingSenderId: "141265554854",
  appId: "1:141265554854:web:f3fad212a8d69a8931d367"
};

const app = initializeApp(firebaseConfig);
const db  = getFirestore(app);

// ─── LOADING OVERLAY ──────────────────────────────────────────────────────────
function showLoader(msg = 'Loading…') {
  let el = document.getElementById('fb-loader');
  if (!el) {
    el = document.createElement('div');
    el.id = 'fb-loader';
    el.style.cssText = `position:fixed;inset:0;background:rgba(250,249,246,0.92);display:flex;flex-direction:column;
      align-items:center;justify-content:center;z-index:9999;font-family:'DM Sans',sans-serif;gap:14px`;
    el.innerHTML = `<div style="font-size:36px">🌊</div>
      <div style="font-size:16px;font-weight:600;color:#1a1917" id="fb-loader-msg">${msg}</div>
      <div style="width:200px;height:3px;background:#e8e5de;border-radius:2px;overflow:hidden">
        <div id="fb-loader-bar" style="height:100%;width:0%;background:#c84b2f;border-radius:2px;transition:width 0.4s"></div>
      </div>`;
    document.body.appendChild(el);
  } else {
    document.getElementById('fb-loader-msg').textContent = msg;
  }
  return el;
}
function setLoaderProgress(pct) {
  const bar = document.getElementById('fb-loader-bar');
  if (bar) bar.style.width = pct + '%';
}
function hideLoader() {
  const el = document.getElementById('fb-loader');
  if (el) { el.style.opacity = '0'; el.style.transition = 'opacity 0.3s'; setTimeout(() => el.remove(), 300); }
}

// ─── SEED DEFAULTS ────────────────────────────────────────────────────────────
const DEFAULT_SETTINGS = { bizName: 'Blue Ocean Mall Express', taxRate: 8, currency: '$' };
const DEFAULT_PRODUCTS = [
  { id: 1, name: 'Lemonade',     category: 'Drinks',      price: 2.50, stock: 30, emoji: '🍋' },
  { id: 2, name: 'Cookies 2pk',  category: 'Snacks',      price: 1.50, stock: 40, emoji: '🍪' },
  { id: 3, name: 'Bracelet',     category: 'Crafts',      price: 5.00, stock: 15, emoji: '📿' },
  { id: 4, name: 'Cupcake',      category: 'Baked Goods', price: 3.00, stock: 20, emoji: '🧁' },
  { id: 5, name: 'Bookmarks',    category: 'Crafts',      price: 1.00, stock: 50, emoji: '🔖' },
  { id: 6, name: 'Smoothie',     category: 'Drinks',      price: 4.00, stock: 12, emoji: '🥤' },
];

// ─── GENERIC HELPERS ──────────────────────────────────────────────────────────
async function fbGet(path) {
  const snap = await getDoc(doc(db, ...path.split('/')));
  return snap.exists() ? snap.data() : null;
}
async function fbSet(path, data) {
  await setDoc(doc(db, ...path.split('/')), data, { merge: true });
}
async function fbDel(path) {
  await deleteDoc(doc(db, ...path.split('/')));
}
async function fbList(col) {
  const snap = await getDocs(collection(db, col));
  return snap.docs.map(d => ({ _id: d.id, ...d.data() }));
}
async function fbAdd(col, data) {
  const ref = await addDoc(collection(db, col), { ...data, _ts: serverTimestamp() });
  return ref.id;
}

// ─── SETTINGS ─────────────────────────────────────────────────────────────────
export async function loadSettings() {
  const s = await fbGet('config/settings');
  return s || { ...DEFAULT_SETTINGS };
}
export async function saveSettings(settings) {
  await fbSet('config/settings', settings);
}

// ─── USERS ────────────────────────────────────────────────────────────────────
export async function fbGetUsers() {
  return fbList('users');
}
export async function fbSaveUser(user) {
  await fbSet(`users/${user.username}`, user);
}
export async function fbDeleteUser(username) {
  await fbDel(`users/${username}`);
}
export async function fbGetUser(username) {
  return fbGet(`users/${username}`);
}

// ─── PRODUCTS ─────────────────────────────────────────────────────────────────
export async function fbGetProducts() {
  const prods = await fbList('products');
  if (prods.length === 0) {
    // Seed defaults on first run
    for (const p of DEFAULT_PRODUCTS) {
      await fbSet(`products/${p.id}`, p);
    }
    return DEFAULT_PRODUCTS.map(p => ({ _id: String(p.id), ...p }));
  }
  return prods;
}
export async function fbSaveProduct(product) {
  await fbSet(`products/${product.id}`, product);
}
export async function fbDeleteProduct(id) {
  await fbDel(`products/${id}`);
}

// ─── SALES ────────────────────────────────────────────────────────────────────
export async function fbGetSales() {
  return fbList('sales');
}
export async function fbAddSale(sale) {
  return fbAdd('sales', sale);
}

// ─── SHIFTS ───────────────────────────────────────────────────────────────────
export async function fbGetShifts() {
  return fbList('shifts');
}
export async function fbSaveShift(shift) {
  await fbSet(`shifts/${shift.id}`, shift);
}

// ─── RESTAURANT STATE ─────────────────────────────────────────────────────────
export async function fbGetRestaurantMenu() {
  const items = await fbList('restaurant_menu');
  if (items.length === 0) {
    const defaults = [
      { id:'r1', name:'Garlic Bread',    category:'Starters',  price:4.00,  emoji:'🥖', available:true },
      { id:'r2', name:'Soup of the Day', category:'Starters',  price:5.50,  emoji:'🍲', available:true },
      { id:'r3', name:'Burger',          category:'Mains',     price:10.00, emoji:'🍔', available:true },
      { id:'r4', name:'Pasta',           category:'Mains',     price:9.00,  emoji:'🍝', available:true },
      { id:'r5', name:'Grilled Chicken', category:'Mains',     price:12.00, emoji:'🍗', available:true },
      { id:'r6', name:'Salad',           category:'Mains',     price:7.50,  emoji:'🥗', available:true },
      { id:'r7', name:'Lemonade',        category:'Drinks',    price:2.50,  emoji:'🍋', available:true },
      { id:'r8', name:'Water',           category:'Drinks',    price:1.00,  emoji:'💧', available:true },
      { id:'r9', name:'Soda',            category:'Drinks',    price:2.00,  emoji:'🥤', available:true },
      { id:'r10',name:'Brownie',         category:'Desserts',  price:4.50,  emoji:'🍫', available:true },
      { id:'r11',name:'Ice Cream',       category:'Desserts',  price:3.50,  emoji:'🍨', available:true },
    ];
    for (const item of defaults) await fbSet(`restaurant_menu/${item.id}`, item);
    return defaults;
  }
  return items;
}
export async function fbSaveMenuItem(item) {
  await fbSet(`restaurant_menu/${item.id}`, item);
}
export async function fbDeleteMenuItem(id) {
  await fbDel(`restaurant_menu/${id}`);
}
export async function fbGetRestaurantOrders() {
  return fbList('restaurant_orders');
}
export async function fbSaveRestaurantOrder(order) {
  await fbSet(`restaurant_orders/${order.id}`, order);
}

// ─── REAL-TIME LISTENERS ──────────────────────────────────────────────────────
export function listenProducts(callback) {
  return onSnapshot(collection(db, 'products'), snap => {
    callback(snap.docs.map(d => ({ _id: d.id, ...d.data() })));
  });
}
export function listenSales(callback) {
  return onSnapshot(collection(db, 'sales'), snap => {
    callback(snap.docs.map(d => ({ _id: d.id, ...d.data() })));
  });
}
export function listenRestaurantOrders(callback) {
  return onSnapshot(collection(db, 'restaurant_orders'), snap => {
    callback(snap.docs.map(d => ({ _id: d.id, ...d.data() })));
  });
}
export function listenShifts(callback) {
  return onSnapshot(collection(db, 'shifts'), snap => {
    callback(snap.docs.map(d => ({ _id: d.id, ...d.data() })));
  });
}

// ─── BOOTSTRAP — load everything and inject into app state ────────────────────
export async function bootstrapApp(state, rState, setUsers, setShifts, onReady) {
  showLoader('Connecting to database…');
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
    setLoaderProgress(80);

    state.settings  = settings;
    state.products  = products;
    state.sales     = sales;
    state.nextId    = products.reduce((m, p) => Math.max(m, Number(p.id) || 0), 10) + 1;

    rState.menu     = rMenu;
    rState.orders   = rOrders;
    rState.nextOrderId = rOrders.reduce((m, o) => Math.max(m, Number(o.id) || 0), 0) + 1;
    rState.nextMenuId  = rMenu.reduce((m, i) => Math.max(m, Number(String(i.id).replace('r','')) || 0), 100) + 1;

    setUsers(users);
    setShifts(shifts);

    setLoaderProgress(100);
    setTimeout(hideLoader, 400);
    onReady();
  } catch (err) {
    console.error('Firebase bootstrap error:', err);
    document.getElementById('fb-loader-msg').textContent = '⚠️ Database error. Check console.';
  }
}

export { db, fbSet, fbDel, fbGet, fbList, fbAdd, serverTimestamp };