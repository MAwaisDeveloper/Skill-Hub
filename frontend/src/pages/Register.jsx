import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { api, saveSession } from '../api';
import { useApp } from '../context';

export default function Register() {
  const { login } = useApp();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [role, setRole] = useState('customer');
  const [form, setForm] = useState({ full_name: '', phone: '', email: '', password: '', confirm: '' });
  const [otp, setOtp] = useState('');
  const [devOtp, setDevOtp] = useState(null);
  const [categories, setCategories] = useState([]);
  const [selectedCats, setSelectedCats] = useState([]);
  const [areas, setAreas] = useState('');
  const [proForm, setProForm] = useState({ cnic_number: '', experience_years: '', bio: '', payout_account: '', payout_provider: 'jazzcash' });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get('/customer/categories').then(setCategories).catch(() => {});
  }, []);

  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const setP = (k) => (e) => setProForm({ ...proForm, [k]: e.target.value });

  const validStep1 = form.full_name.trim() && /^03\d{9}$/.test(form.phone.trim()) && form.password.length >= 8 && form.password === form.confirm;

  const register = async () => {
    setError('');
    if (!form.full_name.trim()) { setError('Apna poora naam likhein'); return; }
    if (!/^03\d{9}$/.test(form.phone.trim())) { setError('Phone 03XXXXXXXXX format mein hona chahiye (11 digits)'); return; }
    if (form.password.length < 8) { setError('Password kam az kam 8 characters ka ho'); return; }
    if (form.password !== form.confirm) { setError('Password aur confirm password match nahi kar rahe'); return; }
    setBusy(true);
    try {
      const res = await api.post('/auth/register', { ...form, role });
      setDevOtp(res.dev_otp || null);
      setStep(2);
    } catch (e) {
      setError(e.message);
    } finally { setBusy(false); }
  };

  const verify = async () => {
    setError(''); setBusy(true);
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
    } finally { setBusy(false); }
  };

  const completePro = async () => {
    setError(''); setBusy(true);
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
    } finally { setBusy(false); }
  };

  return (
    <div className="auth-split">
      <div className="auth-brand">
        <div>
          <div className="auth-brand-logo"><span className="logo-dot" /> Hunar<span>.</span></div>
          <h1>Hunar mein<br />khush aamdeed.</h1>
          <p>Ek account, dono tareeqay — service lenay walay Customer, ya kaam dene walay Service Professional.</p>
          <ul className="auth-points">
            {role === 'customer' ? (
              <>
                <li>✓ Wallet mein JazzCash/Easypaisa se foran paise</li>
                <li>✓ Escrow protection — kaam passand aaye tabhi payment</li>
                <li>✓ Verified professionals hi book hongay</li>
              </>
            ) : (
              <>
                <li>✓ Free verification — CNIC + selfie upload karein</li>
                <li>✓ 90% direct payout har completed job par</li>
                <li>✓ JazzCash/Easypaisa par foran withdrawal</li>
              </>
            )}
          </ul>
        </div>
        <div className="auth-brand-foot">Lahore · Verified Skill, Trusted Service</div>
      </div>

      <div className="auth-form-wrap">
        <div className="auth-card">
          <h1>{step === 1 ? 'Account Banayen' : step === 2 ? '📱 Phone Verify' : '🛠 Professional Profile'}</h1>
          <p className="sub">{step === 1 ? 'Sirf 1 minute ka kaam' : step === 2 ? `${form.phone} par bheja gaya code enter karein` : 'Admin verify karega — phir customers aap ko book kar sakenge'}</p>

          {error && <div className="alert error">{error}</div>}
          {devOtp && step === 2 && <div className="alert warn">Dev OTP: <b>{devOtp}</b> (SMS gateway integration pending)</div>}

          {step === 1 && (
            <>
              <label>Main hoon</label>
              <div className="role-cards">
                <button type="button" className={`role-card ${role === 'customer' ? 'active' : ''}`} onClick={() => setRole('customer')}>
                  <span className="rc-ico">🛒</span>
                  <b>Customer</b>
                  <span className="muted">Mujhe service chahiye</span>
                </button>
                <button type="button" className={`role-card ${role === 'professional' ? 'active' : ''}`} onClick={() => setRole('professional')}>
                  <span className="rc-ico">🛠</span>
                  <b>Professional</b>
                  <span className="muted">Main service deta hoon</span>
                </button>
              </div>

              <label>Full Name</label>
              <input value={form.full_name} onChange={set('full_name')} placeholder="e.g. Ali Raza" autoFocus />
              <label>Phone (03XXXXXXXXX)</label>
              <input value={form.phone} onChange={set('phone')} placeholder="03001234567" maxLength={11} />
              <label>Email (optional — password login ke liye useful)</label>
              <input value={form.email} onChange={set('email')} placeholder="you@example.com" />
              <div className="grid cols-2" style={{ gap: 12 }}>
                <div>
                  <label>Password (min 8)</label>
                  <input type="password" value={form.password} onChange={set('password')} placeholder="••••••••" />
                </div>
                <div>
                  <label>Confirm Password</label>
                  <input type="password" value={form.confirm} onChange={set('confirm')} placeholder="••••••••" />
                </div>
              </div>
              <button className="btn" style={{ width: '100%' }} onClick={register} disabled={busy || !validStep1}>{busy ? '⏳ Creating…' : 'Create Account'}</button>
              <p className="muted mt">Pehle se account hai? <Link to="/login"><b>Login karein</b></Link></p>
            </>
          )}

          {step === 2 && (
            <>
              <label>6-digit OTP (bheja gaya {form.phone} par)</label>
              <input value={otp} onChange={(e) => setOtp(e.target.value)} placeholder="••••••" maxLength={6} autoFocus onKeyDown={(e) => e.key === 'Enter' && verify()} />
              <button className="btn" style={{ width: '100%' }} onClick={verify} disabled={busy || otp.length < 6}>{busy ? '⏳ Verifying…' : 'Verify & Continue'}</button>
              <p className="muted mt"><Link to="/login">← Login par wapas jayen</Link></p>
            </>
          )}

          {step === 3 && (
            <>
              <label>CNIC Number (13 digits)</label>
              <input value={proForm.cnic_number} onChange={setP('cnic_number')} placeholder="3520212345671" maxLength={13} autoFocus />
              <label>Experience (years)</label>
              <input type="number" value={proForm.experience_years} onChange={setP('experience_years')} min={0} />
              <label>Short Bio (customers ko dikhega)</label>
              <textarea value={proForm.bio} onChange={setP('bio')} rows={3} placeholder="e.g. 8 saal ka tajurba, AC installation aur repair ki expert" />
              <label>Categories (jo kaam aap karte hain)</label>
              <div className="row" style={{ rowGap: 6 }}>
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
              <label>Payout Account Number (JazzCash/Easypaisa)</label>
              <input value={proForm.payout_account} onChange={setP('payout_account')} placeholder="03XXXXXXXXX" />
              <label>Payout Provider</label>
              <select value={proForm.payout_provider} onChange={setP('payout_provider')}>
                <option value="jazzcash">JazzCash</option>
                <option value="easypaisa">Easypaisa</option>
              </select>
              <button className="btn" style={{ width: '100%' }} onClick={completePro} disabled={busy || !proForm.cnic_number}>{busy ? '⏳ Submitting…' : 'Submit for Verification'}</button>
              <p className="muted mt">Admin manually CNIC + selfie check karega. Verify hone tak customers aap ko book nahi kar sakenge (system rule).</p>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
