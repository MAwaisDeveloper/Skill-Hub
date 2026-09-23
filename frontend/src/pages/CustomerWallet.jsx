import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatementView } from '../components/ui';

export default function CustomerWallet() {
  const { session } = useApp();
  const token = session?.token;
  const navigate = useNavigate();
  const [wallet, setWallet] = useState(null);
  const [topup, setTopup] = useState({ provider: 'jazzcash', mobile_number: '', amount: '' });
  const [title, setTitle] = useState(null);
  const [error, setError] = useState('');
  const [msg, setMsg] = useState('');

  const load = async () => {
    try { setWallet(await api.get('/customer/wallet', token)); } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const checkTitle = async () => {
    setError(''); setTitle(null);
    try {
      const res = await api.post('/customer/wallet/account-title', { provider: topup.provider, mobile_number: topup.mobile_number }, token);
      setTitle(res);
    } catch (e) { setError(e.message); }
  };

  const startTopup = async () => {
    setError(''); setMsg('');
    if (title && !title.found) { setError('No account found on this number (Not Found). Please check the number.'); return; }
    try {
      const res = await api.post('/customer/wallet/topup', { ...topup, amount: Number(topup.amount) }, token);
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

  return (
    <Layout title="Wallet & Statement" subtitle="Incoming, outgoing and pending — every rupee recorded with the counterparty name">
      {error && <div className="alert error">{error}</div>}
      {msg && <div className="alert success">{msg}</div>}

      <div className="grid cols-2">
        <div className="card stat">
          <span className="value">{wallet ? new Intl.NumberFormat('en-PK').format(Number(wallet.balance)) : '…'}</span>
          <span className="label">Available Balance</span>
        </div>
        <div className="card stat">
          <span className="value">{wallet ? new Intl.NumberFormat('en-PK').format(Number(wallet.held_amount)) : '…'}</span>
          <span className="label">Held (Escrow)</span>
          <span className="hint">locked against active bookings</span>
        </div>
      </div>

      <div className="card">
        <h2>⬆️ Add Money (JazzCash / Easypaisa)</h2>
        <p className="muted mb">Verify the account title for your number first — then the secure gateway page asks for your PIN (Hunar never sees your PIN).</p>
        <div className="row">
          <select style={{ maxWidth: 150 }} value={topup.provider} onChange={(e) => { setTopup({ ...topup, provider: e.target.value }); setTitle(null); }}>
            <option value="jazzcash">JazzCash</option>
            <option value="easypaisa">Easypaisa</option>
          </select>
          <input style={{ maxWidth: 190 }} placeholder="Mobile number (03...)" value={topup.mobile_number}
            onChange={(e) => { setTopup({ ...topup, mobile_number: e.target.value }); setTitle(null); }} />
          <button className="btn secondary" onClick={checkTitle} disabled={!topup.mobile_number}>Check Name</button>
          <input style={{ maxWidth: 130 }} type="number" placeholder="Amount" value={topup.amount}
            onChange={(e) => setTopup({ ...topup, amount: e.target.value })} />
          <button className="btn" onClick={startTopup} disabled={!topup.amount}>Add Money</button>
        </div>
        {title && (
          title.found
            ? <div className="alert success">✅ Account holder: <b>{title.account_title}</b> <span className="muted">({title.source})</span></div>
            : <div className="alert error">❌ <b>Not Found</b> — no JazzCash/Easypaisa account is registered on this number. Please check the number.</div>
        )}
        <p className="muted mt" style={{ fontSize: 12.5 }}>
          Withdrawing funds: <b>Wallet → Withdraw</b> (on the professional wallet page) — admin approves the transfer. Booking payments are only released from escrow.
        </p>
      </div>

      <StatementView
        fetcher={fetchStatement}
        title="Transaction History"
        subtitle="Every entry shows the counterparty name, booking code and balance after. Filter by direction, type or date range — latest week loads by default."
      />
    </Layout>
  );
}
