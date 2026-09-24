import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatusBadge, Empty } from '../components/ui';

export default function CustomerOverview() {
  const { session } = useApp();
  const token = session?.token;
  const [wallet, setWallet] = useState(null);
  const [bookings, setBookings] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      api.get('/customer/wallet', token),
      api.get('/customer/bookings', token),
    ]).then(([w, b]) => { setWallet(w); setBookings(b); }).catch((e) => setError(e.message));
  }, []);

  const active = bookings.filter((b) => !['completed', 'cancelled', 'refunded'].includes(b.status));

  return (
    <Layout
      title={`Welcome back, ${session?.profile?.full_name || 'Customer'} 👋`}
      subtitle="Here is everything happening on your Hunar account"
      actions={<Link to="/book" className="btn">+ Book a Service</Link>}
    >
      {error && <div className="alert error">{error}</div>}

      {/* New-user onboarding checklist — naya user kuch sochay bina start kar sake */}
      {bookings.length === 0 && (
        <div className="card onboarding">
          <h2>🚀 Shuru karein — 3 asaan steps</h2>
          <div className="onb-steps">
            <div className={`onb-step ${bookings.length ? 'done' : ''}`}>
              <span className="n">{bookings.length ? '✓' : '1'}</span>
              <div><b>Address add karein</b><div className="muted">Profile &amp; Addresses par map pin ke sath</div></div>
              {!bookings.length && <Link to="/customer/profile" className="btn small">Add</Link>}
            </div>
            <div className="onb-step">
              <span className="n">2</span>
              <div><b>Wallet mein paise dalein</b><div className="muted">JazzCash/Easypaisa se — 1 minute</div></div>
              <Link to="/customer/wallet" className="btn small">Add Money</Link>
            </div>
            <div className="onb-step">
              <span className="n">3</span>
              <div><b>Service book karein</b><div className="muted">Verified professional, escrow-protected payment</div></div>
              <Link to="/book" className="btn small gold">Book Now</Link>
            </div>
          </div>
          <p className="muted mt">💡 Kaise chalta hai? <Link to="/guide">How Hunar Works</Link> — 2 minute mein samajh jayen.</p>
        </div>
      )}

      <div className="grid cols-4">
        <div className="card stat"><span className="value">{fmt(wallet?.balance)}</span><span className="label">Wallet Balance</span><span className="hint">available to spend</span></div>
        <div className="card stat"><span className="value">{fmt(wallet?.held_amount)}</span><span className="label">Held (Escrow)</span><span className="hint">locked for active jobs</span></div>
        <div className="card stat"><span className="value">{active.length}</span><span className="label">Active Bookings</span><span className="hint">in progress now</span></div>
        <div className="card stat"><span className="value">{bookings.length}</span><span className="label">Total Bookings</span><span className="hint">all time</span></div>
      </div>

      {/* Offers / late-arrival actions — deal yahin finalize hota hai */}
      {bookings.filter((b) => b.offer_status === 'pending' && b.status === 'waiting_for_professional').length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--gold)' }}>
          <h2>💼 Pending Offers — Deal Finalize Karein</h2>
          <p className="muted">Professionals ne aap ki request par apni price offer ki hai:</p>
          {bookings.filter((b) => b.offer_status === 'pending').map((b) => (
            <div className="row spread mb" key={b.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <b>{b.professional_name}</b> — {b.category_name} · offer <b>Rs {Number(b.offered_price).toLocaleString()}</b>
                {Number(b.offered_price) !== Number(b.final_price) && <span className="muted"> (aap ki budget: {fmt(b.final_price)})</span>}
                <div className="muted" style={{ fontSize: 13 }}>{b.description?.slice(0, 90)}</div>
              </div>
              <Link to={`/bookings/${b.id}`} className="btn small">Accept / Reject →</Link>
            </div>
          ))}
        </div>
      )}

      {bookings.filter((b) => b.late_notified === 1 && b.late_approved === 0 && ['accepted', 'on_the_way'].includes(b.status)).length > 0 && (
        <div className="card" style={{ borderLeft: '4px solid var(--danger)' }}>
          <h2>⏰ Late Arrivals — Action Required</h2>
          {bookings.filter((b) => b.late_notified === 1 && b.late_approved === 0).map((b) => (
            <div className="row spread mb" key={b.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border)' }}>
              <div><b>{b.professional_name}</b> is running late on {b.booking_code} — approve (no deduction) or cancel (100% refund)</div>
              <Link to={`/bookings/${b.id}`} className="btn small danger">Handle →</Link>
            </div>
          ))}
        </div>
      )}

      <div className="card">
        <div className="row spread mb">
          <h2>Recent Bookings</h2>
          <Link to="/customer/bookings" className="btn small secondary">View All</Link>
        </div>
        {bookings.length === 0 && <Empty icon="🧰">No bookings yet — book your first verified professional.</Empty>}
        {bookings.length > 0 && (
          <table>
            <thead><tr><th>Code</th><th>Service</th><th>Professional</th><th>When</th><th>Price</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {bookings.slice(0, 6).map((b) => (
                <tr key={b.id}>
                  <td><b>{b.booking_code}</b></td>
                  <td>{b.category_name}</td>
                  <td>{b.professional_name}<div className="muted">★ {b.professional_rating}</div></td>
                  <td>{b.scheduled_date}<div className="muted">{b.scheduled_slot?.slice(0, 5)}</div></td>
                  <td>{fmt(b.final_price)}</td>
                  <td><StatusBadge status={b.status} /></td>
                  <td><Link to={`/bookings/${b.id}`} className="btn small secondary">Open</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="grid cols-2">
        <div className="card">
          <h2>💎 How your money is protected</h2>
          <p className="muted">
            When you book, the full amount moves from your wallet into <b>escrow</b> — the professional can't touch it
            until you confirm the job is done. Not happy? <b>Report a problem</b> and admin steps in. If you simply
            don't respond within 24 hours of completion, payment auto-releases (this keeps professionals paid fairly).
          </p>
        </div>
        <div className="card">
          <h2>🛡 Platform guarantee</h2>
          <p className="muted">
            Every professional is manually verified (CNIC + live selfie matched by our team) before they can receive a
            single booking. Phone numbers stay hidden — all chat happens inside Hunar, and cash-deal attempts are
            flagged automatically.
          </p>
        </div>
      </div>
    </Layout>
  );
}
