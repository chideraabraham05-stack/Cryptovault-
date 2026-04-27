/**
 * CryptoVault Pro Server
 * Multi-page crypto platform with real wallet, real-time transactions, and admin panel
 */

const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const path = require('path');
const expressLayouts = require('express-ejs-layouts');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

// ======================= CONFIG =======================
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'cryptovault-super-secret-key-2024';
const ADMIN_EMAIL = 'admin@cryptovault.com';
const ADMIN_PASSWORD_HASH = bcrypt.hashSync('admin123', 10);
const SUPPORT_EMAIL = 'chideraabraham05@gmail.com';

// ======================= MIDDLEWARE =======================
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// View engine setup
app.use(expressLayouts);
app.set('view engine', 'ejs');
app.set('views', path.join(__dirname, 'views'));
app.set('layout', 'layout');

// Maintenance mode middleware
let maintenanceMode = false;
app.use((req, res, next) => {
  res.locals.maintenanceMode = maintenanceMode;
  res.locals.SUPPORT_EMAIL = SUPPORT_EMAIL;
  next();
});

// Helper functions middleware
app.use((req, res, next) => {
  res.locals.formatCurrency = (num) => {
    if (!num || isNaN(num)) return '$0.00';
    if (num >= 1e12) return '$' + (num / 1e12).toFixed(2) + 'T';
    if (num >= 1e9) return '$' + (num / 1e9).toFixed(2) + 'B';
    if (num >= 1e6) return '$' + (num / 1e6).toFixed(2) + 'M';
    if (num >= 1e3) return '$' + (num / 1e3).toFixed(2) + 'K';
    return '$' + num.toFixed(2);
  };
  res.locals.formatPrice = (num) => {
    if (!num || isNaN(num)) return '$0.00';
    if (num < 0.01) return '$' + num.toFixed(6);
    if (num < 1) return '$' + num.toFixed(4);
    return '$' + num.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 });
  };
  next();
});
// Cookie parser (simple) - MUST come before authMiddleware
app.use((req, res, next) => {
  const cookies = {};
  if (req.headers.cookie) {
    req.headers.cookie.split(';').forEach(c => {
      const [key, val] = c.trim().split('=');
      if (key) cookies[key] = val;
    });
  }
  req.cookies = cookies;
  next();
});

const authMiddleware = (req, res, next) => {
  const token = req.cookies?.token || req.headers.authorization?.split(' ')[1];
  if (token) {
    try {
      const decoded = jwt.verify(token, JWT_SECRET);
      const user = users.find(u => u.id === decoded.userId);
      if (user) {
        req.user = user;
        res.locals.user = user;
      }
    } catch (e) {
      // invalid token
    }
  }
  next();
};

// Require login middleware
const requireAuth = (req, res, next) => {
  if (!req.user) {
    return res.redirect('/login?redirect=' + encodeURIComponent(req.originalUrl));
  }
  next();
};

// Admin middleware
const requireAdmin = (req, res, next) => {
  if (!req.user || !req.user.isAdmin) {
    return res.status(403).send('Admin access required');
  }
  next();
};

app.use(authMiddleware);

// ======================= IN-MEMORY DATA =======================
const users = [];
const transactions = [];
const announcements = [];
let onlineUsers = 0;

// Default admin user
users.push({
  id: 'admin-1',
  name: 'Admin',
  email: ADMIN_EMAIL,
  password: ADMIN_PASSWORD_HASH,
  isAdmin: true,
  walletAddress: null,
  portfolio: {},
  createdAt: new Date()
});

// Demo user
users.push({
  id: 'user-1',
  name: 'Demo User',
  email: 'demo@cryptovault.com',
  password: bcrypt.hashSync('demo123', 10),
  isAdmin: false,
  walletAddress: '0x742d35Cc6634C0532925a3b8D4C9db96590f6C7E',
  portfolio: {
    BTC: 0.5,
    ETH: 5,
    SOL: 100,
    USDC: 1000
  },
  createdAt: new Date()
});

// ======================= COINGECKO API HELPERS =======================
const COIN_IDS = {
  BTC: 'bitcoin',
  ETH: 'ethereum',
  SOL: 'solana',
  USDC: 'usd-coin',
  USDT: 'tether',
  BNB: 'binancecoin',
  XRP: 'ripple',
  ADA: 'cardano',
  DOGE: 'dogecoin',
  TRX: 'tron',
  MATIC: 'matic-network',
  AVAX: 'avalanche-2',
  DOT: 'polkadot',
  LINK: 'chainlink'
};

let priceCache = {};
let lastPriceUpdate = 0;

async function fetchLivePrices() {
  const now = Date.now();
  if (now - lastPriceUpdate < 30000 && Object.keys(priceCache).length > 0) {
    return priceCache;
  }
  try {
    const ids = Object.values(COIN_IDS).join(',');
    const res = await fetch(`https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd&include_24hr_change=true&include_market_cap=true&include_24hr_vol=true`);
    const data = await res.json();
    priceCache = data;
    lastPriceUpdate = now;
    return data;
  } catch (err) {
    console.error('CoinGecko fetch error:', err.message);
    // Fallback demo data if cache is empty
    if (Object.keys(priceCache).length === 0) {
      priceCache = {
        bitcoin: { usd: 78323, usd_24h_change: 0.94, usd_market_cap: 1545000000000, usd_24h_vol: 22230000000 },
        ethereum: { usd: 2366.37, usd_24h_change: 2.04, usd_market_cap: 285000000000, usd_24h_vol: 10640000000 },
        solana: { usd: 86.79, usd_24h_change: 0.83, usd_market_cap: 50000000000, usd_24h_vol: 2080000000 },
        'usd-coin': { usd: 1.0, usd_24h_change: 0.01, usd_market_cap: 34000000000, usd_24h_vol: 5000000000 },
        tether: { usd: 1.0, usd_24h_change: -0.01, usd_market_cap: 83000000000, usd_24h_vol: 35000000000 },
        binancecoin: { usd: 635.31, usd_24h_change: 0.99, usd_market_cap: 95000000000, usd_24h_vol: 641000000 },
        ripple: { usd: 1.43, usd_24h_change: 0.35, usd_market_cap: 82000000000, usd_24h_vol: 1210000000 },
        cardano: { usd: 0.25, usd_24h_change: 0.78, usd_market_cap: 9000000000, usd_24h_vol: 250000000 },
        dogecoin: { usd: 0.099, usd_24h_change: 1.09, usd_market_cap: 14000000000, usd_24h_vol: 999000000 },
        tron: { usd: 0.32, usd_24h_change: -0.21, usd_market_cap: 29000000000, usd_24h_vol: 339000000 },
        'matic-network': { usd: 0.52, usd_24h_change: 1.5, usd_market_cap: 4800000000, usd_24h_vol: 180000000 },
        'avalanche-2': { usd: 36.5, usd_24h_change: 2.1, usd_market_cap: 13500000000, usd_24h_vol: 320000000 },
        polkadot: { usd: 6.8, usd_24h_change: 0.5, usd_market_cap: 9000000000, usd_24h_vol: 150000000 },
        chainlink: { usd: 14.2, usd_24h_change: 1.2, usd_market_cap: 8200000000, usd_24h_vol: 210000000 }
      };
      lastPriceUpdate = now;
    }
    return priceCache;
  }
}

function getSymbolPrice(symbol) {
  const id = COIN_IDS[symbol.toUpperCase()];
  if (!id || !priceCache[id]) return null;
  return {
    price: priceCache[id].usd,
    change24h: priceCache[id].usd_24h_change || 0,
    marketCap: priceCache[id].usd_market_cap || 0,
    volume24h: priceCache[id].usd_24h_vol || 0
  };
}

function getAllPrices() {
  const result = [];
  for (const [symbol, id] of Object.entries(COIN_IDS)) {
    if (priceCache[id]) {
      result.push({
        symbol,
        name: symbol === 'BTC' ? 'Bitcoin' : symbol === 'ETH' ? 'Ethereum' : symbol === 'SOL' ? 'Solana' : symbol === 'USDC' ? 'USD Coin' : symbol === 'USDT' ? 'Tether' : symbol === 'BNB' ? 'BNB' : symbol === 'XRP' ? 'XRP' : symbol === 'ADA' ? 'Cardano' : symbol === 'DOGE' ? 'Dogecoin' : symbol === 'TRX' ? 'TRON' : symbol === 'MATIC' ? 'Polygon' : symbol === 'AVAX' ? 'Avalanche' : symbol === 'DOT' ? 'Polkadot' : symbol === 'LINK' ? 'Chainlink' : symbol,
        price: priceCache[id].usd,
        change24h: priceCache[id].usd_24h_change || 0,
        marketCap: priceCache[id].usd_market_cap || 0,
        volume24h: priceCache[id].usd_24h_vol || 0
      });
    }
  }
  return result;
}

// ======================= SOCKET.IO =======================
io.on('connection', (socket) => {
  onlineUsers++;
  io.emit('stats', { onlineUsers });

  // Send recent announcements to new connection
  socket.emit('announcements', announcements.slice(-5));

  // Send recent transactions
  socket.emit('transactions', transactions.slice(-20));

  socket.on('disconnect', () => {
    onlineUsers--;
    io.emit('stats', { onlineUsers });
  });
});

function broadcastTransaction(tx) {
  transactions.unshift(tx);
  if (transactions.length > 500) transactions.pop();
  io.emit('new_transaction', tx);
}

function broadcastAnnouncement(announcement) {
  announcements.push(announcement);
  io.emit('announcement', announcement);
}

// ======================= AUTH ROUTES =======================

// GET login page
app.get('/login', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('login', { title: 'Login', error: null, redirect: req.query.redirect || '/' });
});

// GET register page
app.get('/register', (req, res) => {
  if (req.user) return res.redirect('/');
  res.render('register', { title: 'Register', error: null });
});

// POST register
app.post('/api/register', async (req, res) => {
  const { name, email, password } = req.body;
  if (!name || !email || !password) {
    return res.status(400).json({ error: 'All fields required' });
  }
  if (users.find(u => u.email === email)) {
    return res.status(400).json({ error: 'Email already registered' });
  }
  const hashedPassword = await bcrypt.hash(password, 10);
  const newUser = {
    id: 'user-' + Date.now(),
    name,
    email,
    password: hashedPassword,
    isAdmin: false,
    walletAddress: null,
    portfolio: { USDC: 100 }, // Starter bonus
    createdAt: new Date()
  };
  users.push(newUser);

  // Record registration transaction
  broadcastTransaction({
    id: 'tx-' + Date.now(),
    type: 'signup',
    userId: newUser.id,
    userEmail: newUser.email,
    amount: 100,
    token: 'USDC',
    from: 'System',
    to: newUser.email,
    status: 'Confirmed',
    timestamp: new Date(),
    message: 'Signup bonus'
  });

  const token = jwt.sign({ userId: newUser.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, token, user: { id: newUser.id, name, email } });
});

// POST login
app.post('/api/login', async (req, res) => {
  const { email, password } = req.body;
  const user = users.find(u => u.email === email);
  if (!user || !(await bcrypt.compare(password, user.password))) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ userId: user.id }, JWT_SECRET, { expiresIn: '7d' });
  res.cookie('token', token, { httpOnly: true, maxAge: 7 * 24 * 60 * 60 * 1000 });
  res.json({ success: true, token, user: { id: user.id, name: user.name, email: user.email, isAdmin: user.isAdmin } });
});

// POST logout
app.post('/api/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

// GET current user
app.get('/api/me', (req, res) => {
  if (!req.user) return res.status(401).json({ error: 'Not authenticated' });
  res.json({ user: { id: req.user.id, name: req.user.name, email: req.user.email, isAdmin: req.user.isAdmin, walletAddress: req.user.walletAddress, portfolio: req.user.portfolio } });
});

// ======================= PAGE ROUTES =======================

// Home / Market
app.get('/', async (req, res) => {
  await fetchLivePrices();
  const prices = getAllPrices();
  const stats = {
    marketCap: prices.reduce((sum, p) => sum + (p.marketCap || 0), 0),
    volume24h: prices.reduce((sum, p) => sum + (p.volume24h || 0), 0),
    btcDominance: prices.find(p => p.symbol === 'BTC')?.marketCap ? (prices.find(p => p.symbol === 'BTC').marketCap / prices.reduce((sum, p) => sum + (p.marketCap || 0), 0) * 100).toFixed(1) : 0,
    activeCryptos: prices.length
  };
  res.render('index', { title: 'CryptoVault - Digital Asset Hub', prices, stats });
});

// Swap page
app.get('/swap', async (req, res) => {
  await fetchLivePrices();
  const prices = getAllPrices();
  res.render('swap', { title: 'Swap Tokens - CryptoVault', prices });
});

// Portfolio page
app.get('/portfolio', requireAuth, async (req, res) => {
  await fetchLivePrices();
  const userTx = transactions.filter(t => t.userId === req.user.id || t.from === req.user.email || t.to === req.user.email);
  const portfolioValue = {};
  let totalValue = 0;
  for (const [token, amount] of Object.entries(req.user.portfolio || {})) {
    const price = getSymbolPrice(token);
    const value = amount * (price?.price || 0);
    portfolioValue[token] = { amount, price: price?.price || 0, value };
    totalValue += value;
  }
  res.render('portfolio', { title: 'My Portfolio - CryptoVault', portfolio: portfolioValue, totalValue, transactions: userTx });
});

// Wallet page
app.get('/wallet', requireAuth, async (req, res) => {
  await fetchLivePrices();
  res.render('wallet', { title: 'Connect Wallet - CryptoVault' });
});

// Admin page
app.get('/admin', requireAuth, requireAdmin, async (req, res) => {
  await fetchLivePrices();
  const allUsers = users.map(u => ({ id: u.id, name: u.name, email: u.email, walletAddress: u.walletAddress, portfolio: u.portfolio, isAdmin: u.isAdmin, createdAt: u.createdAt }));
  res.render('admin', { title: 'Admin Dashboard - CryptoVault', users: allUsers, transactions: transactions.slice(0, 50), maintenanceMode, onlineUsers });
});

// ======================= API ROUTES =======================

// Get live prices
app.get('/api/prices', async (req, res) => {
  const prices = await fetchLivePrices();
  res.json(prices);
});

// Swap endpoint
app.post('/api/swap', requireAuth, async (req, res) => {
  const { fromToken, toToken, amount } = req.body;
  if (!fromToken || !toToken || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid swap parameters' });
  }

  await fetchLivePrices();
  const fromPrice = getSymbolPrice(fromToken);
  const toPrice = getSymbolPrice(toToken);
  if (!fromPrice || !toPrice) {
    return res.status(400).json({ error: 'Price data unavailable' });
  }

  const user = req.user;
  const fromAmount = parseFloat(amount);
  const currentBal = user.portfolio[fromToken.toUpperCase()] || 0;
  if (currentBal < fromAmount) {
    return res.status(400).json({ error: `Insufficient ${fromToken} balance` });
  }

  const fromValue = fromAmount * fromPrice.price;
  const toAmount = fromValue / toPrice.price;
  const fee = fromValue * 0.005; // 0.5% fee
  const finalToAmount = (fromValue - fee) / toPrice.price;

  // Update portfolio
  user.portfolio[fromToken.toUpperCase()] = currentBal - fromAmount;
  user.portfolio[toToken.toUpperCase()] = (user.portfolio[toToken.toUpperCase()] || 0) + finalToAmount;

  const tx = {
    id: 'tx-' + Date.now(),
    type: 'swap',
    userId: user.id,
    userEmail: user.email,
    amount: fromAmount,
    token: fromToken.toUpperCase(),
    toAmount: finalToAmount,
    toToken: toToken.toUpperCase(),
    from: user.email,
    to: 'Swap Pool',
    status: 'Confirmed',
    timestamp: new Date(),
    fee,
    rate: fromPrice.price / toPrice.price
  };
  broadcastTransaction(tx);

  res.json({ success: true, tx, newBalance: user.portfolio });
});

// Transfer endpoint
app.post('/api/transfer', requireAuth, async (req, res) => {
  const { recipient, token, amount } = req.body;
  if (!recipient || !token || !amount || amount <= 0) {
    return res.status(400).json({ error: 'Invalid transfer parameters' });
  }

  const sender = req.user;
  const tokenUpper = token.toUpperCase();
  const sendAmount = parseFloat(amount);
  const senderBal = sender.portfolio[tokenUpper] || 0;
  if (senderBal < sendAmount) {
    return res.status(400).json({ error: `Insufficient ${tokenUpper} balance` });
  }

  // Find recipient by email or wallet address
  let recipientUser = users.find(u => u.email === recipient || u.walletAddress === recipient);
  if (!recipientUser) {
    return res.status(404).json({ error: 'Recipient not found' });
  }
  if (recipientUser.id === sender.id) {
    return res.status(400).json({ error: 'Cannot send to yourself' });
  }

  // Update balances
  sender.portfolio[tokenUpper] = senderBal - sendAmount;
  recipientUser.portfolio[tokenUpper] = (recipientUser.portfolio[tokenUpper] || 0) + sendAmount;

  const tx = {
    id: 'tx-' + Date.now(),
    type: 'transfer',
    userId: sender.id,
    userEmail: sender.email,
    recipientId: recipientUser.id,
    recipientEmail: recipientUser.email,
    amount: sendAmount,
    token: tokenUpper,
    from: sender.email,
    to: recipientUser.email,
    status: 'Confirmed',
    timestamp: new Date()
  };
  broadcastTransaction(tx);

  // Also create a received transaction for recipient
  const recvTx = {
    id: 'tx-' + Date.now() + '-recv',
    type: 'receive',
    userId: recipientUser.id,
    userEmail: recipientUser.email,
    senderId: sender.id,
    senderEmail: sender.email,
    amount: sendAmount,
    token: tokenUpper,
    from: sender.email,
    to: recipientUser.email,
    status: 'Confirmed',
    timestamp: new Date()
  };
  broadcastTransaction(recvTx);

  res.json({ success: true, tx, senderBalance: sender.portfolio });
});

// Wallet connect endpoint
app.post('/api/wallet/connect', requireAuth, (req, res) => {
  const { walletAddress, network } = req.body;
  if (!walletAddress) {
    return res.status(400).json({ error: 'Wallet address required' });
  }
  req.user.walletAddress = walletAddress;
  if (network) req.user.network = network;
  res.json({ success: true, walletAddress });
});

// Wallet disconnect
app.post('/api/wallet/disconnect', requireAuth, (req, res) => {
  req.user.walletAddress = null;
  req.user.network = null;
  res.json({ success: true });
});

// ======================= ADMIN API =======================

// Admin credit/debit
app.post('/api/admin/credit', requireAuth, requireAdmin, (req, res) => {
  const { userId, token, amount } = req.body;
  const targetUser = users.find(u => u.id === userId);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const tokenUpper = token.toUpperCase();
  targetUser.portfolio[tokenUpper] = (targetUser.portfolio[tokenUpper] || 0) + parseFloat(amount);

  const tx = {
    id: 'tx-' + Date.now(),
    type: 'admin_credit',
    userId: targetUser.id,
    userEmail: targetUser.email,
    amount: parseFloat(amount),
    token: tokenUpper,
    from: 'Admin',
    to: targetUser.email,
    status: 'Confirmed',
    timestamp: new Date(),
    adminId: req.user.id
  };
  broadcastTransaction(tx);

  res.json({ success: true, newBalance: targetUser.portfolio });
});

app.post('/api/admin/debit', requireAuth, requireAdmin, (req, res) => {
  const { userId, token, amount } = req.body;
  const targetUser = users.find(u => u.id === userId);
  if (!targetUser) return res.status(404).json({ error: 'User not found' });

  const tokenUpper = token.toUpperCase();
  const current = targetUser.portfolio[tokenUpper] || 0;
  if (current < parseFloat(amount)) {
    return res.status(400).json({ error: 'Insufficient balance to debit' });
  }
  targetUser.portfolio[tokenUpper] = current - parseFloat(amount);

  const tx = {
    id: 'tx-' + Date.now(),
    type: 'admin_debit',
    userId: targetUser.id,
    userEmail: targetUser.email,
    amount: parseFloat(amount),
    token: tokenUpper,
    from: targetUser.email,
    to: 'Admin',
    status: 'Confirmed',
    timestamp: new Date(),
    adminId: req.user.id
  };
  broadcastTransaction(tx);

  res.json({ success: true, newBalance: targetUser.portfolio });
});

// Admin announcement
app.post('/api/admin/announce', requireAuth, requireAdmin, (req, res) => {
  const { message } = req.body;
  if (!message) return res.status(400).json({ error: 'Message required' });
  const announcement = {
    id: 'ann-' + Date.now(),
    message,
    timestamp: new Date(),
    admin: req.user.email
  };
  broadcastAnnouncement(announcement);
  res.json({ success: true, announcement });
});

// Toggle maintenance
app.post('/api/admin/maintenance', requireAuth, requireAdmin, (req, res) => {
  maintenanceMode = !maintenanceMode;
  io.emit('maintenance', { enabled: maintenanceMode });
  res.json({ success: true, maintenanceMode });
});

// Get all users (admin)
app.get('/api/admin/users', requireAuth, requireAdmin, (req, res) => {
  const safeUsers = users.map(u => ({ id: u.id, name: u.name, email: u.email, walletAddress: u.walletAddress, portfolio: u.portfolio, isAdmin: u.isAdmin, createdAt: u.createdAt }));
  res.json({ users: safeUsers });
});

// Get all transactions (admin)
app.get('/api/admin/transactions', requireAuth, requireAdmin, (req, res) => {
  res.json({ transactions: transactions.slice(0, 100) });
});

// ======================= ERROR HANDLING =======================
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).render('error', { title: 'Error', message: 'Something went wrong!' });
});

// ======================= START SERVER =======================
server.listen(PORT, () => {
  console.log(`CryptoVault Pro running on port ${PORT}`);
  console.log(`Admin login: ${ADMIN_EMAIL} / admin123`);
});
