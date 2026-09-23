import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatusBadge, CancelPreviewModal, DirBadge, Amt } from '../components/ui';

export default function ProBookingDetail() {
  const { id } = useParams();
  const { session } = useApp();
  const token = session?.token;
  const [booking, setBooking] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [cancelPreview, setCancelPreview] = useState(null);

  const showCancelPreview = async () => {
    setError('');
    try {
      setCancelPreview(await api.get(`/professional/bookings/${id}/cancel-preview`, token));
    } catch (e) { setError(e.message); }
  };

  const doCancel = async () => {
    setCancelPreview(null);
    setError(''); setMsg('');
    try {
      const res = await api.post(`/professional/bookings/${id}/cancel`, {}, token);
      setMsg(res.penalty_recorded > 0
        ? `Booking cancelled. Customer ko Rs ${res.refund ?? 'full'} refund ho gaya. Aap ki Rs ${res.penalty_recorded} penalty record ho gayi — agle payout se auto-cut.`
        : 'Booking cancelled — customer ko full refund ho gaya (koi penalty nahi).');
      await load();
    } catch (e) { setError(e.message); }
  };

  const load = async () => {
    try {
      setBooking(await api.get(`/professional/bookings/${id}`, token));
      setMessages(await api.get(`/professional/bookings/${id}/messages`, token));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { load(); }, [id]);

  const send = async () => {
    if (!chatText.trim()) return;
    setError(''); setMsg('');
    try {
      const res = await api.post(`/professional/bookings/${id}/messages`, { text: chatText }, token);
      if (res.flagged) setMsg(`⚠ ${res.warning}`);
      setChatText('');
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!booking) return <p className="muted">{error || 'Loading…'}</p>;

  return (
    <Layout title={`Job ${booking.booking_code}`} subtitle={`${booking.category_name} · ${booking.customer_name} · ${fmt(booking.final_price)} (you earn ${fmt(Number(booking.final_price) * 0.9)})`} actions={<StatusBadge status={booking.status} />}>
      {msg && <div className="alert warn">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-2">
        <div className="card">
          <h2>Job Details</h2>
          <p><b>Address:</b> {booking.customer_address || '—'}</p>
          <p className="muted">{booking.description}</p>
          <h2 className="mt">Timeline</h2>
          <ul className="timeline">
            {(booking.timeline || []).map((e) => (
              <li key={e.id}>{e.event_type.replaceAll('_', ' ')} {e.note ? `— ${e.note}` : ''}</li>
            ))}
          </ul>
          {['waiting_for_professional', 'accepted'].includes(booking.status) && (
            <button className="btn danger mt" onClick={showCancelPreview}>Cancel this Job (penalty preview)</button>
          )}
          <Link to="/professional" className="btn secondary small mt">Back</Link>
        </div>
        <div className="card">
          <h2>Chat (contact info is filtered)</h2>
          <p className="muted mb">Messages sirf is booking ke customer <b>{booking.customer_name}</b> ko jaate hain — kisi aur ko nahi.</p>
          <div className="chat-box">
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg ${m.sender_id === session.user.id ? 'mine' : 'theirs'} ${m.flagged ? 'flagged' : ''}`}>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{m.sender_name || m.sender_phone} · {String(m.created_at).slice(0, 16)}</div>
                {m.text}{m.flagged ? ' ⚠' : ''}
              </div>
            ))}
          </div>
          <input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Type a message…" />
          <button className="btn small mt" onClick={send}>Send</button>
        </div>
      </div>

      <CancelPreviewModal preview={cancelPreview} onConfirm={doCancel} onClose={() => setCancelPreview(null)} confirmLabel="Haan, Cancel (penalty lagegi)" />
    </Layout>
  );
}
