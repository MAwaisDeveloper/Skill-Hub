import React from 'react';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { MoneyFlow } from '../components/ui';

export default function Guide() {
  const { session } = useApp();
  const backTo = session?.user?.role === 'professional' ? '/professional' : '/customer';

  return (
    <Layout title="How Hunar Works" subtitle="Complete platform guide — roles, money flow, protection rules">
      <div className="card">
        <h2>1. Platform Roles</h2>
        <table>
          <thead><tr><th>Role</th><th>Who</th><th>What they do</th></tr></thead>
          <tbody>
            <tr><td><b>Customer</b></td><td>Service mangane wala</td><td>Books verified professionals, pays online into escrow, confirms job completion</td></tr>
            <tr><td><b>Service Professional</b></td><td>Verified skilled worker (electrician, plumber, AC technician, tailor…)</td><td>Accepts jobs, completes work, receives 90% payout in wallet</td></tr>
            <tr><td><b>Admin</b></td><td>Platform operator</td><td>Manual CNIC verification, dispute resolution, commission reports, payout approvals</td></tr>
            <tr><td><b>User</b></td><td>—</td><td>Common login term at database level (same OTP auth for all)</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>2. Complete Deal Lifecycle (example: Electrician)</h2>
        <ol style={{ paddingLeft: 20, lineHeight: 2.1, fontSize: 14 }}>
          <li><b>Customer searches</b> — category "Electrician", area, date + slot. Sirf <b>Verified</b> professionals dikhte hain.</li>
          <li><b>Profile check</b> — rating, completed jobs, verified badge, experience.</li>
          <li><b>Price confirm</b> — customer aur professional final price par razi hote hain (chat ke through). System wallet balance check karta hai.</li>
          <li><b>Escrow hold</b> — poori amount customer ke wallet se <b>lock</b> ho jaati hai (kahin transfer nahi hoti, bas customer ke hi wallet mein "held" ho jaati hai).</li>
          <li><b>Professional accepts</b> — notification milta hai; accept par slot book ho jaata hai (double-booking impossible).</li>
          <li><b>Arrival + OTP</b> — professional "Arrived" click karta hai; customer apna <b>6-digit OTP</b> deta hai; work start hota hai.</li>
          <li><b>Work complete</b> — professional "Complete" karta hai; <b>24-hour countdown</b> shuru.</li>
          <li><b>Customer confirms</b> — "Yes, Confirm & Release" → <b>10% commission auto-cut, 90% professional ke wallet</b>. Agar customer 24h chup rahe to <b>auto-release</b> ho jaata hai (fair for both).</li>
          <li><b>Review</b> — sirf completed bookings par rating de sakte hain.</li>
        </ol>
        <MoneyFlow nodes={[
          { title: 'Wallet Balance', sub: 'customer adds via JazzCash/Easypaisa' },
          { title: 'Escrow Hold', sub: '100% locked at booking' },
          { title: 'Job Done', sub: 'OTP start → complete → confirm' },
          { title: '−10% / +90%', sub: 'commission | payout' },
        ]} />
      </div>

      <div className="card">
        <h2>3. Wallet System — paisa kis ke naam se aata/jaata hai</h2>
        <table>
          <thead><tr><th>Ledger Type</th><th>Customer sees</th><th>Professional sees</th><th>Detail</th></tr></thead>
          <tbody>
            <tr><td><span className="badge topup">topup</span></td><td>+ In (JazzCash/Easypaisa)</td><td>—</td><td>Gateway secure page par PIN — Hunar kabhi PIN nahi dekhta</td></tr>
            <tr><td><span className="badge hold">hold</span></td><td>− Out → "Professional ka naam"</td><td>—</td><td>Booking ka escrow; ledger mein professional ka naam + booking code</td></tr>
            <tr><td><span className="badge payout">payout</span></td><td>—</td><td>+ In → "Customer ka naam"</td><td>Job release; customer ka naam + booking code ke sath</td></tr>
            <tr><td><span className="badge refund">refund</span></td><td>+ In (unlock)</td><td>—</td><td>Cancellation / dispute refund customer ke wallet mein</td></tr>
            <tr><td><span className="badge penalty">penalty</span></td><td>—</td><td>− Out</td><td>Pro-cancel penalty agle payout se auto-kaata jaata hai</td></tr>
            <tr><td><span className="badge commission">commission</span></td><td>Release waqt 10% cut</td><td>—</td><td>Platform revenue — har release par automatic</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>4. Commission (10%) — kaise guarantee hai</h2>
        <table>
          <thead><tr><th>Item</th><th>Rs 3,000 job</th><th>Rs 15,000 job</th></tr></thead>
          <tbody>
            <tr><td>Customer pays (online, full)</td><td>Rs 3,000</td><td>Rs 15,000</td></tr>
            <tr><td>Platform commission (10%)</td><td>Rs 300</td><td>Rs 1,500</td></tr>
            <tr><td><b>Professional payout (90%)</b></td><td><b>Rs 2,700</b></td><td><b>Rs 13,500</b></td></tr>
          </tbody>
        </table>
        <p className="muted mt">Price booking ke waqt hi lock hoti hai — baad mein change karke commission kam nahi ho sakti. Na customer skip kar sakta hai na professional — release code ke through hi hota hai.</p>
      </div>

      <div className="card">
        <h2>5. Verification Process (100% free, manual)</h2>
        <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
          <li>Professional CNIC front/back + live selfie upload karta hai</li>
          <li>Admin teeno photos side-by-side match karta hai + CNIC 13-digit format check</li>
          <li>Approve → <b>"Verified" badge turant live</b> · Reject → reason deta hai, resubmit ho sakta hai</li>
          <li>Har decision <b>verification_logs</b> mein save hota hai (kis admin ne, kab, kya)</li>
          <li><b>Only verified professionals get bookings</b> — system-level rule, bypass impossible</li>
        </ol>
      </div>

      <div className="card">
        <h2>6. Cancellation Rules</h2>
        <table>
          <thead><tr><th>Scenario</th><th>Customer ko wapas</th><th>Professional par asar</th></tr></thead>
          <tbody>
            <tr><td>Customer cancels (pro ne accept nahi kiya)</td><td><b>100%</b> refund</td><td>Koi penalty nahi</td></tr>
            <tr><td>Customer cancels (pro accept kar chuka)</td><td><b>85%</b> refund</td><td>15% cut: professional compensation + platform share</td></tr>
            <tr><td>Professional cancels</td><td><b>100%</b> refund</td><td>10% penalty record → agli payout se auto-deduct</td></tr>
            <tr><td>Professional no-show</td><td><b>100%</b> refund</td><td>Trust score hit; 3 no-shows = suspension</td></tr>
            <tr><td>Dispute</td><td>Funds hold mein</td><td>Admin decision tak release nahi hota</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>7. Bulk / Contract Hiring</h2>
        <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
          <li>Customer form fill karta hai: category, workers, duration, budget, start date</li>
          <li>Us category ke sab verified professionals ko notification jaata hai → bids aate hain</li>
          <li>Customer bid select karta hai → <b>40% deposit escrow</b> mein lock, milestones ban jaate hain</li>
          <li>Har milestone par customer confirm karta hai → payment release (+10% commission total contract par)</li>
        </ol>
      </div>

      <div className="card">
        <h2>8. Off-Platform Protection</h2>
        <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
          <li>Phone numbers kabhi share nahi hote — chat Booking ID se linked, contact info automatically <b>flag</b></li>
          <li>OTP arrival proof — "Arrived" sirf paid (escrow-secured) bookings par possible</li>
          <li>Rating + verified badge sirf platform-completed jobs se banti hai</li>
          <li>Off-platform cash deal = account suspension (onboarding agreement)</li>
        </ul>
      </div>

      <a href={backTo} className="btn">← Back to Dashboard</a>
    </Layout>
  );
}
