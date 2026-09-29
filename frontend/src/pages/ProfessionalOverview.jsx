import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatusBadge, MoneyFlow, Empty, BalanceAmount, useBalanceHidden } from '../components/ui';

// Pro identity card — dashboard par apna naam, photo, phone (sab kuch ek jagah)
// (booking detail par customer ke liye bhi reuse hota hai — rating optional)
export function ProIdentityCard({ profile, phone, right }) {
  const initials = (profile?.full_name || 'P').split(' ').map((w) => w[0]).slice(0, 2).join('').toUpperCase();
  const showRating = profile?.average_rating != null;
  return (
    <div className="card pro-id-card">
      {profile?.profile_photo
        ? <img className="pro-id-photo" src={profile.profile_photo} alt={profile.full_name} />
        : <div className="pro-id-photo pro-id-initials">{initials}</div>}
      <div className="pro-id-info">
        <h2 style={{ marginBottom: 2 }}>{profile?.full_name || 'Professional'}</h2>
        <div className="pro-id-phone">📞 {phone || '—'}</div>
        <div className="pro-id-meta">
          {showRating && <span>★ {profile.average_rating} rating · {profile?.completed_jobs ?? 0} jobs · </span>}
          Trust score {profile?.trust_score ?? 100}
        </div>
      </div>
      {right}
    </div>
  );
}

export default function ProfessionalOverview() {
  const { session } = useApp();
  const token = session?.token;
  const [data, setData] = useState(null);
  const [wallet, setWallet] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');
  const [balanceHidden, toggleBalance] = useBalanceHidden();

  useEffect(() => {
    Promise.all([
      api.get('/professional/me/dashboard', token),
      api.get('/professional/wallet', token),
      api.get('/professional/bookings', token),
    ]).then(([d, w, b]) => { setData(d); setWallet(w); setBookings(b); }).catch((e) => setError(e.message));
  }, []);

  if (!data) return <Layout title="Loading…">{error && <div className="alert error">{error}</div>}</Layout>;
  const { profile, stats } = data;
  const newRequests = bookings.filter((b) => b.status === 'waiting_for_professional');
  const myPhone = session?.user?.phone || '';

  return (
    <Layout
      title={`Workspace — ${profile.full_name}`}
      subtitle={`★ ${profile.average_rating} rating · ${profile.completed_jobs} jobs completed · Trust score ${profile.trust_score}`}
      actions={<Link to="/professional/profile" className="btn secondary">Profile & Verification</Link>}
    >
      <ProIdentityCard profile={profile} phone={myPhone} />
      {error && <div className="alert error">{error}</div>}

      {profile.verification_status !== 'verified' && (
        <div className="alert warn">
          <b>Verification {profile.verification_status}.</b> Admin manually checks your CNIC photos + selfie. Until verified, customers
          cannot see or book you: this is a system-level rule and cannot be bypassed. {profile.verification_note}
        </div>
      )}
      {Number(stats.outstanding_penalties) > 0 && (
        <div className="alert error">
          Outstanding penalty: <b>{fmt(stats.outstanding_penalties)}</b> — this will be <b>automatically deducted from your next payout</b> (you never pay from your pocket).
        </div>
      )}

      <div className="grid cols-4">
        <div className="card stat"><span className="value">{stats.new_requests}</span><span className="label">New Requests</span><span className="hint">waiting for your response</span></div>
        <div className="card stat"><span className="value">{stats.active_jobs}</span><span className="label">Active Jobs</span><span className="hint">accepted & in progress</span></div>
        <div className="card stat"><span className="value"><BalanceAmount amount={fmt(wallet?.balance)} hidden={balanceHidden} onToggle={toggleBalance} /></span><span className="label">Wallet Balance</span><span className="hint">yours to withdraw</span></div>
        <div className="card stat"><span className="value">{fmt(stats.total_earned)}</span><span className="label">Lifetime Earnings</span><span className="hint">after 0% service charges (free launch offer)</span></div>
      </div>

      {newRequests.length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--gold)' }}>
          <h2>🔥 {newRequests.length} New Job Request{newRequests.length > 1 ? 's' : ''} — respond now!</h2>
          {newRequests.map((b) => (
            <div className="row spread" key={b.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <b>{b.category_name}</b> — {b.customer_name} · {b.scheduled_date} {b.scheduled_slot?.slice(0, 5)}
                <div className="muted">{b.customer_address || 'Address visible after accept'} · Price: <b>{fmt(b.final_price)}</b> (escrow-secured: money already held)</div>
              </div>
              <div className="row">
                <Link to={`/professional/bookings/${b.id}`} className="btn small gold">View & Accept</Link>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <h2>💰 Your earning on every job</h2>
        <MoneyFlow nodes={[
          { title: 'Customer Pays', sub: 'full price locked in escrow' },
          { title: 'Job Completed', sub: 'customer confirms / 24h auto' },
          { title: '−10% Commission', sub: 'platform fee, automatic' },
          { title: '90% → Your Wallet', sub: 'minus any old penalties' },
        ]} />
        <p className="muted">Example: Rs 3,000 job → <b>Rs 2,700</b> lands in your wallet. Withdraw anytime to your JazzCash/Easypaisa.</p>
      </div>

      <div className="card">
        <div className="row spread mb">
          <h2>Recent Jobs</h2>
          <Link to="/professional/jobs" className="btn small secondary">All Jobs</Link>
        </div>
        {bookings.length === 0 ? <Empty icon="🛠">No jobs yet. Keep your slots open and availability updated.</Empty> : (
          <table>
            <thead><tr><th>Code</th><th>Service</th><th>Customer</th><th>When</th><th>You Get</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {bookings.slice(0, 6).map((b) => (
                <tr key={b.id}>
                  <td><b>{b.booking_code}</b></td>
                  <td>{b.category_name}</td>
                  <td>{b.customer_name}</td>
                  <td>{b.scheduled_date} {b.scheduled_slot?.slice(0, 5)}</td>
                  <td>{fmt(Number(b.final_price) * 0.9)}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td><Link to={`/professional/bookings/${b.id}`} className="btn small secondary">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
