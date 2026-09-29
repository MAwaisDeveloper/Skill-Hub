import React, { useEffect, useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatementView, BalanceAmount, useBalanceHidden } from '../components/ui';

// Customer wallet — real mobile-wallet jaisa case:
// 1) Add Money: provider card select -> number -> "Check Name" (owner ka naam ya Not Found)
// 2) Amount -> secure gateway page (PIN wahan, Hunar kabhi PIN nahi dekhta)
// 3) Withdraw: yahan se wallet → JazzCash/Easypaisa (admin transfer karta hai)
const PROVIDERS = [
  { key: 'jazzcash', name: 'JazzCash', cls: 'prov-jazzcash', tag: 'Instant · MobiCash network' },
  { key: 'easypaisa', name: 'Easypaisa', cls: 'prov-easypaisa', tag: 'Instant · Telenor Microfinance' },
];

export default function CustomerWallet() {
  const { session } = useApp();
  const token = session?.token;
  const navigate = useNavigate();
  const [wallet, setWallet] = useState(null);
  const [trust, setTrust] = useState(null);
  const [topup, setTopup] = useState({ provider: 'jazzcash', mobile_number: '', amount: '' });
  const [title, setTitle] = useState(null);
  const [checking, setChecking] = useState(false);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');
  const [balanceHidden, toggleBalance] = useBalanceHidden();

  const load = async () => {
    try {
      setWallet(await api.get('/customer/wallet', token));
      api.get('/customer/trust-score', token).then(setTrust).catch(() => {});
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const checkTitle = async () => {
    setError(''); setTitle(null);
    if (!/^03\d{9}$/.test(topup.mobile_number.trim())) { setError('Please enter a valid mobile number (03XXXXXXXXX).'); return; }
    setChecking(true);
    try {
      const res = await api.post('/customer/wallet/account-title', { provider: topup.provider, mobile_number: topup.mobile_number.trim() }, token);
      setTitle(res);
    } catch (e) { setError(e.message); }
    setChecking(false);
  };

  const startTopup = async () => {
    setError(''); setMsg('');
    if (!(Number(topup.amount) >= 100)) { setError('Minimum top-up amount is Rs 100.'); return; }
    if (title && !title.found) { setError('No account is registered on this number (Not Found). Please check the number.'); return; }
    try {
      const res = await api.post('/customer/wallet/topup', { ...topup, amount: Number(topup.amount), mobile_number: topup.mobile_number.trim() }, token);
      navigate(res.redirect_url);
    } catch (e) { setError(e.message); }
  };

  const fetchStatement = (filters) => {
    const q = new URLSearchParams();
    if (filters.direction) q.set('direction', filters.direction);
    if (filters.type) q.set('type', filters.type);
    if (filters.from) q.set('from', filters.from);
    if (filters.to) q.set('to', filters.to);
    q.set('page', filters.page);
    q.set('per_page', 15);
    return api.get(`/customer/wallet/statement?${q.toString()}`, token);
  };

  const score = Number(trust?.score ?? 100);

  return (
    <Layout title="My Wallet" subtitle="Balance, escrow and transactions — everything in one place, just like a mobile wallet">
      {error && <div className="alert error">{error}</div>}
      {msg && <div className="alert success">{msg}</div>}

      {/* Wallet hero card */}
      <div className="wallet-hero">
        <div>
          <div className="wh-label">Available Balance</div>
          <div className="wh-amount">
            <BalanceAmount amount={wallet ? fmt(wallet.balance) : '…'} hidden={balanceHidden} onToggle={toggleBalance} />
          </div>
          <div className="wh-sub">🔒 Held (escrow): <b>{wallet ? (balanceHidden ? 'Rs ••••••' : fmt(wallet.held_amount)) : '…'}</b> — locked for active bookings</div>
        </div>
        <div className="wh-side">
          <div className="wh-trust">
            <span className="value" style={{ color: score >= 80 ? '#b9f6ca' : score >= 50 ? '#ffe082' : '#ffab91' }}>{score}</span>
            <span className="lbl">Trust Score / 100</span>
          </div>
        </div>
      </div>

      {/* Quick actions */}
      <div className="grid cols-3">
        <a className="card stat" href="/customer/wallet" style={{ textDecoration: 'none' }}>
          <span className="value" style={{ fontSize: 20 }}>⬆️ Add Money</span>
          <span className="label">via JazzCash / Easypaisa</span>
        </a>
        <Link className="card stat" to="/customer/withdraw" style={{ textDecoration: 'none' }}>
          <span className="value" style={{ fontSize: 20 }}>💸 Withdraw</span>
          <span className="label">To your mobile account</span>
        </Link>
        <Link className="card stat" to="/customer/wallet/statement" style={{ textDecoration: 'none' }}>
          <span className="value" style={{ fontSize: 20 }}>🧾 Statement</span>
          <span className="label">Every entry with names</span>
        </Link>
      </div>

      {/* Add Money card */}
      <div className="card">
        <h2>⬆️ Add Money (JazzCash / Easypaisa)</h2>
        <p className="muted mb">Just like a real gateway: first <b>verify the account title</b> registered on the number, then enter the amount: the secure gateway page will ask for your PIN (Hunar never sees it).</p>

        <label>1. Choose your payment provider</label>
        <div className="provider-cards">
          {PROVIDERS.map((p) => (
            <button key={p.key} type="button" className={`provider-card ${p.cls} ${topup.provider === p.key ? 'active' : ''}`} onClick={() => { setTopup({ ...topup, provider: p.key }); setTitle(null); }}>
              <b>{p.name}</b>
              <span>{p.tag}</span>
            </button>
          ))}
        </div>

        <div className="grid cols-2" style={{ gap: 14, marginTop: 8 }}>
          <div>
            <label>2. Your {topup.provider === 'jazzcash' ? 'JazzCash' : 'Easypaisa'} number</label>
            <div className="row">
              <input style={{ maxWidth: 200 }} placeholder="03XXXXXXXXX" maxLength={11} value={topup.mobile_number}
                onChange={(e) => { setTopup({ ...topup, mobile_number: e.target.value }); setTitle(null); }} />
              <button className="btn secondary" onClick={checkTitle} disabled={checking || !topup.mobile_number}>{checking ? '⏳' : 'Check Name'}</button>
            </div>
            {title && (
              title.found
                ? <div className="alert success mt">✅ Account holder: <b>{title.account_title}</b> <span className="muted">({title.source})</span></div>
                : <div className="alert error mt">❌ <b>Not Found</b> — no {topup.provider === 'jazzcash' ? 'JazzCash' : 'Easypaisa'} account is registered on this number. Please double-check.</div>
            )}
          </div>
          <div>
            <label>3. Amount (Rs): minimum 100</label>
            <input type="number" placeholder="e.g. 5000" min={100} value={topup.amount} onChange={(e) => setTopup({ ...topup, amount: e.target.value })} />
            <div className="row" style={{ marginTop: 4 }}>
              {[1000, 2000, 5000, 10000].map((v) => (
                <button key={v} className="btn small secondary" onClick={() => setTopup({ ...topup, amount: String(v) })}>+{v.toLocaleString()}</button>
              ))}
            </div>
          </div>
        </div>
        <button className="btn mt" onClick={startTopup} disabled={!topup.amount || (title != null && !title.found)}>🔒 Continue to Secure Checkout</button>
      </div>

      <StatementView
        fetcher={fetchStatement}
        title="Transaction History"
        subtitle="Every entry shows the counterparty name, booking code and resulting balance. Filter by direction, type or date — defaults to the latest week."
      />
    </Layout>
  );
}
