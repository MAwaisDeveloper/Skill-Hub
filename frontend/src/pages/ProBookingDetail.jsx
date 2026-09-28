import React, { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { StatusBadge, CancelPreviewModal, DirBadge, Amt } from '../components/ui';
import LiveMap from '../components/LiveMap';
import { ProIdentityCard } from './ProfessionalOverview';

// "Kaam KARWAYE wala = Customer, kaam KARNE wala = Professional" — booking header
// dono identities dikhati hai: customer (name+phone) + professional (name+photo+phone)

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
  const [offerForm, setOfferForm] = useState({ offered_price: '', message: '', arrival_minutes: '' });
  const [lateForm, setLateForm] = useState({ reason: '', new_eta_minutes: '' });
  const [showLate, setShowLate] = useState(false);

  // Chat auto-refresh (5s) jab tak booking active hai — booking load na ho (session
  // mismatch/403) to poll NAHI chalate, warna page 'Loading…' par atakta lagta hai
  useEffect(() => {
    if (booking && !['completed', 'cancelled', 'refunded', 'disputed'].includes(booking.status)) {
      const t = setInterval(() => {
        api.get(`/professional/bookings/${id}/messages`, token).then(setMessages).catch(() => {});
      }, 5000);
      return () => clearInterval(t);
    }
  }, [id, token, booking?.status]);

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
        ? `Booking cancelled. The customer received a refund of Rs ${res.refund ?? 'full'}. A penalty of Rs ${res.penalty_recorded} was recorded against you — it will be auto-deducted from your next payout.`
        : 'Booking cancelled — the customer received a full refund (no penalty).');
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

  const actAccept = async () => {
    setError(''); setMsg('');
    try {
      await api.post(`/professional/bookings/${id}/accept`, { arrival_minutes: offerForm.arrival_minutes ? Number(offerForm.arrival_minutes) : undefined }, token);
      setMsg('Job accept ho gayi! Customer ko ETA bata di gayi hai.');
      await load();
    } catch (e) { setError(e.message); }
  };

  const actOffer = async () => {
    setError(''); setMsg('');
    try {
      await api.post(`/professional/bookings/${id}/offer`, {
        offered_price: Number(offerForm.offered_price),
        message: offerForm.message,
        arrival_minutes: offerForm.arrival_minutes ? Number(offerForm.arrival_minutes) : undefined,
      }, token);
      setMsg('Offer bhej di gayi — customer accept karega to deal finalize ho jayegi.');
      await load();
    } catch (e) { setError(e.message); }
  };

  const actLateNotify = async () => {
    setError(''); setMsg('');
    try {
      await api.post(`/professional/bookings/${id}/late-notify`, lateForm, token);
      setMsg('Customer ko late notification chali gayi.');
      setShowLate(false);
      await load();
    } catch (e) { setError(e.message); }
  };

  const actStatus = async (status) => {
    setError(''); setMsg('');
    try {
      await api.post(`/professional/bookings/${id}/status`, { status }, token);
      await load();
    } catch (e) { setError(e.message); }
  };

  if (!booking) return <p className="muted">{error || 'Loading…'}</p>;

  return (
    <Layout title={`Job ${booking.booking_code}`} subtitle={`${booking.category_name} · ${booking.customer_name} · ${fmt(booking.final_price)} (you earn ${fmt(Number(booking.final_price) * 0.9)})`} actions={<StatusBadge status={booking.status} />}>
      {msg && <div className="alert warn">{msg}</div>}

      <ProIdentityCard profile={{ full_name: booking.customer_name, profile_photo: booking.customer_photo, trust_score: booking.customer_trust_score }} phone={booking.customer_phone} />
      <p className="muted" style={{ marginTop: -10, marginBottom: 12, fontSize: 12.5 }}>↑ Kaam <b>karwaye wala = Customer</b> ({booking.customer_name}) · Aap professional hain — is kaam ko aap karenge.</p>
      {error && <div className="alert error">{error}</div>}

      <div className="grid cols-2">
        <div className="card">
          <h2>Job Details</h2>
          <p><b>Address:</b> {booking.customer_address || '—'}</p>
          <p className="muted">{booking.description}</p>
          <div className="divider" />
          <h2 style={{ marginBottom: 6 }}>🤝 Trust</h2>
          <p style={{ fontSize: 13.5 }}><b>{booking.customer_name}</b> · Trust Score <b style={{ color: 'var(--green-dark)' }}>{Number(booking.customer_trust_score ?? 100)}</b>/100 · {booking.customer_completed_jobs ?? 0} completed bookings</p>
          <p className="muted" style={{ fontSize: 13 }}>Aap ka trust score: <b>{Number(booking.my_trust_score ?? 100)}</b>/100 — customer verified hai; payment escrow mein already held hai.</p>

          {/* Accept with arrival promise */}
          {booking.status === 'waiting_for_professional' && booking.offer_status !== 'pending' && (
            <div className="mt">
              <label>Promise an ETA on accept: how many minutes until you arrive?</label>
              <input type="number" value={offerForm.arrival_minutes} onChange={(e) => setOfferForm({ ...offerForm, arrival_minutes: e.target.value })} placeholder="e.g. 45" style={{ maxWidth: 140 }} />
              <button className="btn" onClick={() => actAccept()}>✓ Accept Job (with ETA)</button>
            </div>
          )}

          {/* Counter-offer: apni price batao */}
          {booking.status === 'waiting_for_professional' && booking.offer_status !== 'pending' && (
            <div className="mt" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              <h2>💼 Apni Price Offer Karein (Counter-quote)</h2>
              <p className="muted">The customer's budget is {fmt(booking.final_price)} — if you want a different price, send an offer; once the customer accepts, the deal is finalized.</p>
              <div className="row">
                <input type="number" placeholder="Your price (Rs)" style={{ maxWidth: 160 }} value={offerForm.offered_price} onChange={(e) => setOfferForm({ ...offerForm, offered_price: e.target.value })} />
                <input placeholder="ETA minutes (optional)" type="number" style={{ maxWidth: 140 }} value={offerForm.arrival_minutes} onChange={(e) => setOfferForm({ ...offerForm, arrival_minutes: e.target.value })} />
              </div>
              <input placeholder="Message (e.g. 'Material is charged separately; I will arrive in 45 minutes')" value={offerForm.message} onChange={(e) => setOfferForm({ ...offerForm, message: e.target.value })} className="mt" />
              <button className="btn secondary mt" onClick={actOffer}>Offer Bhejein</button>
            </div>
          )}
          {booking.offer_status === 'pending' && (
            <div className="alert warn mt">⏳ Aap ka offer Rs {Number(booking.offered_price).toLocaleString()} customer ke pass pending hai…</div>
          )}
          {booking.offer_status === 'accepted' && <div className="alert success mt">✓ Offer accepted: deal Rs {Number(booking.final_price).toLocaleString()} par finalize</div>}

          {/* Late notify */}
          {['accepted', 'on_the_way'].includes(booking.status) && (
            <div className="mt" style={{ borderTop: '1px solid var(--border)', paddingTop: 12 }}>
              {!booking.late_notified ? (
                <>
                  {!showLate ? (
                    <button className="btn secondary small" onClick={() => setShowLate(true)}>⏰ Late Ho Raha Hoon: Customer Ko Batao</button>
                  ) : (
                    <>
                      <input placeholder="Reason (e.g. traffic, previous job lamba chala)" value={lateForm.reason} onChange={(e) => setLateForm({ ...lateForm, reason: e.target.value })} />
                      <div className="row mt">
                        <input type="number" placeholder="Naya ETA (min)" style={{ maxWidth: 140 }} value={lateForm.new_eta_minutes} onChange={(e) => setLateForm({ ...lateForm, new_eta_minutes: e.target.value })} />
                        <button className="btn small" onClick={actLateNotify}>Notify Customer</button>
                      </div>
                    </>
                  )}
                  <p className="muted" style={{ fontSize: 12 }}>If the customer approves, nobody's money is deducted. Without approval, the customer can take a 100% refund and a 10% penalty applies to you.</p>
                </>
              ) : (
                <div className={`alert ${booking.late_approved ? 'success' : 'warn'}`}>
                  {booking.late_approved ? '✓ Customer approved the late arrival — no penalty will apply' : '⏳ Late notification is pending with the customer…'}
                </div>
              )}
            </div>
          )}

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
          <p className="muted mb">Messages go only to this booking's customer, <b>{booking.customer_name}</b> — nobody else.</p>
          <div className="chat-box">
            {messages.map((m) => (
              <div key={m.id} className={`chat-msg ${m.sender_id === session.user.id ? 'mine' : 'theirs'} ${m.flagged ? 'flagged' : ''}`}>
                <div style={{ fontSize: 11, opacity: 0.8 }}>{m.sender_name || m.sender_phone} · {String(m.created_at).slice(11, 16)}</div>
                {m.text}{m.flagged ? ' ⚠' : ''}
              </div>
            ))}
          </div>
          <input value={chatText} onChange={(e) => setChatText(e.target.value)} placeholder="Message likhein…" onKeyDown={(e) => e.key === 'Enter' && send()} />
          <button className="btn small mt" onClick={send}>Send</button>
        </div>
      </div>

      {/* Status advance buttons */}
      {['accepted', 'on_the_way', 'arrived', 'work_started'].includes(booking.status) && (
        <div className="card">
          <h2>Job Progress</h2>
          <div className="row">
            {booking.status === 'accepted' && <button className="btn" onClick={() => actStatus('on_the_way')}>🛵 On The Way</button>}
            {booking.status === 'on_the_way' && <button className="btn" onClick={() => actStatus('arrived')}>📍 Arrived (OTP mangen)</button>}
            {booking.status === 'work_started' && <button className="btn" onClick={() => actStatus('work_completed')}>✅ Work Complete</button>}
          </div>
          <p className="muted mt">{booking.status === 'arrived' ? 'Collect the OTP from the customer — they confirm it, then work starts.' : 'Status changes are sent to the customer as a notification.'}</p>
        </div>
      )}

      {/* Live location tracking */}
      {['accepted', 'on_the_way', 'arrived', 'work_started'].includes(booking.status) && (
        <LiveMap booking={booking} role="professional" token={token} onUpdate={load} />
      )}

      <CancelPreviewModal preview={cancelPreview} onConfirm={doCancel} onClose={() => setCancelPreview(null)} confirmLabel="Haan, Cancel (penalty lagegi)" />
    </Layout>
  );
}
