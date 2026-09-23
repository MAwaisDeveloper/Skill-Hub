import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { Empty } from '../components/ui';

export default function NotificationsPage() {
  const { session } = useApp();
  const token = session?.token;
  const role = session?.user?.role;
  const [items, setItems] = useState([]);
  const [error, setError] = useState('');

  const load = async () => {
    try { setItems(await api.get(`/${role}/notifications`, token)); } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const markAll = async () => {
    await api.post(`/${role}/notifications/read-all`, {}, token);
    await load();
  };

  const base = role === 'professional' ? '/professional' : '/customer';

  return (
    <Layout title="Notifications" subtitle="Booking updates, payments, verification and chat alerts"
      actions={<button className="btn small secondary" onClick={markAll}>Mark all read</button>}>
      {error && <div className="alert error">{error}</div>}
      <div className="card">
        {items.length === 0 && <Empty icon="🔔">No notifications yet.</Empty>}
        {items.map((n) => (
          <div key={n.id} className="row spread" style={{ padding: '12px 0', borderBottom: '1px solid var(--border)', opacity: n.read_status ? 0.65 : 1 }}>
            <div>
              <span className="badge status">{n.type}</span> <b>{n.title || ''}</b>
              <div>{n.message}</div>
              <div className="muted">{n.created_at?.slice(0, 16)}</div>
            </div>
            <div className="row">
              {n.related_booking_id && <Link className="btn small secondary" to={`${base}/bookings/${n.related_booking_id}`}>Open Booking</Link>}
              {!n.read_status && (
                <button className="btn small" onClick={async () => { await api.post(`/${role}/notifications/${n.id}/read`, {}, token); load(); }}>Mark read</button>
              )}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
