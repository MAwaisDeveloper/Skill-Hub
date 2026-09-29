import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { Empty } from '../components/ui';

function Stars({ n }) {
  return <span style={{ color: '#d9a441', letterSpacing: 2 }}>{'★'.repeat(Number(n))}{'☆'.repeat(5 - Number(n))}</span>;
}

// Reviews Received — professionals ko customers ki di hui ratings.
export default function ProReviews() {
  const { session } = useApp();
  const token = session?.token;
  const [reviews, setReviews] = useState([]);
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/professional/reviews', token).then(setReviews).catch((e) => setError(e.message));
  }, []);

  const avg = reviews.length ? (reviews.reduce((a, r) => a + Number(r.rating), 0) / reviews.length).toFixed(1) : null;

  return (
    <Layout title="Reviews Received" subtitle="What customers thought of your service — every rating shows on your profile">
      {error && <div className="alert error">{error}</div>}

      {reviews.length > 0 && (
        <div className="grid cols-3">
          <div className="card stat"><span className="value" style={{ color: '#b7791f' }}>★ {avg}</span><span className="label">Average Rating</span><span className="hint">{reviews.length} reviews total</span></div>
          <div className="card stat"><span className="value">{reviews.filter((r) => Number(r.rating) === 5).length}</span><span className="label">5-Star Reviews</span></div>
          <div className="card stat"><span className="value">{reviews.filter((r) => Number(r.rating) <= 2).length}</span><span className="label">Low Ratings (≤2★)</span><span className="hint">service behtar banayen</span></div>
        </div>
      )}

      <div className="card">
        {reviews.length === 0 && <Empty icon="★">No reviews yet. Complete jobs and customers will rate your work.</Empty>}
        {reviews.length > 0 && (
          <table>
            <thead><tr><th>Date</th><th>Booking</th><th>Rating</th><th>Comment</th></tr></thead>
            <tbody>
              {reviews.map((r) => (
                <tr key={r.id}>
                  <td>{r.created_at?.slice(0, 16)}</td>
                  <td><b>{r.booking_code}</b></td>
                  <td><Stars n={r.rating} /></td>
                  <td className="muted">{r.comment || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </Layout>
  );
}
