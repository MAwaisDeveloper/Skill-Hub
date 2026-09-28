import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatusBadge, Empty } from '../components/ui';

export default function ProJobs() {
  const { session } = useApp();
  const token = session?.token;
  const [bookings, setBookings] = useState([]);
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [filter, setFilter] = useState('all');

  const load = async () => {
    try { setBookings(await api.get('/professional/bookings', token)); } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const act = async (id, path, body) => {
    setError(''); setMsg('');
    try {
      const res = await api.post(`/professional/bookings/${id}/${path}`, body || {}, token);
      setMsg(res.status ? `Status updated → ${res.status.replaceAll('_', ' ')}` : 'Done');
      await load();
    } catch (e) { setError(e.message); }
  };

  const nextAction = (b) => {
    switch (b.status) {
      case 'waiting_for_professional': return (
        <>
          <button className="btn small" onClick={() => act(b.id, 'accept')}>✔ Accept Job</button>
          <button className="btn small danger" onClick={() => {
            const reason = prompt('Reject reason (shown to the customer, min 10 characters):');
            if (reason) act(b.id, 'reject', { reason });
          }}>✕ Reject (with reason)</button>
        </>
      );
      case 'accepted': return <button className="btn small" onClick={() => act(b.id, 'status', { status: 'on_the_way' })}>🛵 On The Way</button>;
      case 'on_the_way': return <button className="btn small" onClick={() => act(b.id, 'status', { status: 'arrived' })}>📍 Arrived</button>;
      case 'work_started': return <button className="btn small gold" onClick={() => { if (window.confirm('Mark complete? Customer has 24h to confirm or payment auto-releases.')) act(b.id, 'status', { status: 'work_completed' }); }}>✔ Complete Job</button>;
      default: return <Link to={`/professional/bookings/${b.id}`} className="btn small secondary">Details</Link>;
    }
  };

  const hint = (b) => {
    switch (b.status) {
      case 'waiting_for_professional': return 'Money is already held from customer — accept to lock the job.';
      case 'accepted': return 'Click "On The Way" when you leave.';
      case 'arrived': return 'Customer will give you a 6-digit OTP — work starts after they confirm it.';
      case 'work_started': return 'Finish the job, then mark complete.';
      case 'work_completed': return 'Payment releases when customer confirms — or automatically in 24h.';
      case 'completed': return 'Payout added to your wallet (minus 0% service charges (free launch offer)).';
      default: return '';
    }
  };

  const filtered = bookings.filter((b) => {
    if (filter === 'all') return true;
    if (filter === 'new') return b.status === 'waiting_for_professional';
    if (filter === 'active') return ['accepted', 'on_the_way', 'arrived', 'work_started', 'work_completed'].includes(b.status);
    return b.status === filter;
  });

  return (
    <Layout title="Job Requests" subtitle="Accept, update status step-by-step, and track payouts — full lifecycle">
      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="row mb">
        {[['all', 'All'], ['new', 'New Requests'], ['active', 'Active'], ['completed', 'Completed'], ['cancelled', 'Cancelled']].map(([k, l]) => (
          <button key={k} className={`btn small ${filter === k ? '' : 'secondary'}`} onClick={() => setFilter(k)}>{l}</button>
        ))}
      </div>

      <div className="card">
        {filtered.length === 0 && <Empty icon="🛠">Nothing here right now.</Empty>}
        {filtered.map((b) => (
          <div key={b.id} style={{ padding: '14px 0', borderBottom: '1px solid var(--border)' }}>
            <div className="row spread">
              <div style={{ minWidth: 0 }}>
                <b>{b.booking_code}</b> · {b.category_name} <StatusBadge status={b.status} />
                <div className="muted">
                  {b.customer_name} · {b.scheduled_date} {b.scheduled_slot?.slice(0, 5)} · Your earning: <b>{fmt(Number(b.final_price) * 0.9)}</b> <span className="muted">(from {fmt(b.final_price)})</span>
                </div>
                {b.customer_address && <div className="muted">📍 {b.customer_address}</div>}
                <div className="muted" style={{ fontStyle: 'italic' }}>{hint(b)}</div>
              </div>
              <div className="row">
                {nextAction(b)}
                <Link to={`/professional/bookings/${b.id}`} className="btn small secondary">Chat</Link>
              </div>
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
