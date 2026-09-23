import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatusBadge, CancelPreviewModal } from '../components/ui';

export default function BookingDetail() {
  const { id } = useParams();
  const { session } = useApp();
  const token = session?.token;
  const [booking, setBooking] = useState(null);
  const [messages, setMessages] = useState([]);
  const [chatText, setChatText] = useState('');
  const [otp, setOtp] = useState('');
  const [review, setReview] = useState({ rating: 5, comment: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');
  const [cancelPreview, setCancelPreview] = useState(null);

  const showCancelPreview = async () => {
    setError('');
    try {
      setCancelPreview(await api.get(`/customer/bookings/${id}/cancel-preview`, token));
    } catch (e) { setError(e.message); }
  };

  const doCancel = async () => {
    setCancelPreview(null);
    await act(() => api.post(`/customer/bookings/${id}/cancel`, {}, token));
  };

  const load = async () => {
    try {
      setBooking(await api.get(`/customer/bookings/${id}`, token));
      setMessages(await api.get(`/customer/bookings/${id}/messages`, token));
    } catch (e) {
      setError(e.message);
    }
  };
  useEffect(() => { load(); }, [id]);

  const act = async (fn) => {
    setError(''); setMsg('');
    try {
      const res = await fn();
      if (res?.commission !== undefined) {
        setMsg(`Payment released! Commission Rs ${res.commission} · Professional received Rs ${res.payout}`);
      } else if (res) {
        setMsg(res.status ? `Status: ${res.status.replaceAll('_', ' ')}` : 'Done');
      }
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!booking) return <p className="muted">Loading…</p>;
  const s = booking.status;

  return (
    <Layout title={`Booking ${booking.booking_code}`} subtitle={`${booking.category_name} · ${booking.professional_name} · ${booking.scheduled_date} ${booking.scheduled_slot?.slice(0, 5)}`} actions={<StatusBadge status={s} />}>

      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-2">
        <div className="card">
          <h2>Job</h2>
          <p><b>Price:</b> {fmt(booking.final_price)} <span className="muted">(locked at booking)</span></p>
          <p><b>Address:</b> {booking.service_address || 'Saved address'}</p>
          <p className="muted">Description: {booking.description || '—'}</p>

          <h2 className="mt">Timeline</h2>
          <ul className="timeline">
            {(booking.timeline || []).map((e) => (
              <li key={e.id}>{e.event_type.replaceAll('_', ' ')} {e.note ? `— ${e.note}` : ''} <span className="muted">({e.created_at?.slice(0, 16)})</span></li>
            ))}
          </ul>
        </div>

        <div>
          <div className="card">
            <h2>Actions</h2>
            {s === 'pending_payment' && (
              <button className="btn" onClick={() => act(() => api.post(`/customer/bookings/${id}/pay`, {}, token))}>Pay Now (Escrow Hold {fmt(booking.final_price)})</button>
            )}
            {s === 'arrived' && (
              <>
                <p className="muted">Professional has arrived. Share the OTP shown below to start work.</p>
                <div className="alert warn">Your OTP: <b style={{ fontSize: 20 }}>{booking.otp_code}</b></div>
                <input placeholder="Enter OTP to confirm" value={otp} onChange={(e) => setOtp(e.target.value)} />
                <button className="btn" onClick={() => act(() => api.post(`/customer/bookings/${id}/confirm-arrival`, { otp }, token))}>Confirm Work Start</button>
              </>
            )}
            {s === 'work_completed' && (
              <>
                <p className="muted">Professional marked the job complete. Confirm to release payment, or report a problem.</p>
                <div className="row">
                  <button className="btn" onClick={() => act(() => api.post(`/customer/bookings/${id}/confirm-complete`, {}, token))}>
                    Yes, Confirm & Release {fmt(booking.final_price)}
                  </button>
                  <button className="btn danger" onClick={() => {
                    const reason = prompt('Describe the problem:');
                    if (reason) act(() => api.post(`/customer/bookings/${id}/dispute`, { description: reason }, token));
                  }}>Report a Problem</button>
                  <Link to={`/invoice/booking/${id}`} className="btn secondary">🧾 Invoice</Link>
                </div>
                <p className="muted mt">Note: if you don't respond within 24 hours, payment is auto-released to the professional.</p>
              </>
            )}
            {['completed'].includes(s) && (
              <>
                <label>Rate this service</label>
                <select value={review.rating} onChange={(e) => setReview({ ...review, rating: Number(e.target.value) })}>
                  {[5, 4, 3, 2, 1].map((r) => <option key={r} value={r}>{'★'.repeat(r)}</option>)}
                </select>
                <input placeholder="Comment (optional)" value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} />
                <button className="btn" onClick={() => act(() => api.post(`/customer/bookings/${id}/review`, review, token))}>Submit Review</button>
              </>
            )}
            {['waiting_for_professional', 'accepted'].includes(s) && (
              <>
                <button className="btn danger" onClick={showCancelPreview}>Cancel Booking (pehle preview dekhein)</button>
                <div className="alert info mt">
                  <b>Cancellation policy (Section 10.1):</b>
                  <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                    <li>Professional ne accept nahi kiya → <b>100% refund</b> turant wallet mein</li>
                    <li>Professional ne accept kar liya → <b>85% refund</b> (15% cut: 10% professional compensation + 5% platform — admin-configurable)</li>
                    <li>Professional cancel kare → <b>100% refund</b> + professional par 10% penalty (agli payout se auto-cut)</li>
                  </ul>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <h2>Chat (numbers hidden)</h2>
            <p className="muted mb">Aap ke messages sirf professional <b>{booking.professional_name}</b> ko jaate hain.</p>
            <div className="chat-box">
              {messages.length === 0 && <p className="muted">No messages yet. Keep conversation on-platform — sharing phone numbers/WhatsApp is flagged.</p>}
              {messages.map((m) => (
                <div key={m.id} className={`chat-msg ${m.sender_id === session.user.id ? 'mine' : 'theirs'} ${m.flagged ? 'flagged' : ''}`}>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>{m.sender_name || m.sender_phone} ({m.sender_role || ''}) · {String(m.created_at).slice(0, 16)}</div>
                  {m.text}
                  {m.flagged ? ' ⚠' : ''}
                </div>
              ))}
            </div>
            <input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Type a message…" />
            <button className="btn small mt" onClick={() => { if (chatText.trim()) { act(() => api.post(`/customer/bookings/${id}/messages`, { text: chatText }, token)); setChatText(''); } }}>Send</button>
          </div>
        </div>
      </div>

      <CancelPreviewModal preview={cancelPreview} onConfirm={doCancel} onClose={() => setCancelPreview(null)} confirmLabel="Haan, Cancel Karein (refund wallet mein)" />
    </Layout>
  );
}
