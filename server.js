const express = require('express');
const cors = require('cors');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const app = express();
app.use(cors());
app.use(express.json());
app.use(express.static('public')); // serves public/index.html

const SECRET = process.env.JWT_SECRET || 'cryptovault-super-secret-2026';

// In-memory storage (swap for a real DB in production)
let users = {};
let portfolios = {};
let transactions = {}; // email -> tx array

// ── REGISTER ─────────────────────────────────────
app.post('/api/register', (req, res) => {
  const { email, password } = req.body;
  if (!email || !password) return res.status(400).json({ error: 'Email and password required' });
  if (users[email]) return res.status(400).json({ error: 'User already exists' });

  users[email] = { password };
  portfolios[email] = [
    { symbol: 'BTC', amount: 0.84, avgPrice: 67842 },
    { symbol: 'ETH', amount: 4.2, avgPrice: 3245 },
    { symbol: 'SOL', amount: 18, avgPrice: 145 },
    { symbol: 'USDC', amount: 1500, avgPrice: 1 }
  ];
  transactions[email] = [];

  res.json({ message: 'Registered successfully' });
});

// ── LOGIN ─────────────────────────────────────────
app.post('/api/login', (req, res) => {
  const { email, password } = req.body;
  if (!users[email] || users[email].password !== password) {
    return res.status(401).json({ error: 'Invalid credentials' });
  }
  const token = jwt.sign({ email }, SECRET, { expiresIn: '24h' });
  res.json({ token, email });
});

// ── AUTH MIDDLEWARE ───────────────────────────────
const authenticate = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token provided' });
  try {
    req.user = jwt.verify(token, SECRET);
    next();
  } catch {
    res.status(401).json({ error: 'Invalid or expired token' });
  }
};

// ── GET PORTFOLIO ─────────────────────────────────
app.get('/api/portfolio', authenticate, (req, res) => {
  res.json(portfolios[req.user.email] || []);
});

// ── GET TRANSACTIONS ──────────────────────────────
app.get('/api/transactions', authenticate, (req, res) => {
  res.json(transactions[req.user.email] || []);
});

// ── EXECUTE SWAP ──────────────────────────────────
app.post('/api/swap', authenticate, (req, res) => {
  const { fromSymbol, fromAmount, toSymbol, toAmount } = req.body;
  const email = req.user.email;
  const portfolio = portfolios[email] || [];

  const from = parseFloat(fromAmount);
  const to = parseFloat(toAmount);

  if (isNaN(from) || from <= 0) return res.status(400).json({ error: 'Invalid amount' });
  if (fromSymbol === toSymbol) return res.status(400).json({ error: 'Cannot swap same token' });

  // Check balance (only enforce for non-USDC demo)
  const fromAsset = portfolio.find(a => a.symbol === fromSymbol);
  if (!fromAsset || fromAsset.amount < from) {
    return res.status(400).json({ error: `Insufficient ${fromSymbol} balance` });
  }

  // Deduct from
  fromAsset.amount = parseFloat((fromAsset.amount - from).toFixed(8));

  // Add to
  const toAsset = portfolio.find(a => a.symbol === toSymbol);
  if (toAsset) {
    toAsset.amount = parseFloat((toAsset.amount + to).toFixed(8));
  } else {
    portfolio.push({ symbol: toSymbol, amount: to, avgPrice: 0 });
  }

  portfolios[email] = portfolio;

  // Record transaction
  if (!transactions[email]) transactions[email] = [];
  transactions[email].push({
    id: Date.now(),
    type: 'swap',
    fromSymbol, fromAmount: from,
    toSymbol, toAmount: to,
    timestamp: new Date().toISOString()
  });

  res.json({ success: true, newPortfolio: portfolio });
});

// ── START ─────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`\n🚀 CryptoVault running → http://localhost:${PORT}`);
  console.log(`📧 Support: chideraabraham05@gmail.com\n`);
});
