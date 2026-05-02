'use client';

import React, { useState, useEffect } from 'react';
import { ethers } from 'ethers';
import { ArrowDown, Wallet, RefreshCw } from 'lucide-react';

const tokens = [
  { symbol: 'ETH', name: 'Ethereum', icon: '⟠', address: '0x...' },
  { symbol: 'BTC', name: 'Bitcoin (wBTC)', icon: '₿', address: '0x...' },
  { symbol: 'USDC', name: 'USD Coin', icon: '$', address: '0x...' },
  { symbol: 'SOL', name: 'Solana (wSOL)', icon: '◎', address: '0x...' },
];

export default function SwapPage() {
  const [account, setAccount] = useState(null);
  const [provider, setProvider] = useState(null);
  const [fromToken, setFromToken] = useState(tokens[0]);
  const [toToken, setToToken] = useState(tokens[2]);
  const [fromAmount, setFromAmount] = useState('');
  const [toAmount, setToAmount] = useState('');
  const [slippage, setSlippage] = useState(0.5);
  const [prices, setPrices] = useState({});
  const [loading, setLoading] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  // Connect Wallet
  const connectWallet = async () => {
    if (!window.ethereum) {
      alert("Please install MetaMask!");
      return;
    }
    try {
      const prov = new ethers.BrowserProvider(window.ethereum);
      const accounts = await prov.send("eth_requestAccounts", []);
      setAccount(accounts[0]);
      setProvider(prov);
    } catch (error) {
      console.error(error);
    }
  };

  // Fetch prices from CoinGecko
  const fetchPrices = async () => {
    try {
      const ids = 'ethereum,bitcoin,usd-coin,solana';
      const res = await fetch(
        `https://api.coingecko.com/api/v3/simple/price?ids=${ids}&vs_currencies=usd`
      );
      const data = await res.json();
      setPrices({
        ETH: data.ethereum?.usd || 2300,
        BTC: data.bitcoin?.usd || 78400,
        USDC: 1,
        SOL: data.solana?.usd || 84,
      });
    } catch (e) {
      console.error("Price fetch failed");
    }
  };

  useEffect(() => {
    fetchPrices();
    const interval = setInterval(fetchPrices, 30000); // Refresh every 30s
    return () => clearInterval(interval);
  }, []);

  // Calculate estimated receive amount
  useEffect(() => {
    if (!fromAmount || !prices[fromToken.symbol] || !prices[toToken.symbol]) return;
    const fromUsd = parseFloat(fromAmount) * prices[fromToken.symbol];
    const estimated = fromUsd / prices[toToken.symbol];
    setToAmount(estimated.toFixed(6));
  }, [fromAmount, fromToken, toToken, prices]);

  const handleSwap = () => {
    if (!account) {
      alert("Please connect wallet first");
      return;
    }
    if (!fromAmount) return;
    setShowConfirm(true);
  };

  const executeSwap = async () => {
    setLoading(true);
    try {
      // In production: Use Uniswap SDK / 1inch API / custom contract
      await new Promise(resolve => setTimeout(resolve, 1500)); // Simulate tx
      alert(`✅ Swap executed! ${fromAmount} ${fromToken.symbol} → ${toAmount} ${toToken.symbol}`);
      setShowConfirm(false);
      setFromAmount('');
    } catch (error) {
      alert("Transaction failed");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-slate-950 to-slate-900 text-white p-6">
      <div className="max-w-xl mx-auto">
        <div className="flex justify-between items-center mb-8">
          <h1 className="text-4xl font-bold">Swap</h1>
          <button
            onClick={connectWallet}
            className="flex items-center gap-2 bg-slate-800 hover:bg-slate-700 px-5 py-3 rounded-2xl transition"
          >
            <Wallet size={20} />
            {account ? `${account.slice(0,6)}...${account.slice(-4)}` : 'Connect Wallet'}
          </button>
        </div>

        <div className="bg-slate-800/50 backdrop-blur-xl border border-slate-700 rounded-3xl p-8 shadow-2xl">
          {/* From */}
          <div className="mb-6">
            <div className="flex justify-between text-sm mb-3">
              <span>You Pay</span>
              <span>Balance: 12.45 {fromToken.symbol}</span>
            </div>
            <div className="flex gap-4 bg-slate-900 rounded-2xl p-5">
              <input
                type="number"
                value={fromAmount}
                onChange={(e) => setFromAmount(e.target.value)}
                placeholder="0.0"
                className="bg-transparent text-4xl outline-none flex-1"
              />
              <TokenSelector token={fromToken} onChange={setFromToken} tokens={tokens} />
            </div>
          </div>

          <div className="flex justify-center -my-4 relative z-10">
            <button
              onClick={() => {
                const temp = fromToken;
                setFromToken(toToken);
                setToToken(temp);
              }}
              className="bg-slate-700 hover:bg-slate-600 p-4 rounded-2xl transition"
            >
              <ArrowDown size={28} />
            </button>
          </div>

          {/* To */}
          <div className="mt-6 mb-8">
            <div className="flex justify-between text-sm mb-3">
              <span>You Receive</span>
              <span>Balance: 245.8 {toToken.symbol}</span>
            </div>
            <div className="flex gap-4 bg-slate-900 rounded-2xl p-5">
              <input
                type="number"
                value={toAmount}
                readOnly
                className="bg-transparent text-4xl outline-none flex-1 text-gray-400"
              />
              <TokenSelector token={toToken} onChange={setToToken} tokens={tokens} />
            </div>
          </div>

          {/* Rate & Details */}
          <div className="bg-slate-900/50 rounded-2xl p-5 text-sm space-y-3 mb-8">
            <div className="flex justify-between">
              <span>Rate</span>
              <span>1 {fromToken.symbol} ≈ {(prices[fromToken.symbol] / prices[toToken.symbol]).toFixed(4)} {toToken.symbol}</span>
            </div>
            <div className="flex justify-between">
              <span>Slippage Tolerance</span>
              <div className="flex gap-2">
                {[0.5, 1, 2].map((s) => (
                  <button
                    key={s}
                    onClick={() => setSlippage(s)}
                    className={`px-4 py-1 rounded-xl transition ${slippage === s ? 'bg-blue-600' : 'bg-slate-700 hover:bg-slate-600'}`}
                  >
                    {s}%
                  </button>
                ))}
              </div>
            </div>
            <div className="flex justify-between text-emerald-400">
              <span>Est. Fee (0.3%)</span>
              <span>~${(parseFloat(fromAmount || 0) * prices[fromToken.symbol] * 0.003).toFixed(2)}</span>
            </div>
          </div>

          <button
            onClick={handleSwap}
            disabled={!fromAmount || !account}
            className="w-full py-5 text-xl font-semibold bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 rounded-3xl disabled:opacity-50 transition disabled:cursor-not-allowed"
          >
            {account ? 'Swap Tokens' : 'Connect Wallet to Swap'}
          </button>
        </div>

        {/* Price Chart Placeholder */}
        <div className="mt-8 text-center text-sm text-gray-400">
          Price Chart • Recent Swaps (Coming Soon)
        </div>
      </div>

      {/* Confirmation Modal */}
      {showConfirm && (
        <div className="fixed inset-0 bg-black/80 flex items-center justify-center z-50">
          <div className="bg-slate-900 border border-slate-700 rounded-3xl p-8 max-w-md w-full mx-4">
            <h2 className="text-2xl font-bold mb-6">Confirm Swap</h2>
            <div className="space-y-4">
              <div className="flex justify-between">
                <span>You Pay</span>
                <span>{fromAmount} {fromToken.symbol}</span>
              </div>
              <div className="flex justify-between">
                <span>You Receive</span>
                <span>{toAmount} {toToken.symbol}</span>
              </div>
              <div className="pt-4 border-t border-slate-700 text-sm text-gray-400">
                Slippage: {slippage}% • Fee: 0.3%
              </div>
            </div>

            <div className="flex gap-4 mt-8">
              <button
                onClick={() => setShowConfirm(false)}
                className="flex-1 py-4 border border-slate-600 rounded-2xl hover:bg-slate-800"
              >
                Cancel
              </button>
              <button
                onClick={executeSwap}
                disabled={loading}
                className="flex-1 py-4 bg-green-600 rounded-2xl hover:bg-green-500 font-semibold"
              >
                {loading ? 'Processing...' : 'Confirm & Swap'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Token Selector Component
function TokenSelector({ token, onChange, tokens }) {
  return (
    <select
      value={token.symbol}
      onChange={(e) => {
        const selected = tokens.find(t => t.symbol === e.target.value);
        onChange(selected);
      }}
      className="bg-slate-800 px-6 py-4 rounded-2xl text-lg font-medium outline-none cursor-pointer"
    >
      {tokens.map(t => (
        <option key={t.symbol} value={t.symbol}>
          {t.icon} {t.symbol}
        </option>
      ))}
    </select>
  );
}
