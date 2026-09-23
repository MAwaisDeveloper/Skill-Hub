import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatusBadge, Empty } from '../components/ui';

const FILTERS = ['all', 'active', 'pending_payment', 'waiting_for_professional', 'accepted', 'work_started', 'completed', 'cancelled', 'disputed'];

export default function CustomerBookings() {
  const { session } = useApp();
  const token = session?.token;
  const [bookings, setBookings] = useState([]);
  const [filter, setFilter] = useState('all');
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/customer/bookings', token).then(setBookings).catch((e) => setError(e.message));
  }, []);

  const filtered = bookings.filter((b) => {
    if (filter === 'all') return true;
    if (filter === 'active') return !['completed', 'cancelled', 'refunded'].includes(b.status);
    return b.status === filter;
  });

  return (
    <Layout title="My Bookings" subtitle="Every job, its escrow status and full lifecycle" actions={<Link to="/book" className="btn">+ New Booking</Link>}>
      {error && <div className="alert error">{error}</div>}
      <div className="row mb">
        {FILTERS.map((f) => (
          <button key={f} className={`btn small ${filter === f ? '' : 'secondary'}`} onClick={() => setFilter(f)}>
            {f.replaceAll('_', ' ')}
          </button>
        ))}
      </div>
      <div className="card">
        {filtered.length === 0 && <Empty icon="🗂">No bookings in this view.</Empty>}
        {filtered.length > 0 && (
          <table>
            <thead><tr><th>Code</th><th>Service</th><th>Professional</th><th>Scheduled</th><th>Price</th><th>Status</th><th></th></tr></thead>
            <tbody>
              {filtered.map((b) => (
                <tr key={b.id}>
                  <td><b>{b.booking_code}</b></td>
                  <td>{b.category_name}</td>
                  <td>{b.professional_name}</td>
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
    </Layout>
  );
}
