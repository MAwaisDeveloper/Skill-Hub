import React, { useEffect, useState } from 'react';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatementView, DirBadge, Amt, Empty } from '../components/ui';

export default function ProWallet() {
  const { session } = useApp();
  const token = session?.token;
  const [wallet, setWallet] = useState(null);
  const [profile, setProfile] = useState(null);
  const [amount, setAmount] = useState('');
  const [wd, setWd] = useState({ provider: 'jazzcash', account_number: '' });
  const [title, setTitle] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [w, d, wds, pens] = await Promise.all([
        api.get('/professional/wallet', token),
        api.get('/professional/me/dashboard', token),
        api.get('/professional/wallet/withdrawals', token),
        api.get('/professional/wallet/penalties', token),
      ]);
      setWallet(w); setProfile(d.profile); setWithdrawals(wds); setPenalties(pens);
      setWd((prev) => ({ ...prev, account_number: prev.account_number || d.profile?.payout_account || '' }));
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const checkTitle = async () => {
    setError(''); setTitle(null);
    try {
      const res = await api.post('/professional/wallet/payout-title', wd, token);
      setTitle(res);
    } catch (e) { setError(e.message); }
  };

  const withdraw = async () => {
    setError(''); setMsg('');
    try {
      const res = await api.post('/professional/wallet/withdraw', { amount: Number(amount), ...wd }, token);
      setMsg(`Withdrawal requested: Rs ${Number(amount).toLocaleString()} → ${res.to}. Pending list mein show hoga.`);
      setAmount('');
      await load();
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
    return api.get(`/professional/wallet/statement?${q.toString()}`, token);
  };

  return (
    <Layout title="Wallet & Earnings" subtitle="Incoming / Outgoing / Pending — commission, penalties, withdrawals sab clear">
      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-3">
        <div className="card stat"><span className="value">{fmt(wallet?.balance)}</span><span className="label">Available Balance</span></div>
        <div className="card stat"><span className="value">{fmt(profile?.payout_account || '—')}</span><span className="label">Payout Account</span><span className="hint">{profile?.payout_provider || 'set in profile'}</span></div>
        <div className="card stat"><span className="value" style={{ color: Number(wallet?.held_amount) > 0 ? 'inherit' : 'inherit' }}>{fmt(wallet?.held_amount || 0)}</span><span className="label">Held (Escrow)</span><span className="hint">aap ki bookings par hold (info)</span></div>
      </div>

      <div className="card">
        <h2>💸 Wallet se paisay nikalain (Withdraw)</h2>
        <p className="muted mb">Provider + number → account title verify (jis naam par number hai wo show hota hai, warna Not Found) → request → admin transfer.</p>
        <div className="row">
          <select style={{ maxWidth: 150 }} value={wd.provider} onChange={(e) => { setWd({ ...wd, provider: e.target.value }); setTitle(null); }}>
            <option value="jazzcash">JazzCash</option>
            <option value="easypaisa">Easypaisa</option>
          </select>
          <input style={{ maxWidth: 190 }} placeholder="Account number (03...)" value={wd.account_number}
            onChange={(e) => { setWd({ ...wd, account_number: e.target.value }); setTitle(null); }} />
          <button className="btn secondary" onClick={checkTitle} disabled={!wd.account_number}>Verify Name</button>
          <input style={{ maxWidth: 180 }} type="number" placeholder="Amount (min 500)" value={amount} onChange={(e) => setAmount(e.target.value)} />
          <button className="btn" onClick={withdraw} disabled={!amount || (title != null && !title.found)}>Request Withdrawal</button>
        </div>
        {title && (
          title.found
            ? <div className="alert success">✅ Account title: <b>{title.account_title}</b> <span className="muted">({title.source})</span></div>
            : <div className="alert error">❌ <b>Not Found</b> — is number par koi registered account nahi mila. Number check karein.</div>
        )}
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Pending Withdrawals</h2>
          {withdrawals.length === 0 && <Empty>No withdrawals yet.</Empty>}
          {withdrawals.length > 0 && (
            <table>
              <thead><tr><th>Date</th><th>To</th><th>Amount</th><th>Status</th><th>Admin Note</th></tr></thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td>{w.created_at?.slice(0, 16)}</td>
                    <td>{w.account_title}<div className="muted">{w.provider} {w.account_number}</div></td>
                    <td><Amt value={w.amount} dir="out" /></td>
                    <td><DirBadge dir={w.status === 'pending' ? 'pending' : w.status === 'completed' ? 'in' : 'out'} label={w.status} /></td>
                    <td className="muted">{w.admin_note || '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="card">
          <h2>Penalties (owed / settled)</h2>
          <p className="muted mb">Customer-cancel nahi — <b>aap ke apna cancel</b> par 10% penalty record hoti hai jo agli payout se auto-cut hoti hai.</p>
          {penalties.length === 0 && <Empty icon="🛡️">No penalties — clean record!</Empty>}
          {penalties.length > 0 && (
            <table>
              <thead><tr><th>Date</th><th>Booking</th><th>Reason</th><th>Amount</th><th>Status</th></tr></thead>
              <tbody>
                {penalties.map((p) => (
                  <tr key={p.id}>
                    <td>{p.created_at?.slice(0, 16)}</td>
                    <td className="muted">{p.booking_code || '—'}</td>
                    <td className="muted">{p.reason}</td>
                    <td><Amt value={p.amount} dir="out" /></td>
                    <td><DirBadge dir={p.settled ? 'in' : 'pending'} label={p.settled ? 'settled' : 'owed — next payout se cut'} /></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <StatementView
        fetcher={fetchStatement}
        title="Complete Statement — Incoming / Outgoing"
        subtitle="Payout kis customer ki booking se aya, commission kitna kata, penalty kab lagi — sab counterparty naam ke sath."
      />
    </Layout>
  );
}
