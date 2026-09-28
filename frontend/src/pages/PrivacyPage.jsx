import React from 'react';
import Layout from '../components/Layout';

export default function PrivacyPage() {
  return (
    <Layout title="Privacy Policy" subtitle="How your data is protected — Hunar Platform">
      <div className="card">
        <h2>1. Information we collect</h2>
        <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          <li><b>Account:</b> phone number (login), name, optional email, preferred language</li>
          <li><b>Customers:</b> saved addresses (with map pins), booking history, trust score</li>
          <li><b>Professionals:</b> CNIC number + CNIC front/back photos, live selfie, experience, service areas, payout account</li>
          <li><b>Wallet:</b> top-ups, escrow holds, releases, refunds, withdrawals: the complete ledger</li>
          <li><b>Chat:</b> booking-linked messages (with contact-info filtering)</li>
        </ul>
      </div>
      <div className="card">
        <h2>2. How your data is used</h2>
        <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          <li>To process bookings and keep escrow payments secure</li>
          <li>Manual verification: only an authorized admin sees your documents, with an audit log</li>
          <li>To resolve disputes: funds remain held until a decision is made</li>
          <li>To calculate service charges (10% only on released deals)</li>
        </ul>
      </div>
      <div className="card">
        <h2>3. What we NEVER do</h2>
        <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Your JazzCash/Easypaisa <b>PIN is never collected</b> — it is entered on the payment gateway's own secure page</li>
          <li>Phone numbers are <b>not shared</b> between customers and professionals: in-app chat is used instead</li>
          <li>Your data is never sold to any third party</li>
        </ul>
      </div>
      <div className="card">
        <h2>4. Your rights</h2>
        <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Update your profile anytime (Settings)</li>
          <li>On account suspension, the full ledger and history remain accessible</li>
          <li>Data deletion requests: admin@hunar.pk (after active bookings are settled)</li>
        </ul>
      </div>
    </Layout>
  );
}
