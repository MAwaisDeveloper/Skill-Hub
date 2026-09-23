import React, { useEffect, useState } from 'react';
import { useLocation } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatusBadge, DirBadge, Amt, Pagination, Empty } from '../components/ui';

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

// Pagination refetches via filters.page — setFilters passed through to PagedTable.
const TABS = ['overview', 'verifications', 'bookings', 'disputes', 'wallets', 'transactions', 'topups', 'penalties', 'refunds', 'messages', 'payouts', 'users', 'reports', 'settings'];

export default function AdminDashboard() {
  const { session } = useApp();
  const location = useLocation();
  const token = session?.token;
  const [tab, setTab] = useState(location.state?.tab || 'overview');
  const [stats, setStats] = useState(null);
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
  const [penaltyFilters, setPenaltyFilters] = useState({ settled: '' });
  const [msgFilter, setMsgFilter] = useState({ flagged: '' });
  const [selectedWalletUser, setSelectedWalletUser] = useState(null);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

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
      const notes = decision === 'rejected' ? prompt('Rejection reason (customer/pro ko dikhega):') || 'documents not clear' : 'CNIC valid, selfie matched';
      await api.post(`/admin/verifications/${professionalId}/review`, { decision, notes }, token);
      setMsg(`Professional ${decision}`);
      await load();
    } catch (e) { setError(e.message); }
  };

  const resolveDispute = async (disputeId, outcome) => {
    try {
      const resolution = prompt('Resolution note:') || 'resolved';
      await api.post(`/admin/disputes/${disputeId}/resolve`, { outcome, resolution }, token);
      setMsg('Dispute resolved');
      await load();
    } catch (e) { setError(e.message); }
  };

  const resolveWithdrawal = async (id, action) => {
    try {
      const note = action === 'rejected' ? prompt('Reject reason (user ko dikhega):') || '' : prompt('Transfer reference (optional):') || '';
      await api.post(`/admin/withdrawals/${id}/resolve`, { action, note }, token);
      setMsg(`Withdrawal ${action}d`);
      await load();
    } catch (e) { setError(e.message); }
  };

  const dirOf = (type) => (['topup', 'refund', 'payout'].includes(type) ? 'in' : 'out');

  return (
    <Layout title="Admin Panel" subtitle="Everything, with filters + pagination. Users see only their own data — admin sees the whole system.">
      <div className="filters" style={{ marginBottom: 14 }}>
        {TABS.map((t) => (
          <button key={t} className={`btn small ${tab === t ? '' : 'secondary'}`} onClick={() => setTab(t)}>{t}</button>
        ))}
      </div>
      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      {tab === 'overview' && stats && (
        <>
          <div className="card" style={{ marginBottom: 14 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ fontSize: 34 }}>🏦</div>
              <div style={{ flex: 1 }}>
                <div className="muted">Platform Commission Wallet (Hunar revenue)</div>
                <div style={{ fontSize: 26, fontWeight: 700, color: 'var(--green-deep)' }}>{fmt(stats.platform_balance ?? 0)}</div>
              </div>
              <div style={{ textAlign: 'right', fontSize: 13 }} className="muted">
                <div>Bookings commission + cancellation platform share + contract milestone commission<br />Sab releases par automatic credit hoti hai</div>
              </div>
            </div>
          </div>
          <div className="grid cols-4">
            <div className="card stat"><span className="value">{stats.pending_verifications}</span><span className="label">Pending Verifications</span></div>
            <div className="card stat"><span className="value">{stats.active_bookings}</span><span className="label">Active Bookings</span></div>
            <div className="card stat"><span className="value">{stats.open_disputes}</span><span className="label">Open Disputes</span></div>
            <div className="card stat"><span className="value">{fmt(stats.total_commission)}</span><span className="label">Total Commission</span></div>
            <div className="card stat"><span className="value">{stats.total_customers}</span><span className="label">Customers</span></div>
            <div className="card stat"><span className="value">{stats.total_professionals}</span><span className="label">Professionals</span></div>
          </div>
          <div className="card">
            <h2>Latest Commission Report (daily)</h2>
            <table>
              <thead><tr><th>Date</th><th>Deals</th><th>Commission</th></tr></thead>
              <tbody>{commissions.slice(0, 7).map((r) => (<tr key={r.day}><td>{r.day}</td><td>{r.deals}</td><td className="td-amt-in">{fmt(r.commission)}</td></tr>))}</tbody>
            </table>
          </div>
        </>
      )}

      {tab === 'verifications' && (
        <div className="card">
          <h2>Verification Queue — manual CNIC + selfie review</h2>
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
          <h2>Disputes — funds stay held until resolution</h2>
          {disputes.length === 0 && <p className="muted">No disputes.</p>}
          <table>
            <thead><tr><th>Booking</th><th>Amount</th><th>Description</th><th>Status</th><th>Resolve</th></tr></thead>
            <tbody>
              {disputes.map((d) => (
                <tr key={d.id}>
                  <td><b>{d.booking_code}</b></td>
                  <td>{fmt(d.final_price)}</td>
                  <td>{d.description}</td>
                  <td><StatusBadge status={d.status} /></td>
                  <td>
                    {d.status === 'open' ? (
                      <div className="row">
                        <button className="btn small" onClick={() => resolveDispute(d.id, 'customer')}>Customer</button>
                        <button className="btn small" onClick={() => resolveDispute(d.id, 'professional')}>Pro</button>
                        <button className="btn small secondary" onClick={() => resolveDispute(d.id, 'split')}>Split</button>
                      </div>
                    ) : d.resolution}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === 'wallets' && (
        <>
          <div className="card">
            <h2>All User Wallets — balance + escrow + pending penalty</h2>
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
                {['topup', 'hold', 'release', 'refund', 'payout', 'penalty', 'commission'].map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
              <input type="date" value={txnFilters.from} onChange={(e) => setTxnFilters({ ...txnFilters, from: e.target.value })} />
              <input type="date" value={txnFilters.to} onChange={(e) => setTxnFilters({ ...txnFilters, to: e.target.value })} />
              <button className="btn small secondary" onClick={() => { setTxnFilters({ user_id: '', type: '', direction: '', from: '', to: '' }); setSelectedWalletUser(null); }}>Reset</button>
            </div>
            <p className="muted">Direction: <b>in</b> = topup/refund/payout credit · <b>out</b> = hold/release/penalty/commission cut.</p>
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
            <h2>Chat Messages (audit) — off-platform attempts flagged</h2>
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
            <h2>Withdrawal Requests (JazzCash/Easypaisa) — approve transfers</h2>
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
                          <div className="row">
                            <button className="btn small" onClick={() => resolveWithdrawal(w.id, 'complete')}>✔ Mark Transferred</button>
                            <button className="btn small danger" onClick={() => resolveWithdrawal(w.id, 'rejected')}>✕ Reject (refund)</button>
                          </div>
                        )}
                        {w.admin_note && <div className="muted">{w.admin_note}</div>}
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
            <h2>All Users — role filter + search (full directory with role badges)</h2>
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
          <h2>Commission Report (daily)</h2>
          <table>
            <thead><tr><th>Date</th><th>Deals</th><th>Commission</th></tr></thead>
            <tbody>{commissions.map((r) => (<tr key={r.day}><td>{r.day}</td><td>{r.deals}</td><td className="td-amt-in">{fmt(r.commission)}</td></tr>))}</tbody>
          </table>
        </div>
      )}

      {tab === 'settings' && (
        <div className="card">
          <h2>Platform Settings (Admin-configurable — cancellation/commission rules live from here)</h2>
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
    </Layout>
  );
}
