import React, { useEffect, useState } from 'react';
import { api } from '../api';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { Empty } from '../components/ui';

export default function ProSlots() {
  const { session } = useApp();
  const token = session?.token;
  const [slots, setSlots] = useState([]);
  const [form, setForm] = useState({ slot_date: '', start_time: '', end_time: '' });
  const [msg, setMsg] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    try { setSlots(await api.get('/professional/me/slots', token)); } catch (e) { setError(e.message); }
  };
  useEffect(() => { load(); }, []);

  const add = async () => {
    setError(''); setMsg('');
    try {
      const res = await api.post('/professional/me/slots', form, token);
      setMsg(res.added ? 'Slot added' : 'Slot already exists');
      setForm({ slot_date: '', start_time: '', end_time: '' });
      await load();
    } catch (e) { setError(e.message); }
  };

  const remove = async (id) => {
    setError(''); setMsg('');
    try {
      await api.del(`/professional/me/slots/${id}`, token);
      setMsg('Slot removed');
      await load();
    } catch (e) { setError(e.message); }
  };

  const grouped = slots.reduce((acc, s) => {
    (acc[s.slot_date] = acc[s.slot_date] || []).push(s);
    return acc;
  }, {});

  return (
    <Layout title="Availability Slots" subtitle="Open slots appear to customers — booked slots lock automatically (no double-booking)">
      {msg && <div className="alert success">{msg}</div>}
      {error && <div className="alert error">{error}</div>}

      <div className="card">
        <h2>Add Slot</h2>
        <div className="row">
          <input style={{ maxWidth: 170 }} type="date" value={form.slot_date} onChange={(e) => setForm({ ...form, slot_date: e.target.value })} />
          <input style={{ maxWidth: 130 }} type="time" value={form.start_time} onChange={(e) => setForm({ ...form, start_time: e.target.value + ':00' })} />
          <input style={{ maxWidth: 130 }} type="time" value={form.end_time} onChange={(e) => setForm({ ...form, end_time: e.target.value + ':00' })} />
          <button className="btn" onClick={add} disabled={!form.slot_date || !form.start_time}>Add Slot</button>
        </div>
        <p className="muted mt">Tip: add 2-hour slots (e.g. 09:00–11:00). When a customer books a slot it instantly becomes unavailable to everyone else.</p>
      </div>

      <div className="card">
        <h2>My Calendar</h2>
        {slots.length === 0 && <Empty icon="🗓">No slots yet: add your first slot above.</Empty>}
        {Object.entries(grouped).map(([date, daySlots]) => (
          <div key={date} className="mb">
            <b>{date}</b>
            <div className="row mt" style={{ rowGap: 6 }}>
              {daySlots.map((s) => (
                <span key={s.id} className={`badge ${s.is_booked ? 'completed' : 'status'}`} style={{ fontSize: 13, padding: '6px 12px' }}>
                  {s.start_time.slice(0, 5)}–{s.end_time.slice(0, 5)} {s.is_booked ? '· BOOKED' : ''}
                  {!s.is_booked && <a href="#" onClick={(e) => { e.preventDefault(); remove(s.id); }} style={{ marginLeft: 8, color: 'var(--danger)' }}>✕</a>}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </Layout>
  );
}
