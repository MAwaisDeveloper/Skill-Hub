import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { Empty } from '../components/ui';

function Stars({ n }) {
  return <span style={{ color: '#d9a441', letterSpacing: 2 }}>{'★'.repeat(Number(n))}{'☆'.repeat(5 - Number(n))}</span>;
}

// My Reviews — customer ne jo ratings di hain (completed bookings ke baad).
export default function CustomerReviews() {
  const { session } = useApp();
  const token = session?.token;
  const [reviews, setReviews] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/customer/reviews', token).then(setReviews).catch((e) => setError(e.message));
  }, []);

  const avg = reviews.length ? (reviews.reduce((a, r) => a + Number(r.rating), 0) / reviews.length).toFixed(1) : null;

  return (
    <Layout title="My Reviews" subtitle="Ratings you have given — rate the provider after each completed booking">
      {error && <div className="alert error">{error}</div>}

      {reviews.length > 0 && (
        <div className="grid cols-3">
          <div className="card stat"><span className="value">{reviews.length}</span><span className="label">Total Reviews Given</span></div>
          <div className="card stat"><span className="value" style={{ color: '#b7791f' }}>★ {avg}</span><span className="label">Your Average Rating Given</span></div>
          <div className="card stat"><span className="value">{reviews.filter((r) => Number(r.rating) >= 4).length}</span><span className="label">Positive (4★+)</span></div>
        </div>
      )}

      <div className="card">
        {reviews.length === 0 && <Empty icon="★">No reviews yet. Once a booking is completed, you can rate the provider from <Link to="/customer/bookings">My Bookings</Link>.</Empty>}
        {reviews.length > 0 && (
          <table>
            <thead><tr><th>Date</th><th>Booking</th><th>Professional</th><th>Service</th><th>Your Rating</th><th>Comment</th><th>Pro Rating Now</th></tr></thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id}>
                  <td>{r.created_at?.slice(0, 16)}</td>
                  <td><Link to={`/bookings/${r.booking_id}`}><b>{r.booking_code}</b></Link></td>
                  <td><b>{r.professional_name}</b></td>
                  <td className="muted">{r.category_name}</td>
                  <td><Stars n={r.rating} /></td>
                  <td className="muted">{r.comment || '—'}</td>
                  <td className="muted">★ {r.professional_now_rating}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
