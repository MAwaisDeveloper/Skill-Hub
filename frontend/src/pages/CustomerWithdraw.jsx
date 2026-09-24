import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { DirBadge, Amt, Empty, InvoiceModal } from '../components/ui';

// Customer Withdraw: wallet → JazzCash/Easypaisa (admin transfer karta hai).
// Same real flow as professional: name check -> request -> pending -> completed/rejected.
export default function CustomerWithdraw() {
  const { session } = useApp();
  const token = session?.token;
  const [wallet, setWallet] = useState(null);
  const [amount, setAmount] = useState('');
  const [wd, setWd] = useState({ provider: 'jazzcash', account_number: '' });
  const [title, setTitle] = useState(null);
  const [checking, setChecking] = useState(false);
  const [withdrawals, setWithdrawals] = useState([]);
  const [invoice, setInvoice] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try {
      const [w, wds] = await Promise.all([
        api.get('/customer/wallet', token),
        api.get('/customer/wallet/withdrawals', token),
      ]);
      setWallet(w); setWithdrawals(wds);
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const checkTitle = async () => {
    setError(''); setTitle(null);
    if (!/^03\d{9}$/.test(wd.account_number.trim())) { setError('Sahi number likhein (03XXXXXXXXX)'); return; }
    setChecking(true);
    try {
      const res = await api.post('/customer/wallet/account-title', { provider: wd.provider, mobile_number: wd.account_number.trim() }, token);
      setTitle(res);
    } catch (e) { setError(e.message); }
    setChecking(false);
  };

  const withdraw = async () => {
    setError(''); setMsg('');
    if (!(Number(amount) >= 500)) { setError('Minimum withdrawal Rs 500 hai'); return; }
    if (title && !title.found) { setError('Is number par account nahi mila (Not Found)'); return; }
    try {
      const res = await api.post('/customer/wallet/withdraw', { amount: Number(amount), provider: wd.provider, account_number: wd.account_number.trim() }, token);
      setMsg(`Withdrawal request ho gayi: Rs ${Number(amount).toLocaleString()} → ${res.to}. Admin transfer ke baad "completed" ho jayega.`);
      setAmount(''); setTitle(null);
      await load();
    } catch (e) { setError(e.message); }
  };

  return (
    <Layout title="Withdraw to JazzCash / Easypaisa" subtitle="Wallet se apne mobile account par paise transfer karwayen — admin confirm karega">
      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-3">
        <div className="card stat"><span className="value">{fmt(wallet?.balance)}</span><span className="label">Available to Withdraw</span></div>
        <div className="card stat"><span className="value">{fmt(wallet?.held_amount)}</span><span className="label">Held (Escrow)</span><span className="hint">withdraw nahi ho sakta</span></div>
        <div className="card stat"><span className="value" style={{ fontSize: 18, paddingTop: 6 }}>Minimum Rs 500</span><span className="label">Per withdrawal</span></div>
      </div>

      <div className="card">
        <h2>💸 Withdraw Request</h2>
        <p className="muted mb">Provider + number → <b>naam verify</b> (registered account holder dikhega, ya Not Found) → amount → request. Paisa foran wallet se kat jayega aur admin transfer karne par complete hoga.</p>

        <div className="provider-cards">
          {[{ key: 'jazzcash', name: 'JazzCash', cls: 'prov-jazzcash', tag: 'Instant transfer' }, { key: 'easypaisa', name: 'Easypaisa', cls: 'prov-easypaisa', tag: 'Instant transfer' }].map((p) => (
            <button key={p.key} type="button" className={`provider-card ${p.cls} ${wd.provider === p.key ? 'active' : ''}`} onClick={() => { setWd({ ...wd, provider: p.key }); setTitle(null); }}>
              <b>{p.name}</b>
              <span>{p.tag}</span>
            </button>
          ))}
        </div>

        <div className="grid cols-2" style={{ gap: 14, marginTop: 8 }}>
          <div>
            <label>Account Number (jis par paise chahiye)</label>
            <div className="row">
              <input style={{ maxWidth: 200 }} placeholder="03XXXXXXXXX" maxLength={11} value={wd.account_number}
                onChange={(e) => { setWd({ ...wd, account_number: e.target.value }); setTitle(null); }} />
              <button className="btn secondary" onClick={checkTitle} disabled={checking || !wd.account_number}>{checking ? '⏳' : 'Verify Name'}</button>
            </div>
            {title && (
              title.found
                ? <div className="alert success mt">✅ Account title: <b>{title.account_title}</b> <span className="muted">({title.source})</span></div>
                : <div className="alert error mt">❌ <b>Not Found</b> — is number par registered account nahi mila. Number check karein.</div>
            )}
          </div>
          <div>
            <label>Amount (Rs)</label>
            <input type="number" placeholder="min 500" min={500} value={amount} onChange={(e) => setAmount(e.target.value)} />
            {wallet && Number(wallet.balance) > 0 && (
              <button className="btn small secondary" onClick={() => setAmount(String(Math.floor(Number(wallet.balance))))}>Poora balance ({fmt(Math.floor(Number(wallet.balance)))})</button>
            )}
          </div>
        </div>
        <button className="btn mt" onClick={withdraw} disabled={!amount || (title != null && !title.found)}>Request Withdrawal</button>
      </div>

      <div className="card">
        <h2>Withdrawal History</h2>
        {withdrawals.length === 0 && <Empty icon="💸">Abhi koi withdrawal nahi.</Empty>}
        {withdrawals.length > 0 && (
          <table>
            <thead><tr><th>Date</th><th>To</th><th>Amount</th><th>Status</th><th>Admin Note</th><th></th></tr></thead>
            <tbody>
              {withdrawals.map((w) => (
                <tr key={w.id}>
                  <td>{w.created_at?.slice(0, 16)}</td>
                  <td><b>{w.account_title}</b><div className="muted">{w.provider} {w.account_number}</div></td>
                  <td><Amt value={w.amount} dir="out" /></td>
                  <td><DirBadge dir={w.status === 'pending' ? 'pending' : w.status === 'completed' ? 'in' : 'out'} label={w.status} /></td>
                  <td className="muted">{w.admin_note || '—'}</td>
                  <td><button className="btn small secondary" title="Invoice" onClick={() => setInvoice({ kind: 'withdrawal', id: w.id })}>🧾</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {invoice && <InvoiceModal kind={invoice.kind} id={invoice.id} onClose={() => setInvoice(null)} />}
      <p className="muted">Note: Booking payments sirf escrow se release hoti hain — yahan sirf apna available balance withdraw hota hai.</p>
    </Layout>
  );
}
