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

      <div className="grid cols-4">
        <div className="card stat"><span className="value">{fmt(wallet?.balance)}</span><span className="label">Wallet Balance</span><span className="hint">available to spend</span></div>
        <div className="card stat"><span className="value">{fmt(wallet?.held_amount)}</span><span className="label">Held (Escrow)</span><span className="hint">locked for active jobs</span></div>
        <div className="card stat"><span className="value">{active.length}</span><span className="label">Active Bookings</span><span className="hint">in progress now</span></div>
        <div className="card stat"><span className="value">{bookings.length}</span><span className="label">Total Bookings</span><span className="hint">all time</span></div>
      </div>

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
