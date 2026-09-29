import React, { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatusBadge, DirBadge, Amt, Pagination, Empty, BalanceAmount, useBalanceHidden, InvoiceModal } from '../components/ui';

// Generic paged + filtered table used by all admin data tabs.
// endpoint must return { rows, pagination }.
function PagedTable({ endpoint, filters = {}, columns, rowKey = (r) => r.id, emptyText = 'No records.', refreshKey = 0, toolbar = null }) {
  const { session } = useApp();
  const token = session?.token;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  useEffect(() => {
    let live = true;
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v !== '' && v != null && v !== undefined) q.set(k, v); });
    if (!q.get('per_page')) q.set('per_page', 15);
    api.get(`${endpoint}?${q.toString()}`, token)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [endpoint, JSON.stringify(filters), refreshKey]);

  return (
    <div className="card">
      {toolbar}
      {error && <div className="alert error">{error}</div>}
      {!data && <p className="muted">Loading…</p>}
      {data && data.rows.length === 0 && <Empty>{emptyText}</Empty>}
      {data && data.rows.length > 0 && (
        <>
          <table>
            <thead>
              <tr>{columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={rowKey(row)}>
                  {columns.map((c) => <td key={c.key}>{c.render ? c.render(row) : row[c.key] ?? '—'}</td>)}
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination pagination={data.pagination} onPage={(p) => setFilters({ ...filters, page: p })} />
        </>
      )}
    </div>
  );
}

// Expandable gateway receipt: ek transaction ki REAL JazzCash/Easypaisa detail
// (icon/click par khulta hai) — provider account balance, holder, OTP, TID.
function PaReceipt({ row, onClose }) {
  const { session } = useApp();
  const token = session?.token;
  const [wallets, setWallets] = useState(null);
  useEffect(() => {
    api.get('/admin/gateway/wallets', token).then((d) => setWallets(d.rows || [])).catch(() => setWallets([]));
  }, []);
  const pw = (wallets || []).find((w) => w.provider === row.provider && w.account_number === row.account_number);
  const isJazz = row.provider === 'jazzcash';
  return (
    <div className={`card gateway ${isJazz ? 'gw-jazzcash' : 'gw-easypaisa'}`} style={{ maxWidth: 460, margin: '10px auto' }}>
      <div className={`gw-head ${isJazz ? 'gw-head-jazz' : 'gw-head-easy'}`}>
        <div className="gw-logo">{isJazz ? 'JazzCash' : 'easypaisa'}</div>
        <div className="gw-lock">🔒 Gateway Record</div>
      </div>
      <button className="btn small secondary" style={{ float: 'right', marginTop: -44 }} onClick={onClose}>✕</button>
      <div className="gw-amount" style={{ fontSize: 26 }}><Amt value={row.amount} dir={row.kind === 'topup' ? 'in' : 'out'} /></div>
      <div className="kv">
        <span className="k">Type</span><span>{row.kind === 'topup' ? 'Wallet Top-up' : row.kind === 'withdrawal' ? 'Wallet Withdrawal' : 'Admin Gateway Cut'}</span>
        <span className="k">From / To</span><span>{isJazz ? 'JazzCash' : 'Easypaisa'} · {row.account_number}</span>
        <span className="k">Account Holder</span><span><b>{row.account_title || pw?.account_title || 'Not set'}</b></span>
        <span className="k">Holder Source</span><span>{row.title_source || '—'}</span>
        <span className="k">OTP (entered by user)</span><span className="badge status">{row.pin_code || '—'}</span>
        <span className="k">Gateway Reference</span><span>{row.reference || '—'}</span>
        <span className="k">Status</span><span><DirBadge dir={row.status === 'completed' || row.status === 'success' ? 'in' : row.status === 'pending' ? 'pending' : 'out'} label={row.status} /></span>
      </div>
      <div className="kv" style={{ marginTop: 10, borderTop: '1px dashed var(--border)', paddingTop: 10 }}>
        <span className="k"> REAL {isJazz ? 'JazzCash' : 'Easypaisa'} balance</span>
        <span>{pw ? <b style={{ color: 'var(--green-dark)' }}>{fmt(pw.balance)}</b> : <span className="muted">loading…</span>}</span>
        <span className="k">Hunar wallet (user)</span>
        <span className="muted">{fmt(row.user_balance)}</span>
        <span className="k">When</span><span>{String(row.created_at).slice(0, 19)}</span>
      </div>
      <p className="muted mt" style={{ fontSize: 12 }}>Real mobile-account balance provider_wallets se aata hai (simulated bank side) — Hunar wallet balance nahi.</p>
    </div>
  );
}

// Admin Gateway Console: real mobile account se OTP ke zariye paise cut karna
function GatewayConsole() {
  const { session } = useApp();
  const token = session?.token;
  const [wallets, setWallets] = useState(null);
  const [form, setForm] = useState({ provider: 'jazzcash', account_number: '', amount: '' });
  const [step, setStep] = useState('form'); // form | otp | done
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState(null);
  const [result, setResult] = useState(null);
  const [credit, setCredit] = useState({ provider: 'jazzcash', account_number: '', amount: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const load = () => api.get('/admin/gateway/wallets', token).then((d) => setWallets({ rows: d.rows || [], summary: d.summary })).catch((e) => setError(e.message));
  useEffect(() => { load(); }, []);

  const initiate = async () => {
    setError(''); setMsg('');
    try {
      const res = await api.post('/admin/gateway/cut/initiate', { provider: form.provider, account_number: form.account_number.trim(), amount: Number(form.amount) }, token);
      setDevOtp(res.dev_otp || null);
      setStep('otp');
      setMsg(res.message);
      load();
    } catch (e) { setError(e.message); }
  };

  const confirm = async () => {
    setError(''); setMsg('');
    try {
      const res = await api.post('/admin/gateway/cut/confirm', { provider: form.provider, account_number: form.account_number.trim(), amount: Number(form.amount), otp }, token);
      setResult(res);
      setStep('done');
      setMsg(`✅ Cut complete: ${fmt(res.amount)} from ${res.provider} ${res.account_number}. New balance: ${fmt(res.balance_after)}`);
      load();
    } catch (e) { setError(e.message); }
  };

  const doCredit = async () => {
    setError(''); setMsg('');
    try {
      const res = await api.post('/admin/gateway/credit', { provider: credit.provider, account_number: credit.account_number.trim(), amount: Number(credit.amount) }, token);
      setMsg(`✅ Mobile account credited: new balance ${fmt(res.balance)}`);
      setCredit({ provider: 'jazzcash', account_number: '', amount: '' });
      load();
    } catch (e) { setError(e.message); }
  };

  return (
    <div className="card" style={{ marginBottom: 14 }}>
      <h2>🏦 Gateway Console — Real Mobile Accounts (OTP-authorized cuts)</h2>
      <p className="muted mb">Real JazzCash/Easypaisa mobile-account balances (provider_wallets). Admin cut bhi user topup jaisa hi hai: OTP mobile account par jata hai, OTP enter karne par paise cut hote hain. Ye Hunar wallet se alag cheez hai.</p>
      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-4" style={{ marginBottom: 12 }}>
        {(wallets?.rows || []).slice(0, 3).map((w) => (
          <div className="card stat" key={w.id}><span className="value" style={{ fontSize: 20 }}>{fmt(w.balance)}</span><span className="label">{w.provider === 'jazzcash' ? 'JazzCash' : 'Easypaisa'} · {w.account_number}</span><span className="hint">{w.account_title || 'holder not set'} · {w.linked_users} user(s)</span></div>
        ))}
        <div className="card stat"><span className="value" style={{ fontSize: 20 }}>{wallets ? fmt(Number(wallets.summary?.jazzcash_total || 0) + Number(wallets.summary?.easypaisa_total || 0)) : '…'}</span><span className="label">All Mobile Accounts</span><span className="hint">{wallets ? `${wallets.summary?.accounts} accounts` : ''}</span></div>
      </div>

      <div className="grid cols-2" style={{ gap: 16 }}>
        <div>
          <h3 style={{ fontSize: 15 }}>✂️ Cut money (same OTP flow)</h3>
          {step !== 'done' ? (
            <>
              <div className="grid cols-2" style={{ gap: 10 }}>
                <div>
                  <label>Provider</label>
                  <select value={form.provider} onChange={(e) => { setForm({ ...form, provider: e.target.value }); setStep('form'); }}>
                    <option value="jazzcash">JazzCash</option>
                    <option value="easypaisa">Easypaisa</option>
                  </select>
                </div>
                <div>
                  <label>Amount</label>
                  <input type="number" min={1} placeholder="e.g. 1000" value={form.amount} onChange={(e) => setForm({ ...form, amount: e.target.value })} />
                </div>
              </div>
              <label>Mobile Account Number (03...)</label>
              <div className="row">
                <input placeholder="03XXXXXXXXX" maxLength={11} value={form.account_number} onChange={(e) => { setForm({ ...form, account_number: e.target.value }); setStep('form'); }} />
                {step === 'form'
                  ? <button className="btn" onClick={initiate} disabled={!form.account_number || !form.amount}>📱 Send OTP</button>
                  : null}
              </div>
              {step === 'otp' && (
                <div className="mt">
                  {devOtp && <div className="alert warn">Dev OTP: <b>{devOtp}</b> (sent to {form.account_number})</div>}
                  <div className="row">
                    <input className="otp-input" style={{ maxWidth: 160 }} placeholder="OTP" maxLength={6} value={otp} onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))} />
                    <button className="btn" onClick={confirm} disabled={otp.length < 4}>✂️ Verify & Cut</button>
                    <button className="btn secondary" onClick={() => { setStep('form'); setOtp(''); }}>Cancel</button>
                  </div>
                </div>
              )}
            </>
          ) : (
            <div className="kv">
              <span className="k">Reference</span><span>{result?.reference}</span>
              <span className="k">Cut</span><span><b>{fmt(result?.amount)}</b></span>
              <span className="k">Account</span><span>{result?.provider} {result?.account_number} ({result?.account_title || '—'})</span>
              <span className="k">Balance After</span><span><b style={{ color: 'var(--green-dark)' }}>{fmt(result?.balance_after)}</b></span>
              <button className="btn secondary small mt" onClick={() => { setStep('form'); setResult(null); setForm({ provider: 'jazzcash', account_number: '', amount: '' }); }}>New cut</button>
            </div>
          )}
        </div>

        <div style={{ borderLeft: '1px dashed var(--border)', paddingLeft: 16 }}>
          <h3 style={{ fontSize: 15 }}>➕ Credit mobile account (simulate app top-up)</h3>
          <p className="muted" style={{ fontSize: 12 }}>User ke mobile account mein balance dalo (dev testing ke liye) — phir user OTP topup kar sakega.</p>
          <div className="grid cols-2" style={{ gap: 10 }}>
            <div>
              <label>Provider</label>
              <select value={credit.provider} onChange={(e) => setCredit({ ...credit, provider: e.target.value })}>
                <option value="jazzcash">JazzCash</option>
                <option value="easypaisa">Easypaisa</option>
              </select>
            </div>
            <div>
              <label>Amount</label>
              <input type="number" min={1} placeholder="e.g. 5000" value={credit.amount} onChange={(e) => setCredit({ ...credit, amount: e.target.value })} />
            </div>
          </div>
          <label>Mobile Number (03...)</label>
          <div className="row">
            <input placeholder="03XXXXXXXXX" maxLength={11} value={credit.account_number} onChange={(e) => setCredit({ ...credit, account_number: e.target.value })} />
            <button className="btn secondary" onClick={doCredit} disabled={!credit.account_number || !credit.amount}>Credit</button>
          </div>
        </div>
      </div>
    </div>
  );
}

// Provider Accounts tab (CONFIDENTIAL — admin only). Real JazzCash/Easypaisa
// account details (provider_wallets balances via receipt), OTP, holder, references.
function PaTab({ filters, setFilters, balanceHidden }) {
  const { session } = useApp();
  const token = session?.token;
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [openRow, setOpenRow] = useState(null); // row id -> receipt open
  useEffect(() => {
    let live = true;
    const q = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => { if (v !== '' && v != null && v !== undefined) q.set(k, v); });
    if (!q.get('per_page')) q.set('per_page', 15);
    api.get(`/admin/provider-accounts?${q.toString()}`, token)
      .then((d) => { if (live) setData(d); })
      .catch((e) => { if (live) setError(e.message); });
    return () => { live = false; };
  }, [JSON.stringify(filters)]);

  const s = data?.summary;
  return (
    <>
      <div className="alert info" style={{ marginBottom: 12 }}>
        🔒 Confidential: real mobile-account numbers, holders, OTPs and gateway references.
        Visible to administrators only — customers and professionals never see this.
      </div>
      <GatewayConsole />
      <div className="grid cols-4" style={{ marginBottom: 12 }}>
        <div className="card stat"><span className="value td-amt-in">{s ? `+ ${fmt(s.total_topups)}` : '…'}</span><span className="label">Total Top-ups (all users)</span><span className="hint">money received via JazzCash/Easypaisa</span></div>
        <div className="card stat"><span className="value td-amt-out">{s ? `− ${fmt(s.total_withdrawals)}` : '…'}</span><span className="label">Total Withdrawals (all users)</span><span className="hint">paid out to provider accounts</span></div>
        <div className="card stat"><span className="value">{s ? s.total_records : '…'}</span><span className="label">Account Records</span><span className="hint">every top-up / withdrawal / admin cut</span></div>
        <div className="card stat"><span className="value">{s ? (s.total_accounts ?? '—') : '…'}</span><span className="label">Distinct Accounts Used</span><span className="hint">unique provider numbers across all users</span></div>
      </div>
      <div className="card">
        <h2>Provider Account Records (click 🧾 icon for real gateway detail)</h2>
        <div className="filters">
          <select value={filters.kind} onChange={(e) => setFilters({ ...filters, kind: e.target.value })}>
            <option value="">All Types</option>
            <option value="topup">Top-up</option>
            <option value="withdrawal">Withdrawal</option>
            <option value="admin_cut">Admin Cut</option>
          </select>
          <select value={filters.provider} onChange={(e) => setFilters({ ...filters, provider: e.target.value })}>
            <option value="">All Providers</option>
            <option value="jazzcash">JazzCash</option>
            <option value="easypaisa">Easypaisa</option>
          </select>
          <input placeholder="Search number / holder / user / phone" value={filters.q} onChange={(e) => setFilters({ ...filters, q: e.target.value })} />
        </div>
      </div>
      {error && <div className="alert error">{error}</div>}
      {!data && <div className="card"><p className="muted">Loading…</p></div>}
      {data && data.rows.length === 0 && <div className="card"><Empty>No provider account records yet. Records appear when users top up or withdraw.</Empty></div>}
      {data && data.rows.length > 0 && (
        <div className="card">
          <table>
            <thead>
              <tr><th></th><th>Date</th><th>User</th><th>Type</th><th>Provider</th><th>Account Number</th><th>Account Holder</th><th>Amount</th><th>OTP</th><th>Status</th></tr>
            </thead>
            <tbody>
              {data.rows.map((r) => (
                <React.Fragment key={r.id}>
                  <tr>
                    <td><button className="btn small secondary" title="Real gateway detail" onClick={() => setOpenRow(openRow === r.id ? null : r.id)}>🧾</button></td>
                    <td>{String(r.created_at).slice(0, 16)}</td>
                    <td><b>{r.user_name || '—'}</b><div className="muted">{r.phone}</div></td>
                    <td><DirBadge dir={r.kind === 'topup' ? 'in' : 'out'} label={r.kind} /></td>
                    <td><span className="badge status">{r.provider === 'jazzcash' ? 'JazzCash' : 'Easypaisa'}</span></td>
                    <td><b>{r.account_number}</b></td>
                    <td>{r.account_title || '—'}{r.title_source && <div className="muted" style={{ fontSize: 12 }}>{r.title_source}</div>}</td>
                    <td><Amt value={r.amount} dir={r.kind === 'topup' ? 'in' : 'out'} /></td>
                    <td>{r.pin_code ? <span className="badge status">{r.pin_code}</span> : '—'}</td>
                    <td><DirBadge dir={r.status === 'completed' || r.status === 'success' ? 'in' : r.status === 'pending' ? 'pending' : 'out'} label={r.status} /></td>
                  </tr>
                  {openRow === r.id && (
                    <tr>
                      <td colSpan={10} style={{ background: 'var(--bg, #fafafa)' }}>
                        <PaReceipt row={r} onClose={() => setOpenRow(null)} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
              ))}
            </tbody>
          </table>
          <Pagination pagination={data.pagination} onPage={(p) => setFilters({ ...filters, page: p })} />
        </div>
      )}
    </>
  );
}

// Tabs are URL-driven (/admin?tab=transactions): every sidebar section opens directly,
// the active section is bookmarkable, and browser back/forward works naturally.
const VALID_TABS = ['overview', 'verifications', 'bookings', 'disputes', 'wallets', 'transactions', 'topups', 'provider_accounts', 'penalties', 'refunds', 'messages', 'payouts', 'users', 'reports', 'settings'];
const TAB_TITLES = {
  overview: 'Admin Overview',
  verifications: 'Verification Queue',
  bookings: 'All Bookings',
  disputes: 'Dispute Resolution',
  wallets: 'User Wallets',
  transactions: 'All Wallet Transactions',
  topups: 'Wallet Top-ups',
  provider_accounts: 'Provider Accounts (Confidential)',
  penalties: 'Professional Penalties',
  refunds: 'Refund Records',
  messages: 'Flagged Messages',
  payouts: 'Withdrawals & Payouts',
  users: 'Users & Roles',
  reports: 'Reports & Service Charges',
  settings: 'Platform Rules',
};

export default function AdminDashboard() {
  const { session } = useApp();
  const location = useLocation();
  const navigate = useNavigate();
  const token = session?.token;
  const requestedTab = new URLSearchParams(location.search).get('tab');
  const tab = VALID_TABS.includes(requestedTab) ? requestedTab : 'overview';
  const setTab = (t) => navigate(`/admin?tab=${t}`);
  const [stats, setStats] = useState(null);
  const [balanceHidden, toggleBalance] = useBalanceHidden();
  const [queue, setQueue] = useState([]);
  const [disputes, setDisputes] = useState([]);
  const [commissions, setCommissions] = useState([]);
  const [users, setUsers] = useState([]);
  const [settings, setSettings] = useState([]);
  const [withdrawals, setWithdrawals] = useState([]);
  const [userFilters, setUserFilters] = useState({ role: '', q: '' });
  const [bookingFilters, setBookingFilters] = useState({ status: '', q: '', urgent: '' });
  const [txnFilters, setTxnFilters] = useState({ user_id: '', type: '', direction: '', from: '', to: '' });
  const [walletFilters, setWalletFilters] = useState({ role: '', q: '' });
  const [topupFilters, setTopupFilters] = useState({ status: '', provider: '' });
  const [paFilters, setPaFilters] = useState({ kind: '', provider: '', q: '' });
  const [paSummary, setPaSummary] = useState(null);
  const [penaltyFilters, setPenaltyFilters] = useState({ settled: '' });
  const [msgFilter, setMsgFilter] = useState({ flagged: '' });
  const [selectedWalletUser, setSelectedWalletUser] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [wdNote, setWdNote] = useState({});   // withdrawal id -> note text (inline input)
  const [wdAction, setWdAction] = useState({}); // withdrawal id -> 'complete' | 'rejected' (confirm pending)
  const [invoice, setInvoice] = useState(null); // { kind, id, reference } for InvoiceModal
  const [resolution, setResolution] = useState({}); // dispute id -> { outcome, admin_note }

  const load = async () => {
    try {
      setStats(await api.get('/admin/dashboard', token));
      setQueue(await api.get('/admin/verifications', token));
      setDisputes(await api.get('/admin/disputes', token));
      setCommissions(await api.get('/admin/reports/commissions', token));
      setUsers(await api.get('/admin/users', token));
      setSettings(await api.get('/admin/settings', token));
      setWithdrawals(await api.get('/admin/withdrawals', token));
      api.get('/admin/wallets', token).then((d) => {
        const p = (d.rows || []).find((r) => r.role === 'admin');
        if (p) setStats((s) => ({ ...s, platform_balance: p.balance }));
      }).catch(() => {});
    } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, [tab]);

  const review = async (professionalId, decision) => {
    setError(''); setMsg('');
    try {
      const notes = decision === 'rejected' ? prompt('Rejection reason (shown to the provider):') || 'documents not clear' : 'CNIC valid, selfie matched';
      await api.post(`/admin/verifications/${professionalId}/review`, { decision, notes }, token);
      setMsg(`Professional ${decision}`);
      await load();
    } catch (e) { setError(e.message); }
  };

  const resolveDispute = async (disputeId, outcome, admin_note) => {
    setError(''); setMsg('');
    try {
      await api.post(`/admin/disputes/${disputeId}/resolve`, { outcome, admin_note }, token);
      const labels = { customer: 'full refund issued to the customer', professional: 'payment released to the professional', split: 'split 50/50 (no service charges during free launch)' };
      setMsg(`Dispute #${disputeId} resolved — ${labels[outcome] || outcome}`);
      setResolution((r) => ({ ...r, [disputeId]: undefined }));
      await load();
    } catch (e) { setError(e.message); }
  };

  const setRes = (id, patch) => setResolution((r) => ({ ...r, [id]: { outcome: r[id]?.outcome || 'split', admin_note: r[id]?.admin_note || '', ...patch } }));

  // Backend resolve math ka mirror — preview amounts (commission settings se, editable 'splitPercent' optional)
  const disputePreview = (amount) => {
    const s = Object.fromEntries((settings || []).map((x) => [x.setting_key, x.setting_value]));
    const pct = Number(s.commissionPercent ?? 10);
    const commission = Math.round(Number(amount) * (pct / 100) * 100) / 100;
    const half = Math.round((Number(amount) - commission) / 2 * 100) / 100;
    return { pct, commission, half, amount: Number(amount) };
  };

  const resolveWithdrawal = async (id, action, note) => {
    try {
      await api.post(`/admin/withdrawals/${id}/resolve`, { action, note }, token);
      setMsg(action === 'complete' ? `Withdrawal completed — transfer reference: ${note || '—'}` : 'Withdrawal rejected — the amount has been returned to the user\'s wallet');
      setWdNote({ ...wdNote, [id]: undefined });
      setWdAction({ ...wdAction, [id]: undefined });
      await load();
    } catch (e) { setError(e.message); }
  };

  const dirOf = (type) => (['topup', 'refund', 'payout', 'compensation'].includes(type) ? 'in' : 'out');

  return (
    <Layout title={TAB_TITLES[tab]} subtitle={tab === 'overview' ? 'Platform health at a glance — open any section from the sidebar.' : 'Full platform visibility with filters and pagination.'}>
      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      {tab === 'overview' && stats && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 34 }}>🏦</div>
              <div style={{ flex: 1 }}>
                <div className="muted">Platform Service Charges Wallet (platform revenue)</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--green-deep)', display: 'flex', alignItems: 'center', gap: 8 }}>
                  <BalanceAmount amount={fmt(stats.platform_balance ?? 0)} hidden={balanceHidden} onToggle={toggleBalance} />
                </div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 13 }} className="muted">
                <div>Service charges from bookings + contract milestones<br />Credited automatically on every release</div>
              </div>
            </div>
          </div>
          <div className="grid cols-4">
            <div className="card stat"><span className="value">{stats.pending_verifications}</span><span className="label">Pending Verifications</span></div>
            <div className="card stat"><span className="value">{stats.active_bookings}</span><span className="label">Active Bookings</span></div>
            <div className="card stat"><span className="value">{stats.open_disputes}</span><span className="label">Open Disputes</span></div>
            <div className="card stat"><span className="value">{fmt(stats.total_commission)}</span><span className="label">Total Service Charges</span></div>
            <div className="card stat"><span className="value">{stats.total_customers}</span><span className="label">Customers</span></div>
            <div className="card stat"><span className="value">{stats.total_professionals}</span><span className="label">Professionals</span></div>
          </div>
          <div className="card">
            <h2>Latest Service Charges Report (daily)</h2>
            <table>
              <thead><tr><th>Date</th><th>Deals</th><th>Service Charges</th></tr></thead>
              <tbody>{commissions.slice(0, 7).map((r) => (<tr key={r.day}><td>{r.day}</td><td>{r.deals}</td><td className="td-amt-in">{fmt(r.commission)}</td></tr>))}</tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'verifications' && (
        <div className="card">
          <h2>Verification Queue: manual CNIC + selfie review</h2>
          {queue.length === 0 && <p className="muted">Queue empty.</p>}
          {queue.map((p) => (
            <div className="card" key={p.id} style={{ boxShadow: 'none' }}>
              <div className="row spread">
                <div>
                  <b>{p.full_name}</b> <span className="muted">({p.phone})</span> <StatusBadge status={p.verification_status} />
                  <div className="muted">CNIC: {p.cnic_number} · Categories: {p.categories || '—'} · Exp: {p.experience_years}y</div>
                  <div className="muted">{p.bio}</div>
                  <div className="muted">Docs: front {p.cnic_front_photo ? '✅' : '❌'} · back {p.cnic_back_photo ? '✅' : '❌'} · selfie {p.selfie_photo ? '✅' : '❌'}</div>
                  {p.cnic_front_photo && (
                    <div className="row mt">
                      <img src={p.cnic_front_photo} alt="front" style={{ height: 56, borderRadius: 6, border: '1px solid var(--border)' }} />
                      <img src={p.cnic_back_photo} alt="back" style={{ height: 56, borderRadius: 6, border: '1px solid var(--border)' }} />
                      <img src={p.selfie_photo} alt="selfie" style={{ height: 56, width: 56, borderRadius: '50%', objectFit: 'cover', border: '1px solid var(--border)' }} />
                    </div>
                  )}
                </div>
                <div className="row">
                  <button className="btn small" onClick={() => review(p.id, 'approved')}>✔ Approve (Verified badge)</button>
                  <button className="btn small danger" onClick={() => review(p.id, 'rejected')}>✕ Reject (reason required)</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {tab === 'bookings' && (
        <>
          <div className="card">
            <h2>All Bookings</h2>
            <div className="filters">
              <select value={bookingFilters.status} onChange={(e) => setBookingFilters({ ...bookingFilters, status: e.target.value })}>
                <option value="">All Statuses</option>
                {['pending_payment', 'waiting_for_professional', 'accepted', 'on_the_way', 'arrived', 'work_started', 'work_completed', 'completed', 'cancelled', 'disputed', 'refunded'].map((s) => <option key={s} value={s}>{s.replaceAll('_', ' ')}</option>)}
              </select>
              <select value={bookingFilters.urgent} onChange={(e) => setBookingFilters({ ...bookingFilters, urgent: e.target.value })}>
                <option value="">All</option>
                <option value="1">Urgent/ASAP only</option>
              </select>
              <input placeholder="Search code / customer / pro" value={bookingFilters.q} onChange={(e) => setBookingFilters({ ...bookingFilters, q: e.target.value })} />
            </div>
          </div>
          <PagedTable
            endpoint="/admin/bookings"
            filters={bookingFilters}
            columns={[
              { key: 'booking_code', label: 'Code', render: (r) => <b>{r.booking_code}{r.is_urgent ? ' ⚡' : ''}</b> },
              { key: 'customer_name', label: 'Customer' },
              { key: 'professional_name', label: 'Professional' },
              { key: 'category_name', label: 'Service' },
              { key: 'final_price', label: 'Amount', render: (r) => fmt(r.final_price) },
              { key: 'scheduled_date', label: 'When', render: (r) => `${r.scheduled_date} ${String(r.scheduled_slot).slice(0, 5)}` },
              { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
              { key: 'created_at', label: 'Created', render: (r) => String(r.created_at).slice(0, 16) },
            ]}
          />
        </>
      )}

      {tab === 'disputes' && (
        <div className="card">
          <h2>Disputes: funds stay held until resolution</h2>
          {disputes.length === 0 && <p className="muted">No disputes.</p>}
          <table>
            <thead><tr><th>Booking</th><th>Amount</th><th>Description</th><th>Status</th><th>Resolve</th></tr></thead>
            <tbody>
              {disputes.map((d) => {
                const st = resolution[d.id] || {};
                const prev = disputePreview(d.final_price);
                return (
                <tr key={d.id}>
                  <td><b>{d.booking_code}</b></td>
                  <td>{fmt(d.final_price)}</td>
                  <td>{d.description}</td>
                  <td><StatusBadge status={d.status} /></td>
                  <td>
                    {d.status === 'open' ? (
                      <div style={{ minWidth: 300 }}>
                        <div className="row" role="radiogroup" aria-label="Resolution outcome" style={{ flexWrap: 'wrap', gap: 10 }}>
                          {[
                            ['customer', `Customer (+${fmt(prev.amount)})`],
                            ['professional', `Pro (+${fmt(prev.amount - prev.commission)})`],
                            ['split', 'Split 50/50'],
                          ].map(([val, label]) => (
                            <label key={val} style={{ cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              <input
                                type="radio"
                                name={`outcome-${d.id}`}
                                value={val}
                                checked={(st.outcome || 'split') === val}
                                onChange={() => setRes(d.id, { outcome: val })}
                              />
                              {' '}{label}
                            </label>
                          ))}
                        </div>
                        {(st.outcome || 'split') === 'split' && (
                          <p className="muted" style={{ fontSize: 12, margin: '6px 0' }}>
                            Preview: Service Charges <b>Rs {prev.commission}</b> ({prev.pct}%) · Customer +<b>{fmt(prev.half)}</b> · Pro +<b>{fmt(prev.half)}</b>
                          </p>
                        )}
                        <textarea
                          rows={2}
                          placeholder="Admin note (included in both parties' notifications)…"
                          value={st.admin_note || ''}
                          onChange={(e) => setRes(d.id, { admin_note: e.target.value })}
                          style={{ width: '100%', marginBottom: 6 }}
                        />
                        <div className="row">
                          <button className="btn small" onClick={() => resolveDispute(d.id, st.outcome || 'split', st.admin_note)}>
                            ✓ Resolve ({st.outcome || 'split'})
                          </button>
                        </div>
                      </div>
                    ) : d.resolution}
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'wallets' && (
        <>
          <div className="card">
            <h2>All User Wallets: balance + escrow + pending penalty</h2>
            <div className="filters">
              <select value={walletFilters.role} onChange={(e) => setWalletFilters({ ...walletFilters, role: e.target.value })}>
                <option value="">All Roles</option>
                <option value="customer">Customers</option>
                <option value="professional">Professionals</option>
                <option value="admin">Admin</option>
              </select>
              <input placeholder="Search name / phone" value={walletFilters.q} onChange={(e) => setWalletFilters({ ...walletFilters, q: e.target.value })} />
            </div>
          </div>
          <PagedTable
            endpoint="/admin/wallets"
            filters={walletFilters}
            rowKey={(r) => r.user_id}
            columns={[
              { key: 'full_name', label: 'User', render: (r) => <><b>{r.full_name || '—'}</b><div className="muted">{r.phone}</div></> },
              { key: 'role', label: 'Role', render: (r) => <span className="badge status">{r.role}</span> },
              { key: 'balance', label: 'Balance', render: (r) => <span className="td-amt-in">{fmt(r.balance)}</span> },
              { key: 'held_amount', label: 'Held (Escrow)', render: (r) => fmt(r.held_amount) },
              { key: 'pending_penalty', label: 'Pending Penalty', render: (r) => (Number(r.pending_penalty) > 0 ? <span className="td-amt-out">{fmt(r.pending_penalty)}</span> : '—') },
              { key: 'stmt', label: 'Statement', render: (r) => <button className="btn small secondary" onClick={() => { setSelectedWalletUser(r); setTxnFilters({ user_id: r.user_id, type: '', direction: '', from: '', to: '' }); setTab('transactions'); }}>View Statement</button> },
            ]}
          />
        </>
      )}

      {tab === 'transactions' && (
        <>
          <div className="card">
            <h2>All Wallet Transactions {selectedWalletUser ? `— ${selectedWalletUser.full_name || selectedWalletUser.phone}` : ''}</h2>
            <div className="filters">
              <input style={{ maxWidth: 110 }} type="number" placeholder="User ID" value={txnFilters.user_id} onChange={(e) => setTxnFilters({ ...txnFilters, user_id: e.target.value })} />
              <select value={txnFilters.direction} onChange={(e) => setTxnFilters({ ...txnFilters, direction: e.target.value })}>
                <option value="">All Directions</option>
                <option value="in">↑ Incoming</option>
                <option value="out">↓ Outgoing</option>
              </select>
              <select value={txnFilters.type} onChange={(e) => setTxnFilters({ ...txnFilters, type: e.target.value })}>
                <option value="">All Types</option>
                {['topup', 'hold', 'release', 'refund', 'payout', 'penalty', 'commission', 'withdrawal', 'compensation'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="date" value={txnFilters.from} onChange={(e) => setTxnFilters({ ...txnFilters, from: e.target.value })} />
              <input type="date" value={txnFilters.to} onChange={(e) => setTxnFilters({ ...txnFilters, to: e.target.value })} />
              <button className="btn small secondary" onClick={() => { setTxnFilters({ user_id: '', type: '', direction: '', from: '', to: '' }); setSelectedWalletUser(null); }}>Reset</button>
            </div>
            <p className="muted">Direction: <b>in</b> = topup/refund/payout/compensation credit · <b>out</b> = hold/release/penalty/commission/withdrawal.</p>
          </div>
          <PagedTable
            endpoint="/admin/wallet-transactions"
            filters={txnFilters}
            rowKey={(r) => r.id}
            columns={[
              { key: 'created_at', label: 'Date & Time', render: (r) => String(r.created_at).slice(0, 16) },
              { key: 'owner', label: 'Wallet Owner', render: (r) => <><b>{r.owner_name || r.phone}</b><div className="muted">{r.role}</div></> },
              { key: 'dir', label: 'Direction', render: (r) => <DirBadge dir={dirOf(r.type)} label={dirOf(r.type) === 'in' ? 'Incoming' : 'Outgoing'} /> },
              { key: 'type', label: 'Type', render: (r) => <span className={`badge ${r.type}`}>{r.type}</span> },
              { key: 'amount', label: 'Amount', render: (r) => <Amt value={r.amount} dir={dirOf(r.type)} /> },
              { key: 'booking_code', label: 'Booking', render: (r) => r.booking_code || '—' },
              { key: 'note', label: 'Note' },
            ]}
          />
        </>
      )}

      {tab === 'topups' && (
        <>
          <div className="card">
            <h2>Wallet Top-ups (JazzCash / Easypaisa)</h2>
            <div className="filters">
              <select value={topupFilters.status} onChange={(e) => setTopupFilters({ ...topupFilters, status: e.target.value })}>
                <option value="">All Statuses</option>
                {['pending', 'success', 'failed', 'expired'].map((s) => <option key={s} value={s}>{s}</option>)}
              </select>
              <select value={topupFilters.provider} onChange={(e) => setTopupFilters({ ...topupFilters, provider: e.target.value })}>
                <option value="">All Providers</option>
                <option value="jazzcash">JazzCash</option>
                <option value="easypaisa">Easypaisa</option>
              </select>
            </div>
          </div>
          <PagedTable
            endpoint="/admin/topups"
            filters={topupFilters}
            rowKey={(r) => r.id}
            columns={[
              { key: 'created_at', label: 'Date', render: (r) => String(r.created_at).slice(0, 16) },
              { key: 'user_name', label: 'User', render: (r) => <><b>{r.user_name || '—'}</b><div className="muted">{r.phone}</div></> },
              { key: 'provider', label: 'Provider', render: (r) => <span className="badge status">{r.provider}</span> },
              { key: 'mobile_number', label: 'Number' },
              { key: 'gateway_transaction_ref', label: 'Reference' },
              { key: 'amount', label: 'Amount', render: (r) => <Amt value={r.amount} dir="in" /> },
              { key: 'status', label: 'Status', render: (r) => <DirBadge dir={r.status === 'success' ? 'in' : r.status === 'pending' ? 'pending' : 'out'} label={r.status} /> },
            ]}
          />
        </>
      )}

      {/* Provider account details (JazzCash/Easypaisa) — CONFIDENTIAL: admin only.
          Customer/professional endpoints never return this data. */}
      {tab === 'provider_accounts' && (
        <PaTab filters={paFilters} setFilters={setPaFilters} balanceHidden={balanceHidden} />
      )}

      {tab === 'penalties' && (
        <>
          <div className="card">
            <h2>Professional Penalties (Section 10.1 — owed entries, auto-settled from payouts)</h2>
            <div className="filters">
              <select value={penaltyFilters.settled} onChange={(e) => setPenaltyFilters({ ...penaltyFilters, settled: e.target.value })}>
                <option value="">All</option>
                <option value="0">Owed (unsettled)</option>
                <option value="1">Settled</option>
              </select>
            </div>
          </div>
          <PagedTable
            endpoint="/admin/penalties"
            filters={penaltyFilters}
            rowKey={(r) => r.id}
            columns={[
              { key: 'created_at', label: 'Date', render: (r) => String(r.created_at).slice(0, 16) },
              { key: 'full_name', label: 'Professional', render: (r) => <b>{r.full_name}</b> },
              { key: 'booking_code', label: 'Booking', render: (r) => r.booking_code || '—' },
              { key: 'reason', label: 'Reason' },
              { key: 'amount', label: 'Amount', render: (r) => <Amt value={r.amount} dir="out" /> },
              { key: 'settled', label: 'Status', render: (r) => <DirBadge dir={r.settled ? 'in' : 'pending'} label={r.settled ? 'settled' : 'owed'} /> },
              { key: 'settled_at', label: 'Settled At', render: (r) => r.settled_at ? String(r.settled_at).slice(0, 16) : '—' },
            ]}
          />
        </>
      )}

      {tab === 'refunds' && (
        <PagedTable
          endpoint="/admin/refunds"
          columns={[
            { key: 'created_at', label: 'Date', render: (r) => String(r.created_at).slice(0, 16) },
            { key: 'booking_code', label: 'Booking', render: (r) => <b>{r.booking_code}</b> },
            { key: 'customer_name', label: 'Customer' },
            { key: 'professional_name', label: 'Professional' },
            { key: 'amount', label: 'Refund Amount', render: (r) => <Amt value={r.amount} dir="in" /> },
            { key: 'reason', label: 'Rule / Reason' },
            { key: 'status', label: 'Status', render: (r) => <StatusBadge status={r.status} /> },
          ]}
          emptyText="No refunds yet."
        />
      )}

      {tab === 'messages' && (
        <>
          <div className="card">
            <h2>Chat Messages (audit): off-platform attempts flagged</h2>
            <div className="filters">
              <select value={msgFilter.flagged} onChange={(e) => setMsgFilter({ flagged: e.target.value })}>
                <option value="">All Messages</option>
                <option value="1">Flagged only ⚠</option>
              </select>
            </div>
          </div>
          <PagedTable
            endpoint="/admin/messages"
            filters={msgFilter}
            rowKey={(r) => r.id}
            columns={[
              { key: 'created_at', label: 'Time', render: (r) => String(r.created_at).slice(0, 19) },
              { key: 'sender_name', label: 'From', render: (r) => <><b>{r.sender_name || '—'}</b><div className="muted">{r.sender_role}</div></> },
              { key: 'booking_code', label: 'Booking', render: (r) => r.booking_code || r.booking_id },
              { key: 'text', label: 'Message', render: (r) => <span>{r.text}{r.flagged ? ' ⚠' : ''}</span> },
              { key: 'flag_reason', label: 'Flag Reason', render: (r) => (r.flagged ? <span className="td-amt-out">{r.flag_reason}</span> : '—') },
            ]}
          />
        </>
      )}

      {tab === 'payouts' && (
        <>
          <div className="card">
            <h2>Withdrawal Requests (JazzCash/Easypaisa): approve transfers</h2>
            {withdrawals.length === 0 && <p className="muted">No withdrawal requests.</p>}
            {withdrawals.length > 0 && (
              <table>
                <thead><tr><th>Date</th><th>User</th><th>Role</th><th>Account</th><th>Amount</th><th>Status</th><th></th></tr></thead>
                <tbody>
                  {withdrawals.map((w) => (
                    <tr key={w.id}>
                      <td>{String(w.created_at).slice(0, 16)}</td>
                      <td><b>{w.phone}</b></td>
                      <td><span className="badge status">{w.role}</span></td>
                      <td>{w.account_title}<div className="muted">{w.provider} {w.account_number}</div></td>
                      <td><Amt value={w.amount} dir="out" /></td>
                      <td><DirBadge dir={w.status === 'pending' ? 'pending' : w.status === 'completed' ? 'in' : 'out'} label={w.status} /></td>
                      <td>
                        {w.status === 'pending' && (
                          wdAction[w.id] ? (
                            <div className="row">
                              <input
                                style={{ maxWidth: 180 }}
                                placeholder={wdAction[w.id] === 'complete' ? 'Transfer ref (e.g. TID 8829…)' : 'Reject reason (shown to the user)'}
                                value={wdNote[w.id] || ''}
                                onChange={(e) => setWdNote({ ...wdNote, [w.id]: e.target.value })}
                                onKeyDown={(e) => e.key === 'Enter' && resolveWithdrawal(w.id, wdAction[w.id], wdNote[w.id] || '')}
                                autoFocus
                              />
                              <button className="btn small" onClick={() => resolveWithdrawal(w.id, wdAction[w.id], wdNote[w.id] || '')}>Confirm</button>
                              <button className="btn small secondary" onClick={() => setWdAction({ ...wdAction, [w.id]: undefined })}>✕</button>
                            </div>
                          ) : (
                            <div className="row">
                              <button className="btn small" onClick={() => setWdAction({ ...wdAction, [w.id]: 'complete' })}>✔ Mark Transferred</button>
                              <button className="btn small danger" onClick={() => setWdAction({ ...wdAction, [w.id]: 'rejected' })}>✕ Reject (refund)</button>
                            </div>
                          )
                        )}
                        {w.admin_note && <div className="muted">{w.admin_note}</div>}
                        <button className="btn small secondary mt" onClick={() => setInvoice({ kind: 'withdrawal', id: w.id })}>🧾 Invoice</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </>
      )}

      {tab === 'users' && (
        <>
          <div className="card">
            <h2>All Users: role filter + search (full directory with role badges)</h2>
            <div className="filters">
              <select value={userFilters.role} onChange={(e) => setUserFilters({ ...userFilters, role: e.target.value })}>
                <option value="">All Roles</option>
                <option value="customer">Customers</option>
                <option value="professional">Professionals</option>
                <option value="admin">Admins</option>
              </select>
              <input placeholder="Search name / phone / email" value={userFilters.q} onChange={(e) => setUserFilters({ ...userFilters, q: e.target.value })} />
            </div>
            <table>
              <thead><tr><th>ID</th><th>Name</th><th>Phone</th><th>Role</th><th>Verification</th><th>Trust</th><th>Status</th><th></th></tr></thead>
              <tbody>
                {users
                  .filter((u) => (!userFilters.role || u.role === userFilters.role) && (!userFilters.q || `${u.full_name || ''} ${u.phone} ${u.email || ''}`.toLowerCase().includes(userFilters.q.toLowerCase())))
                  .map((u) => (
                  <tr key={u.id}>
                    <td>{u.id}</td>
                    <td>{u.full_name || '—'}</td>
                    <td>{u.phone}</td>
                    <td><span className="badge status">{u.role}</span></td>
                    <td className="muted">{u.verification_status || '—'}</td>
                    <td>{u.trust_score ?? '—'}</td>
                    <td><StatusBadge status={u.status} /></td>
                    <td>
                      {u.status === 'active'
                        ? <button className="btn small danger" onClick={async () => { await api.post(`/admin/users/${u.id}/suspend`, {}, token); load(); }}>Suspend</button>
                        : <button className="btn small" onClick={async () => { await api.post(`/admin/users/${u.id}/activate`, {}, token); load(); }}>Activate</button>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'reports' && (
        <div className="card">
          <h2>Service Charges Report (daily)</h2>
          <table>
            <thead><tr><th>Date</th><th>Deals</th><th>Service Charges</th></tr></thead>
            <tbody>{commissions.map((r) => (<tr key={r.day}><td>{r.day}</td><td>{r.deals}</td><td className="td-amt-in">{fmt(r.commission)}</td></tr>))}</tbody>
          </table>
        </div>
      )}

      {tab === 'settings' && (
        <div className="card">
          <h2>Platform Settings (Admin-configurable: cancellation, service charges and release rules)</h2>
          <table>
            <thead><tr><th>Key</th><th>Value</th><th>Meaning</th></tr></thead>
            <tbody>
              {settings.map((s) => (
                <tr key={s.setting_key}>
                  <td><b>{s.setting_key}</b></td>
                  <td>{s.setting_value}</td>
                  <td className="muted">{{
                    commission_percent: 'Platform commission % on every release (default 10)',
                    auto_release_hours: 'Auto-release countdown after work completion',
                    min_advance_booking_hours: 'Minimum advance booking (2h)',
                    max_advance_booking_days: 'Maximum advance booking (30 days)',
                    customer_cancel_refund_percent: 'Customer refund % after pro acceptance (85)',
                    customer_cancel_pro_compensation_percent: 'Cut ka professional-compensation hissa (10% of held; baqi platform)',
                    pro_cancel_penalty_percent: 'Pro penalty % on own cancellation (owed → next payout se auto-cut)',
                    max_no_shows_before_suspend: 'No-shows before auto-suspension',
                  }[s.setting_key] || ''}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {invoice && <InvoiceModal kind={invoice.kind} id={invoice.id} reference={invoice.reference} onClose={() => setInvoice(null)} />}
    </Layout>
  );
}
