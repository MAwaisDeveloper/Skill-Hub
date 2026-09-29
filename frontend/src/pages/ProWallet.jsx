import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatementView, DirBadge, Amt, Empty, InvoiceModal, BalanceAmount, useBalanceHidden } from '../components/ui';

export default function ProWallet() {
  const { session } = useApp();
  const navigate = useNavigate();
  const token = session?.token;
  const [wallet, setWallet] = useState(null);
  const [profile, setProfile] = useState(null);
  const [amount, setAmount] = useState('');
  const [wd, setWd] = useState({ provider: 'jazzcash', account_number: '' });
  const [title, setTitle] = useState(null);
  const [withdrawals, setWithdrawals] = useState([]);
  const [penalties, setPenalties] = useState([]);
  const [invoice, setInvoice] = useState(null); // { kind, id }
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [balanceHidden, toggleBalance] = useBalanceHidden();
  const [topupForm, setTopupForm] = useState({ provider: 'jazzcash', mobile_number: '', amount: '' });

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

  const startTopup = async () => {
    setError(''); setMsg('');
    try {
      const res = await api.post('/professional/wallet/topup', { provider: topupForm.provider, mobile_number: topupForm.mobile_number.trim(), amount: Number(topupForm.amount) }, token);
      navigate(`/wallet/topup/${res.reference}/pay`);
    } catch (e) { setError(e.message); }
  };

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
      setMsg(`Withdrawal requested: Rs ${Number(amount).toLocaleString()} → ${res.to}. It will appear in the pending list.`);
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
    <Layout title="Wallet & Earnings" subtitle="Incoming / outgoing / pending — commission, penalties and withdrawals, all in the clear">
      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-3">
        <div className="card stat"><span className="value"><BalanceAmount amount={fmt(wallet?.balance)} hidden={balanceHidden} onToggle={toggleBalance} /></span><span className="label">Available Balance</span></div>
        <div className="card stat"><span className="value">{fmt(profile?.payout_account || '—')}</span><span className="label">Payout Account</span><span className="hint">{profile?.payout_provider === 'jazzcash' ? 'JazzCash' : 'Easypaisa'} · change it from your profile page</span></div>
        <div className="card stat"><span className="value">{fmt(wallet?.held_amount || 0)}</span><span className="label">Held (Escrow)</span><span className="hint">against active bookings (info)</span></div>
      </div>

      <div className="card">
        <h2>➕ Add Money to Wallet (JazzCash / Easypaisa)</h2>
        <p className="muted mb">Mobile account par OTP aayega (jaisa JazzCash/Easypaisa app bhejta hai) — OTP enter karo, paise mobile account se cut ho kar wallet mein aa jayenge.</p>
        <div className="grid cols-3" style={{ gap: 12, alignItems: 'end' }}>
          <div>
            <label>Provider</label>
            <select value={topupForm.provider} onChange={(e) => setTopupForm({ ...topupForm, provider: e.target.value })}>
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">Easypaisa</option>
            </select>
          </div>
          <div>
            <label>Mobile Account Number (03...)</label>
            <input placeholder="03XXXXXXXXX" maxLength={11} value={topupForm.mobile_number} onChange={(e) => setTopupForm({ ...topupForm, mobile_number: e.target.value })} />
          </div>
          <div>
            <label>Amount (min 100)</label>
            <input type="number" placeholder="e.g. 2000" min={100} value={topupForm.amount} onChange={(e) => setTopupForm({ ...topupForm, amount: e.target.value })} />
          </div>
        </div>
        <button className="btn mt" onClick={startTopup} disabled={!topupForm.mobile_number || !topupForm.amount || Number(topupForm.amount) < 100}>Send OTP & Add Money</button>
      </div>

      <div className="card">
        <h2>💸 Withdraw from Wallet</h2>
        <p className="muted mb">Choose provider + number → <b>verify the account title</b> (shows the registered holder, or Not Found) → enter amount → request → the platform transfers the funds.</p>
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
            <label>Account Number (03...)</label>
            <div className="row">
              <input style={{ maxWidth: 200 }} placeholder="03XXXXXXXXX" maxLength={11} value={wd.account_number}
                onChange={(e) => { setWd({ ...wd, account_number: e.target.value }); setTitle(null); }} />
              <button className="btn secondary" onClick={checkTitle} disabled={!wd.account_number}>Verify Name</button>
            </div>
            {title && (
              title.found
                ? <div className="alert success mt">✅ Account title: <b>{title.account_title}</b> <span className="muted">({title.source})</span></div>
                : <div className="alert error mt">❌ <b>Not Found</b> — no account registered on this number. Please double-check.</div>
            )}
          </div>
          <div>
            <label>Amount (min 500)</label>
            <input type="number" placeholder="min 500" min={500} value={amount} onChange={(e) => setAmount(e.target.value)} />
            {wallet && Number(wallet.balance) >= 500 && (
              <button className="btn small secondary" onClick={() => setAmount(String(Math.floor(Number(wallet.balance))))}>Full balance ({fmt(Math.floor(Number(wallet.balance)))})</button>
            )}
          </div>
        </div>
        <button className="btn mt" onClick={withdraw} disabled={!amount || (title != null && !title.found)}>Request Withdrawal</button>
      </div>

      <div className="row">
        <a className="btn secondary small" href="/professional/wallet/statement">🧾 Full Transaction History</a>
        <a className="btn secondary small" href="/professional/wallet/payouts">💰 Payouts detail</a>
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>Withdrawal History</h2>
          {withdrawals.length === 0 && <Empty>No withdrawals yet.</Empty>}
          {withdrawals.length > 0 && (
            <table>
              <thead><tr><th>Date</th><th>To</th><th>Amount</th><th>Status</th><th>Admin Note</th><th></th></tr></thead>
              <tbody>
                {withdrawals.map((w) => (
                  <tr key={w.id}>
                    <td>{w.created_at?.slice(0, 16)}</td>
                    <td>{w.account_title}<div className="muted">{w.provider} {w.account_number}</div></td>
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

        <div className="card">
          <h2>Penalties (owed / settled)</h2>
          <p className="muted mb">Not customer cancellations: a penalty is recorded when <b>you cancel</b> an accepted job (10%). It is auto-deducted from your next payout.</p>
          {penalties.length === 0 && <Empty icon="🛡️">No penalties: clean record!</Empty>}
          {penalties.length > 0 && (
            <table>
              <thead><tr><th>Date</th><th>Booking</th><th>Reason</th><th>Amount</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {penalties.map((p) => (
                  <tr key={p.id}>
                    <td>{p.created_at?.slice(0, 16)}</td>
                    <td className="muted">{p.booking_code || '—'}</td>
                    <td className="muted">{p.reason}</td>
                    <td><Amt value={p.amount} dir="out" /></td>
                    <td><DirBadge dir={p.settled ? 'in' : 'pending'} label={p.settled ? 'settled' : 'owed — cut from next payout'} /></td>
                    <td><button className="btn small secondary" title="Invoice" onClick={() => setInvoice({ kind: 'penalty', id: p.id })}>🧾</button></td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      <StatementView
        fetcher={fetchStatement}
        title="Earnings History"
        subtitle="Which customer's booking each payout came from, commission deducted, penalties charged — every entry with the counterparty name. Latest week loads by default."
      />

      {invoice && <InvoiceModal kind={invoice.kind} id={invoice.id} onClose={() => setInvoice(null)} />}
    </Layout>
  );
}
