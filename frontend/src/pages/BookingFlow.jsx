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
  const [form, setForm] = useState({ category_id: '', area: '', date: '', slot_time: '', address_id: '', description: '', final_price: '' });
  const [error, setError] = useState('');
  const [created, setCreated] = useState(null);

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
      if (form.date && form.slot_time) { params.set('date', form.date); params.set('slot_time', form.slot_time + ':00'); }
      const results = await api.get(`/customer/professionals/search?${params}`, token);
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
    <Layout title="Book a Service" subtitle="Search verified professionals, pick a slot, secure the deal — full protection">
      <Steps steps={['What & Where', 'Choose Professional', 'Confirm & Price', 'Secure Payment']} current={step - 1} />
      {error && <div className="alert error">{error}</div>}

      {step === 1 && (
        <div className="card">
          <h2>1. What do you need?</h2>
          <label>Category</label>
          <select value={form.category_id} onChange={(e) => setForm({ ...form, category_id: e.target.value })}>
            <option value="">Select category</option>
            {categories.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <label>Area</label>
          <input value={form.area} onChange={(e) => setForm({ ...form, area: e.target.value })} placeholder="e.g. Gulberg III" />
          <label>Date (optional — to filter by slot)</label>
          <input type="date" value={form.date} onChange={(e) => setForm({ ...form, date: e.target.value })} />
          <label>Time slot (optional)</label>
          <select value={form.slot_time} onChange={(e) => setForm({ ...form, slot_time: e.target.value })}>
            <option value="">Any</option>
            {['09', '11', '13', '15'].map((h) => <option key={h} value={h}>{h}:00</option>)}
          </select>
          <button className="btn" onClick={search}>Search Professionals</button>
        </div>
      )}

      {step === 2 && (
        <div className="card">
          <h2>2. Choose a Professional</h2>
          {pros.length === 0 && <p className="muted">No professionals found — try another area/category.</p>}
          <div className="grid cols-2">
            {pros.map((p) => (
              <div className="card" key={p.id}>
                <div className="row spread">
                  <h3>{p.full_name} <span className="badge verified">Verified</span></h3>
                  <span className="muted">★ {p.average_rating} · {p.completed_jobs} jobs</span>
                </div>
                <p className="muted">{p.bio}</p>
                <p className="muted">Areas: {p.areas} · {p.experience_years}y exp</p>
                <button className="btn small" onClick={() => openPro(p)}>Select</button>
              </div>
            ))}
          </div>
        </div>
      )}

      {step === 3 && pro && (
        <div className="card">
          <h2>3. Confirm Details — {pro.full_name}</h2>
          <p className="muted mb">📍 Service location map (address pin se confirm karein):</p>
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
          <label>Final Price (Rs) — locked at booking time</label>
          <input type="number" value={form.final_price} onChange={(e) => setForm({ ...form, final_price: e.target.value })} />
          <button className="btn" onClick={create} disabled={!form.date || !form.final_price}>Create Booking</button>
        </div>
      )}

      {step === 4 && created && (
        <div className="card">
          <h2>4. Secure the Payment</h2>
          <div className="alert warn">
            Wallet balance: <b>{fmt(created.wallet_balance)}</b> — required: <b>{fmt(created.wallet_sufficient ? 'sufficient' : 'more funds needed')}</b>
          </div>
          <p>
            On <b>Pay Now</b>, the full amount moves from your wallet balance to <b>escrow (held)</b>. The professional
            can't receive it until you confirm the job is complete (or 24h auto-release).
          </p>
          <button className="btn" onClick={pay}>Pay Now (Escrow Hold)</button>
        </div>
      )}
    </Layout>
  );
}
