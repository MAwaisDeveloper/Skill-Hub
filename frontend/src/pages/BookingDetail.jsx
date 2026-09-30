import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatusBadge, CancelPreviewModal, DisputeModal } from '../components/ui';
import LiveMap from '../components/LiveMap';

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
  const [reviewMsg, setReviewMsg] = useState('');
  const [cancelPreview, setCancelPreview] = useState(null);
  const [disputeModal, setDisputeModal] = useState(false);
  const [disputeBusy, setDisputeBusy] = useState(false);

  // Chat auto-refresh (5s) jab tak booking active hai — booking load na ho (session
  // mismatch/403) to poll NAHI chalate, warna page 'Loading…' par atakta lagta hai
  useEffect(() => {
    if (booking && !['completed', 'cancelled', 'refunded', 'disputed'].includes(booking.status)) {
      const t = setInterval(() => {
        api.get(`/customer/bookings/${id}/messages`, token).then(setMessages).catch(() => {});
      }, 5000);
      return () => clearInterval(t);
    }
  }, [id, token, booking?.status]);

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

  const doDispute = async ({ reason, description }) => {
    setDisputeBusy(true);
    setError(''); setMsg('');
    try {
      await api.post(`/customer/bookings/${id}/dispute`, { description: `[${reason}] ${description}` }, token);
      setDisputeModal(false);
      setMsg('🚩 Report submitted — your payment stays safely in escrow while an administrator reviews the case.');
      await load();
    } catch (e) {
      setError(e.message);
    } finally {
      setDisputeBusy(false);
    }
  };

  const doReview = async () => {
    setError(''); setMsg(''); setReviewMsg('');
    try {
      await api.post(`/customer/bookings/${id}/review`, review, token);
      setReviewMsg(`★ Thank you! Your ${review.rating}-star review has been saved — the provider has been notified.`);
      await load();
    } catch (e) {
      setError(e.message);
    }
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
        setMsg(`Payment released! Service Charges Rs ${res.commission} · Professional received Rs ${res.payout}`);
      } else if (res) {
        setMsg(res.status ? `Status: ${res.status.replaceAll('_', ' ')}` : 'Done');
      }
      await load();
    } catch (e) {
      setError(e.message);
    }
  };

  if (!booking) return <p className="muted">{error || 'Loading…'}</p>;
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
          <div className="divider" />
          <h2 style={{ marginBottom: 6 }}>🤝 Trust</h2>
          <p style={{ fontSize: 13.5 }}><b>{booking.professional_name}</b> · Trust Score <b style={{ color: 'var(--green-dark)' }}>{Number(booking.professional_trust_score ?? 100)}</b>/100
            {' · '}★ {booking.average_rating} · {booking.professional_completed_jobs ?? 0} jobs
            {booking.professional_areas && <span className="muted"> · areas: {booking.professional_areas}</span>}</p>
          <p className="muted" style={{ fontSize: 13 }}>Your trust score: <b>{Number(booking.my_trust_score ?? 100)}</b>/100 — both parties are verified; there is no need to share phone numbers, chat right here.</p>

          <h2 className="mt">Timeline</h2>
          <ul className="timeline">
            {(booking.timeline || []).map((e) => (
              <li key={e.id}>{e.event_type.replaceAll('_', ' ')} {e.note ? `— ${e.note}` : ''} <span className="muted">({e.created_at?.slice(0, 16)})</span></li>
            ))}
          </ul>
        </div>

        <div>
          {/* Offer from professional — accept = deal finalize */}
          {s === 'waiting_for_professional' && booking.offer_status === 'pending' && (
            <div className="card" style={{ borderLeft: '4px solid var(--gold)' }}>
              <h2>💼 Professional ka Offer</h2>
              <p style={{ fontSize: 18 }}><b>{booking.professional_name}</b> ne kaam ke liye <b>Rs {Number(booking.offered_price).toLocaleString()}</b> bola hai</p>
              {booking.offer_message && <div className="alert info">"{booking.offer_message}"</div>}
              {booking.arrival_minutes && <p className="muted">ETA: {booking.arrival_minutes} min</p>}
              <div className="row">
                <button className="btn" onClick={() => act(() => api.post(`/customer/bookings/${id}/offer/respond`, { accept: true }, token))}>✓ Accept Offer (Deal)</button>
                <button className="btn danger" onClick={() => act(() => api.post(`/customer/bookings/${id}/offer/respond`, { accept: false }, token))}>✗ Reject</button>
              </div>
              {Number(booking.offered_price) !== Number(booking.final_price) && (
                <p className="muted mt">On accept, the price updates from {fmt(booking.final_price)} → {fmt(booking.offered_price)}, then the escrow hold is placed.</p>
              )}
            </div>
          )}

          {/* Late arrival request — approve to kisi ke paise nahi katte */}
          {['accepted', 'on_the_way'].includes(s) && booking.late_notified === 1 && booking.late_approved === 0 && (
            <div className="card" style={{ borderLeft: '4px solid var(--danger)' }}>
              <h2>⏰ Professional Late Hai</h2>
              <p>The professional has informed you they will arrive late. Approve or cancel:</p>
              <ul style={{ paddingLeft: 18 }}>
                <li><b>Approve:</b> the job continues as planned — <b>nobody's money is deducted</b> (only the normal free platform offer applies at release)</li>
                <li><b>Cancel:</b> you receive a <b>100% refund</b>, and a 10% penalty is recorded against the professional</li>
              </ul>
              <div className="row">
                <button className="btn" onClick={() => act(() => api.post(`/customer/bookings/${id}/late-approve`, {}, token))}>✓ Theek Hai, Aa Jayen</button>
                <button className="btn danger" onClick={showCancelPreview}>Cancel (100% Refund)</button>
              </div>
            </div>
          )}

          {/* Cancelled bookings: paison ka hisaab — kya kata, kya wapas aaya */}
          {s === 'cancelled' && booking.cancel_summary && (
            <div className="card" style={{ borderLeft: '4px solid var(--danger)' }}>
              <h2>💸 Cancellation Summary</h2>
              {booking.cancel_summary.cancelled_by === 'professional' && (
                <div className="alert info">The provider cancelled this booking: your full payment has been refunded to your wallet.</div>
               )}
              <p className="muted mb" style={{ fontSize: 13 }}>
                {booking.cancel_summary.note || 'Escrow has been settled.'}
              </p>
              <table>
                <tbody>
                  {booking.cancel_summary.held_amount > 0 ? (
                    <>
                      <tr><td>Escrow mein held (pay kiya tha)</td><td>{fmt(booking.cancel_summary.held_amount)}</td></tr>
                      <tr>
                        <td>{booking.cancel_summary.refund_percent === 100 ? 'Wapas aaya (100% refund)' : `Wapas aaya (${booking.cancel_summary.refund_percent}% refund)`}</td>
                        <td className="td-amt-in">+ {fmt(booking.cancel_summary.refund_amount)} <span className="muted">wallet mein</span></td>
                      </tr>
                      {booking.cancel_summary.cut_total > 0 && (
                        <tr><td>Kata gaya (cancellation cut, {100 - booking.cancel_summary.refund_percent}%)</td><td className="td-amt-out">− {fmt(booking.cancel_summary.cut_total)}</td></tr>
                      )}
                      {booking.cancel_summary.cut_breakdown && (
                        <tr><td style={{ paddingLeft: 18 }}>→ Professional compensation</td><td>{fmt(booking.cancel_summary.cut_breakdown.professional_compensation)}</td></tr>
                      )}
                      {booking.cancel_summary.cut_breakdown && (
                        <tr><td style={{ paddingLeft: 18 }}>→ Platform share</td><td>{fmt(booking.cancel_summary.cut_breakdown.platform_share)}</td></tr>
                      )}
                    </>
                  ) : (
                    <tr><td>No payment was made</td><td>Rs 0 (nothing was charged)</td></tr>
                  )}
                </tbody>
              </table>
              {booking.cancel_summary.held_amount > 0 && booking.cancel_summary.refund_amount > 0 && (
                <Link to="/customer/wallet/statement" className="muted" style={{ fontSize: 13 }}>→ View the refund entry in your transaction history</Link>
              )}
            </div>
          )}

          <div className="card">
            <h2>Actions</h2>
            {s === 'pending_payment' && (
              <>
                <button className="btn" onClick={() => act(() => api.post(`/customer/bookings/${id}/pay`, {}, token))}>Pay Now (Escrow Hold {fmt(booking.final_price)})</button>
                <button className="btn danger" onClick={showCancelPreview}>Cancel Booking (nothing will be charged)</button>
              </>
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
                  <button className="btn danger" onClick={() => setDisputeModal(true)}>Report a Problem</button>
                  <Link to={`/invoice/booking/${id}`} className="btn secondary">🧾 Invoice</Link>
                </div>
                <p className="muted mt">Note: if you don't respond within 24 hours, payment is auto-released to the professional.</p>
              </>
            )}
            {['completed'].includes(s) && (
              <>
                {reviewMsg && <div className="alert success" role="status">{reviewMsg}</div>}
                <label>Rate this service</label>
                <div className="star-row" role="radiogroup" aria-label="Rating">
                  {[1, 2, 3, 4, 5].map((r) => (
                    <button
                      key={r}
                      type="button"
                      className={`star-btn ${r <= review.rating ? 'active' : ''}`}
                      onClick={() => setReview({ ...review, rating: r })}
                      aria-label={`${r} star`}
                    >★</button>
                  ))}
                  <b className="star-num">{review.rating}/5</b>
                </div>
                <label>Comment</label>
                <textarea rows={3} placeholder="Share your experience — quality of work, punctuality, communication…" value={review.comment} onChange={(e) => setReview({ ...review, comment: e.target.value })} />
                <button className="btn" onClick={doReview}>Submit Review</button>
              </>
            )}
            {['waiting_for_professional', 'accepted'].includes(s) && (
              <>
                <button className="btn danger" onClick={showCancelPreview}>Cancel Booking (see preview first)</button>
                <div className="alert info mt">
                  <b>Cancellation policy (Section 10.1):</b>
                  <ul style={{ paddingLeft: 18, marginTop: 6 }}>
                    <li>Professional has not accepted → <b>100% refund</b> to your wallet instantly</li>
                    <li>Professional has accepted → <b>85% refund</b> (15% cut: 10% professional compensation + 5% platform: admin-configurable)</li>
                    <li>Professional cancel kare → <b>100% refund</b> + professional par 10% penalty (agli payout se auto-cut)</li>
                  </ul>
                </div>
              </>
            )}
          </div>

          <div className="card">
            <h2>Chat (numbers hidden)</h2>
            <p className="muted mb">Your messages go only to the professional, <b>{booking.professional_name}</b>.</p>
            <div className="chat-box">
              {messages.length === 0 && <p className="muted">No messages yet. Keep conversation on-platform: sharing phone numbers/WhatsApp is flagged.</p>}
              {messages.map((m) => (
                <div key={m.id} className={`chat-msg ${m.sender_id === session.user.id ? 'mine' : 'theirs'} ${m.flagged ? 'flagged' : ''}`}>
                  <div style={{ fontSize: 11, opacity: 0.8 }}>{m.sender_name || m.sender_phone} ({m.sender_role || ''}) · {String(m.created_at).slice(11, 16)}</div>
                  {m.text}
                  {m.flagged ? ' ⚠' : ''}
                </div>
              ))}
            </div>
            <input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Type your message…" onKeyDown={(e) => { if (e.key === 'Enter' && chatText.trim()) { act(() => api.post(`/customer/bookings/${id}/messages`, { text: chatText }, token)); setChatText(''); } }} />
            <button className="btn small mt" onClick={() => { if (chatText.trim()) { act(() => api.post(`/customer/bookings/${id}/messages`, { text: chatText }, token)); setChatText(''); } }}>Send</button>
          </div>
        </div>
      </div>

      {/* Live location tracking (deal hone ke baad) */}
      {['accepted', 'on_the_way', 'arrived', 'work_started'].includes(s) && (
        <LiveMap booking={booking} role="customer" token={token} onUpdate={load} />
      )}

      <CancelPreviewModal preview={cancelPreview} onConfirm={doCancel} onClose={() => setCancelPreview(null)} confirmLabel="Yes, Cancel & Refund to Wallet" />
      <DisputeModal bookingCode={disputeModal ? booking?.booking_code : null} onSubmit={doDispute} onClose={() => setDisputeModal(false)} busy={disputeBusy} />
    </Layout>
  );
}
