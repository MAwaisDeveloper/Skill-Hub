import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../api';

export default function Home() {
  const [categories, setCategories] = useState([]);
  useEffect(() => {
    api.get('/customer/categories').then(setCategories).catch(() => {});
  }, []);

  return (
    <div className="app-shell">
      <header className="topbar">
        <Link to="/" className="brand"><span className="logo-dot" /> Hunar<span>.</span></Link>
        <div className="topbar-right">
          <Link to="/login" className="btn small secondary">Login</Link>
          <Link to="/register" className="btn small gold">Register</Link>
        </div>
      </header>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '26px 30px', width: '100%' }}>
      <div className="hero">
        <h1>Verified Skill, Trusted Service.</h1>
        <p>
          Hunar is a complete booking-to-payout marketplace: book verified Service Professionals, pay online into a
          secure escrow wallet, and the platform releases 90% to the professional (0% service charges (free launch offer)) only when you
          confirm the job is done. Zero cash disputes, full protection for both sides.
        </p>
        <div className="row mt">
          <Link to="/register" className="btn gold">Get Started</Link>
          <Link to="/login" className="btn secondary">Login</Link>
        </div>
      </div>

      <h2>Categories</h2>
      <div className="grid cols-3">
        {categories.map((c) => (
          <div className="card" key={c.id}>
            <h3 style={{ marginBottom: 6 }}>{c.name}</h3>
            <p className="muted">{c.description}</p>
          </div>
        ))}
      </div>

      <div className="card mt">
        <h2>How it works</h2>
        <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
          <li>Book a verified professional for a date + time slot</li>
          <li>Confirm the final price: full amount is held in your wallet (escrow)</li>
          <li>Professional arrives → you share the OTP to start work</li>
          <li>Job completed → confirm & release, or report a problem</li>
          <li>Payment auto-releases after 24h if you don't respond (fair for both sides)</li>
        </ol>
      </div>
      </div>
      <footer className="footer">
        <span><b>Hunar</b> — Verified Skill, Trusted Service</span>
        <span>Escrow-protected payments · 0% service charges (free launch offer) · Manual CNIC verification</span>
      </footer>
    </div>
  );
}
