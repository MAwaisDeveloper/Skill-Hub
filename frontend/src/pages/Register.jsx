import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, saveSession } from '../api';
import { useApp } from '../context';

export default function Register() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('customer');
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '' });
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCats, setSelectedCats] = useState([]);
  const [areas, setAreas] = useState('');
  const [proForm, setProForm] = useState({ cnic_number: '', experience_years: '', bio: '', payout_account: '', payout_provider: 'jazzcash' });
  const [error, setError] = useState('');

  useEffect(() => {
    api.get('/customer/categories').then(setCategories).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setP = (k) => (e) => setProForm({ ...proForm, [k]: e.target.value });

  const register = async () => {
    setError('');
    if (form.password && String(form.password).length < 8) { setError('Password min 8 characters ka hona chahiye'); return; }
    try {
      const res = await api.post('/auth/register', { ...form, role });
      setDevOtp(res.dev_otp || null);
      setStep(2);
    } catch (e) {
      setError(e.message);
    }
  };

  const verify = async () => {
    setError('');
    try {
      // OTP issued during registration; login via verify endpoint
      const data = await api.post('/auth/otp/verify', { phone: form.phone, otp });
      saveSession(data);
      login(data);
      if (role === 'professional') {
        setStep(3);
      } else {
        navigate('/customer');
      }
    } catch (e) {
      setError(e.message);
    }
  };

  const completePro = async () => {
    setError('');
    try {
      const session = JSON.parse(localStorage.getItem('hunar_session'));
      await api.post('/auth/professional/profile', {
        ...proForm,
        experience_years: Number(proForm.experience_years || 0),
        category_ids: selectedCats,
        areas: areas.split(',').map((a) => a.trim()).filter(Boolean),
      }, session.token);
      navigate('/professional');
    } catch (e) {
      setError(e.message);
    }
  };

  return (
    <div style={{ maxWidth: 520, margin: '40px auto' }}>
      <div className="card">
        <h1>Create Account</h1>
        {error && <div className="alert error">{error}</div>}
        {devOtp && <div className="alert warn">Dev OTP: <b>{devOtp}</b></div>}

        {step === 1 && (
          <>
            <label>I am a</label>
            <select value={role} onChange={(e) => setRole(e.target.value)}>
              <option value="customer">Customer — I need a service</option>
              <option value="professional">Service Professional — I provide services</option>
            </select>
            <label>Full Name</label>
            <input value={form.full_name} onChange={set('full_name')} placeholder="Your name" />
            <label>Phone (03XXXXXXXXX)</label>
            <input value={form.phone} onChange={set('phone')} placeholder="03XXXXXXXXX" />
            <label>Email (optional — password login ke liye useful)</label>
            <input value={form.email} onChange={set('email')} placeholder="you@example.com" />
            <label>Password (min 8 — email/phone + password se login hoga)</label>
            <input type="password" value={form.password} onChange={set('password')} placeholder="••••••••" />
            <button className="btn" onClick={register}>Register</button>
          </>
        )}

        {step === 2 && (
          <>
            <label>Enter OTP sent to {form.phone}</label>
            <input value={otp} onChange={(e) => setOtp(e.target.value)} />
            <button className="btn" onClick={verify}>Verify</button>
          </>
        )}

        {step === 3 && (
          <>
            <h2>Professional Profile</h2>
            <label>CNIC Number (13 digits)</label>
            <input value={proForm.cnic_number} onChange={setP('cnic_number')} placeholder="3520212345671" />
            <label>Experience (years)</label>
            <input type="number" value={proForm.experience_years} onChange={setP('experience_years')} />
            <label>Bio</label>
            <textarea value={proForm.bio} onChange={setP('bio')} rows={3} />
            <label>Categories</label>
            <div className="row">
              {categories.map((c) => (
                <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontWeight: 400 }}>
                  <input
                    type="checkbox"
                    style={{ width: 'auto', margin: 0 }}
                    checked={selectedCats.includes(c.id)}
                    onChange={(e) =>
                      setSelectedCats(e.target.checked ? [...selectedCats, c.id] : selectedCats.filter((x) => x !== c.id))
                    }
                  />
                  {c.name}
                </label>
              ))}
            </div>
            <label>Areas Served (comma separated)</label>
            <input value={areas} onChange={(e) => setAreas(e.target.value)} placeholder="Gulberg III, DHA Phase 5" />
            <label>Payout Account (JazzCash/Easypaisa number)</label>
            <input value={proForm.payout_account} onChange={setP('payout_account')} />
            <label>Payout Provider</label>
            <select value={proForm.payout_provider} onChange={setP('payout_provider')}>
              <option value="jazzcash">JazzCash</option>
              <option value="easypaisa">Easypaisa</option>
            </select>
            <button className="btn" onClick={completePro}>Submit for Verification</button>
            <p className="muted mt">Admin will manually review your CNIC + selfie. Until verified, customers cannot book you.</p>
          </>
        )}
      </div>
    </div>
  );
}
