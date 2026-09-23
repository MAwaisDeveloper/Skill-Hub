import React from 'react';
import Layout from '../components/Layout';

export default function PrivacyPage() {
  return (
    <Layout title="Privacy Policy" subtitle="Aap ka data kaise protect hota hai — Hunar Platform">
      <div className="card">
        <h2>1. Hum kaunsi information collect karte hain</h2>
        <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          <li><b>Account:</b> phone number (login), naam, optional email, preferred language</li>
          <li><b>Customers:</b> saved addresses (map pin ke sath), booking history, trust score</li>
          <li><b>Professionals:</b> CNIC number + CNIC front/back photos, live selfie, experience, service areas, payout account</li>
          <li><b>Wallet:</b> top-ups, escrow holds, releases, refunds, withdrawals — poora ledger</li>
          <li><b>Chat:</b> booking-linked messages (contact-info filter ke sath)</li>
        </ul>
      </div>
      <div className="card">
        <h2>2. Aap ka data kaise use hota hai</h2>
        <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Bookings process karne aur escrow payments secure rakhne ke liye</li>
          <li>Manual verification — sirf authorized admin aap ke documents dekhta hai, audit log ke sath</li>
          <li>Disputes resolve karne ke liye — paisa tab tak held rehta hai jab tak decision na ho</li>
          <li>Commission calculate karne ke liye (10% sirf released deals par)</li>
        </ul>
      </div>
      <div className="card">
        <h2>3. Jo hum KABHI nahi karte</h2>
        <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Aap ka JazzCash/Easypaisa <b>PIN kabhi collect nahi hota</b> — payment gateway ke apne secure page par hota hai</li>
          <li>Phone numbers customers/professionals ke beech <b>share nahi hote</b> — in-app chat use hoti hai</li>
          <li>Aap ka data kisi third-party ko becha nahi jaata</li>
        </ul>
      </div>
      <div className="card">
        <h2>4. Aap ke rights</h2>
        <ul style={{ paddingLeft: 20, lineHeight: 1.9 }}>
          <li>Apni profile kabhi bhi update karein (Settings)</li>
          <li>Account suspension par poora ledger + history accessible rehta hai</li>
          <li>Data deletion request: admin@hunar.pk (active bookings settle hone ke baad)</li>
        </ul>
      </div>
    </Layout>
  );
}
