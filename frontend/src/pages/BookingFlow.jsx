import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmt } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { Steps } from '../components/ui';
import MapPicker from '../components/MapPicker';

export default function BookingFlow() {
  const { session } = useApp();
  const navigate = useNavigate();
  const token = session?.token;
  const [step, setStep] = useState(1);
  const [categories, setCategories] = useState([]);
  const [pros, setPros] = useState([]);
  const [pro, setPro] = useState(null);
  const [slots, setSlots] = useState([]);
  const [addresses, setAddresses] = useState([]);
  const [form, setForm] = useState({ category_id: '', area: '', date: '', slot_time: '', address_id: '', description: '', final_price: '', is_urgent: false });
  const [addingAddress, setAddingAddress] = useState(false);
  const [addrForm, setAddrForm] = useState({ label: 'home', area: '', full_address: '', latitude: '', longitude: '' });
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);
  const [fallbackUsed, setFallbackUsed] = useState(false);

  const saveInlineAddress = async () => {
    setError('');
    try {
      const saved = await api.post('/customer/me/addresses', {
        ...addrForm,
        latitude: addrForm.latitude ? Number(addrForm.latitude) : null,
        longitude: addrForm.longitude ? Number(addrForm.longitude) : null,
      }, token);
      const fresh = await api.get('/customer/me/addresses', token);
      setAddresses(fresh);
      setForm((f) => ({ ...f, address_id: String(saved.id) }));
      setAddingAddress(false);
    } catch (e) { setError(e.message); }
  };

  useEffect(() => {
    api.get('/customer/categories').then(setCategories).catch(() => {});
    if (token) api.get('/customer/me/addresses', token).then(setAddresses).catch(() => {});
  }, []);

  const search = async () => {
    setError('');
    try {
      const params = new URLSearchParams();
      if (form.category_id) params.set('category_id', form.category_id);
      if (form.area) params.set('area', form.area);
      if (form.is_urgent) params.set('urgent', '1');
      if (form.date && form.slot_time) { params.set('date', form.date); params.set('slot_time', form.slot_time + ':00'); }
      let results = await api.get(`/customer/professionals/search?${params}`, token);
      setFallbackUsed(false);
      if (!results.length) {
        // Fallback: is area mein koi nahi to saare verified pros (same category pehle) dikhao
        results = await api.get(`/customer/professionals/search?${form.category_id ? `category_id=${form.category_id}` : ''}`, token);
        setFallbackUsed(true);
      }
      setPros(results);
      setStep(2);
    } catch (e) {
      setError(e.message);
    }
  };

  const openPro = async (p) => {
    setPro(p);
    const detail = await api.get(`/customer/professionals/${p.id}`, token);
    setSlots(detail.availability || []);
    setStep(3);
  };

  const create = async () => {
    setError('');
    try {
      const res = await api.post('/customer/bookings', {
        professional_id: pro.id,
        category_id: Number(form.category_id),
        address_id: form.address_id ? Number(form.address_id) : null,
        scheduled_date: form.date,
        scheduled_slot: form.slot_time + ':00',
        description: form.description,
        final_price: Number(form.final_price),
      }, token);
      setCreated(res);
      setStep(4);
    } catch (e) {
      setError(e.message);
    }
  };

  const pay = async () => {
    setError('');
    try {
      await api.post(`/customer/bookings/${created.booking_id}/pay`, {}, token);
      navigate(`/bookings/${created.booking_id}`);
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <Layout title="Book a Service" subtitle="Describe the job, pick a verified provider, confirm the price — your money stays escrow-protected until the work is done.">
      <Steps steps={['What & Where', 'Choose Professional', 'Confirm & Price', 'Secure Payment']} current={step - 1} />
      {error && <div className="alert error">{error}</div>}

      {step === 1 && (
        <div className="card">
          <h2>1. What do you need?</h2>
          <p className="muted" style={{ fontSize: 13, marginTop: -6 }}>
            Tell us the service and where you need it. Next, you will pick a verified provider and a time slot: nothing is charged until you confirm the price.
          </p>
          <label>Category</label>
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
            <option value="">Select category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label>Area</label>
          <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="e.g. Gulberg III" />
          <label>Date (optional: to filter by slot)</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <label>Time slot (optional)</label>
          <select value={form.slot_time} onChange={(e) => setForm({ ...form, slot_time: e.target.value })}>
            <option value="">Any</option>
            {['09', '11', '13', '15'].map((h) => <option key={h} value={h}>{h}:00</option>)}
          </select>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontWeight: 500 }}>
            <input type="checkbox" checked={form.is_urgent} onChange={(e) => setForm({ ...form, is_urgent: e.target.checked })} style={{ width: 'auto', margin: 0 }} />
            ⚡ Urgent / ASAP: show only professionals available right now
          </label>
          <label>Job details (the provider sees this: what needs to be done, number of rooms/units, etc.)</label>
          <textarea rows={3} value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="e.g. Fix wiring in 2 rooms and install 3 fans; I already have the material" />
          <label>Your budget expectation (optional: the provider can send a counter-offer)</label>
          <input type="number" value={form.final_price} onChange={(e) => setForm({ ...form, final_price: e.target.value })} placeholder="e.g. 3000" style={{ maxWidth: 220 }} />
          <button className="btn" onClick={search}>🔍 Search Professionals</button>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h2>2. Choose a Professional</h2>
          {fallbackUsed && (
            <div className="alert warn">No professional is currently available in this area: check these <b>verified professionals</b> (in your category), or change the area and search again.</div>
          )}
          {!pros.length && <p className="muted">No verified professional found: try again without the category filter.</p>}
          <div className="grid cols-2">
            {pros.map((p) => (
              <div className="card" key={p.id}>
                <div className="row spread">
                  <h3>{p.full_name} <span className="badge verified">✓ Verified</span></h3>
                  <span className="muted">★ {p.average_rating} · {p.completed_jobs} jobs</span>
                </div>
                <p className="muted">{p.bio}</p>
                <p className="muted">Areas: {p.areas || 'Lahore'} · {p.experience_years}y exp</p>
                {p.available_now === 1 && <span className="badge status">⚡ Available Now</span>}
                <div className="row mt">
                  <button className="btn small" onClick={() => openPro(p)}>Select & Continue →</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 3 && pro && (
        <div className="card">
          <h2>3. Confirm Details — {pro.full_name}</h2>
          {addresses.length === 0 && (
            <div className="alert warn">
              📍 <b>No saved address yet.</b> Your service address is where the provider will come: add it once (with a map pin) and it will appear here automatically for every booking.
              <div style={{ marginTop: 10 }}>
                {addingAddress ? (
                  <div style={{ maxWidth: 520 }}>
                    <label>Label</label>
                    <select value={addrForm.label} onChange={(e) => setAddrForm({ ...addrForm, label: e.target.value })}>
                      {['home', 'work', 'other'].map((l) => <option key={l} value={l}>{l.charAt(0).toUpperCase() + l.slice(1)}</option>)}
                    </select>
                    <label>Area</label>
                    <input value={addrForm.area} onChange={(e) => setAddrForm({ ...addrForm, area: e.target.value })} placeholder="e.g. Gulberg III" />
                    <label>Full Address</label>
                    <textarea rows={2} value={addrForm.full_address} onChange={(e) => setAddrForm({ ...addrForm, full_address: e.target.value })} placeholder="House/flat, street, landmark…" />
                    <p className="muted" style={{ fontSize: 13 }}>💡 Tap the map to drop the pin at your exact location: this is where the provider will navigate.</p>
                    <MapPicker lat={addrForm.latitude ? Number(addrForm.latitude) : null} lng={addrForm.longitude ? Number(addrForm.longitude) : null} onChange={(la, ln) => setAddrForm((f) => ({ ...f, latitude: String(la), longitude: String(ln) }))} height={220} />
                    <div className="row">
                      <button className="btn" onClick={saveInlineAddress} disabled={!addrForm.full_address?.trim()}>Save Address</button>
                      <button className="btn secondary" onClick={() => setAddingAddress(false)}>Cancel</button>
                    </div>
                  </div>
                ) : (
                  <button className="btn" onClick={() => setAddingAddress(true)}>📍 Add Address Now</button>
                )}
              </div>
            </div>
          )}
          {addresses.length > 0 && !form.address_id && (
            <div className="alert info">📍 Select your service address: the map pin preview appears below.</div>
          )}
          <p className="muted mb">📍 Service location map (confirmed from the address pin):</p>
          <MapPicker
            lat={addresses.find((a) => String(a.id) === String(form.address_id))?.latitude ?? null}
            lng={addresses.find((a) => String(a.id) === String(form.address_id))?.longitude ?? null}
            height={240}
 />
          <label>Available Slots</label>
          <div className="row mb">
            {slots.slice(0, 12).map((s) => (
              <button
                key={s.id}
                className={`btn small ${form.date === s.slot_date && form.slot_time === s.start_time.slice(0, 5) ? '' : 'secondary'}`}
                onClick={() => setForm({ ...form, date: s.slot_date, slot_time: s.start_time.slice(0, 5) })}
              >
                {s.slot_date} {s.start_time.slice(0, 5)}
              </button>
            ))}
          </div>
          <label>Service Address</label>
          <select value={form.address_id} onChange={(e) => setForm({ ...form, address_id: e.target.value })}>
            <option value="">Select saved address</option>
            {addresses.map((a) => <option key={a.id} value={a.id}>{a.label} — {a.full_address}</option>)}
          </select>
          <label>Work Description</label>
          <textarea value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} rows={2} />
          <label>Final Price (Rs): locked at booking time</label>
          <input type="number" value={form.final_price} onChange={(e) => setForm({ ...form, final_price: e.target.value })} />
          <button className="btn" onClick={create} disabled={!form.date || !form.final_price || !form.address_id}>Create Booking</button>
        </div>
      )}

      {step === 4 && created && (
        <div className="card">
          <h2>4. Secure the Payment</h2>
          <div className="alert warn">
            Wallet balance: <b>{fmt(created.wallet_balance)}</b> — required: <b>{fmt(Number(created.final_price || form.final_price) || 0)}</b>
          </div>
          {!created.wallet_sufficient && (
            <div className="alert error">
              ⚠ Wallet balance is not enough! Add money first —
              <a href="/customer/wallet" className="btn small" style={{ marginLeft: 10 }}>👛 Add money to wallet (JazzCash/Easypaisa)</a>
            </div>
          )}
          <p>
            On <b>Pay Now</b>, the full amount moves from your wallet balance to <b>escrow (held)</b>. The professional
            can't receive it until you confirm the job is complete (or 24h auto-release).
          </p>
          <button className="btn" onClick={pay} disabled={!created.wallet_sufficient} title={created.wallet_sufficient ? '' : 'Add money to your wallet first'}>Pay Now (Escrow Hold)</button>
        </div>
      )}
    </Layout>
  );
}
