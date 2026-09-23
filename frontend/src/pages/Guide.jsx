import React from 'react';
import { useApp } from '../context';
import Layout from '../components/Layout';
import { MoneyFlow } from '../components/ui';

export default function Guide() {
  const { session } = useApp();
  const backTo = session?.user?.role === 'professional' ? '/professional' : '/customer';

  return (
    <Layout title="How Hunar Works" subtitle="Complete platform guide — from request to payout, all in one place">

      {/* Visual hero flow — Wallet -> Escrow -> Job -> Commission/Payout */}
      <div className="card" style={{ background: 'linear-gradient(135deg, var(--green-deep), var(--green-dark))', color: '#fff' }}>
        <h2 style={{ color: '#fff' }}>💰 The complete money journey — 4 steps</h2>
        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'stretch', marginTop: 14 }}>
          {[
            { ico: '👛', t: 'Wallet Balance', s: 'Top up via JazzCash/Easypaisa — secure gateway page; Hunar never sees your PIN' },
            { ico: '🔒', t: 'Escrow Hold', s: '100% of the booking amount is LOCKED — the professional only receives it after the job is completed' },
            { ico: '✅', t: 'Job Done', s: 'OTP start → complete → customer confirmation (or 24h auto-release)' },
            { ico: '➗', t: '−10% / +90%', s: 'Platform commission 10% · Professional payout 90% — automatic' },
          ].map((n, i, arr) => (
            <React.Fragment key={n.t}>
              <div style={{ flex: '1 1 180px', background: 'rgba(255,255,255,.1)', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(255,255,255,.2)' }}>
                <div style={{ fontSize: 26 }}>{n.ico}</div>
                <div style={{ fontWeight: 700, marginTop: 4 }}>{n.t}</div>
                <div style={{ fontSize: 12.5, opacity: 0.85, marginTop: 4 }}>{n.s}</div>
              </div>
              {i < arr.length - 1 && <div style={{ alignSelf: 'center', fontSize: 22, opacity: 0.9 }}>→</div>}
            </React.Fragment>
          ))}
        </div>
      </div>

      <div className="grid cols-3">
        <div className="card"><h2>👤 Customer</h2><p className="muted">Send a request (what you need + budget) → receive offers → accept = deal → watch live location → share OTP → confirm → review. Your money is always escrow-protected.</p></div>
        <div className="card"><h2>🛠 Service Professional</h2><p className="muted">Receive job requests → send your price offer or accept → promise an ETA → share live location → do the work → 90% payout lands in your wallet → withdraw to JazzCash/Easypaisa (or keep it in the wallet).</p></div>
        <div className="card"><h2>🛡 Admin</h2><p className="muted">Manual CNIC verification, dispute resolution, payout approvals, commission reports, penalty settlement — everything with a full audit trail.</p></div>
      </div>

      <div className="card">
        <h2>1. Platform Roles (detail)</h2>
        <table>
          <thead><tr><th>Role</th><th>Who</th><th>What they do</th></tr></thead>
          <tbody>
            <tr><td><b>Customer</b></td><td>The person requesting a service</td><td>Books verified professionals, pays online into escrow, confirms job completion</td></tr>
            <tr><td><b>Service Professional</b></td><td>Verified skilled worker (electrician, plumber, AC technician, tailor…)</td><td>Accepts jobs, completes work, receives 90% payout in wallet</td></tr>
            <tr><td><b>Admin</b></td><td>Platform operator</td><td>Manual CNIC verification, dispute resolution, commission reports, payout approvals</td></tr>
            <tr><td><b>User</b></td><td>—</td><td>Common login term at database level (same OTP auth for all)</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>2. Complete Deal Lifecycle (example: Electrician)</h2>
        <ol style={{ paddingLeft: 20, lineHeight: 2.1, fontSize: 14 }}>
          <li><b>Customer searches</b> — category "Electrician", area, date + slot. Only <b>Verified</b> professionals are shown.</li>
          <li><b>Profile check</b> — rating, completed jobs, verified badge, experience.</li>
          <li><b>Price confirmation</b> — customer and professional agree on a final price (via chat). The system checks the wallet balance.</li>
          <li><b>Escrow hold</b> — the full amount is <b>locked</b> from the customer's wallet (it is not transferred anywhere; it simply becomes "held" in the same wallet).</li>
          <li><b>Professional accepts</b> — notification arrives; on accept the slot is booked (double-booking is impossible).</li>
          <li><b>Arrival + OTP</b> — the professional taps "Arrived"; the customer shares the <b>6-digit OTP</b>; work begins.</li>
          <li><b>Work complete</b> — the professional taps "Complete"; a <b>24-hour countdown</b> starts.</li>
          <li><b>Customer confirms</b> — "Yes, Confirm & Release" → <b>10% commission is auto-deducted, 90% goes to the professional's wallet</b>. If the customer stays silent for 24h, the payment is <b>auto-released</b> (fair for both sides).</li>
          <li><b>Review</b> — ratings can only be given on completed bookings.</li>
        </ol>
        <MoneyFlow nodes={[
          { title: 'Wallet Balance', sub: 'customer adds via JazzCash/Easypaisa' },
          { title: 'Escrow Hold', sub: '100% locked at booking' },
          { title: 'Job Done', sub: 'OTP start → complete → confirm' },
          { title: '−10% / +90%', sub: 'commission | payout' },
        ]} />
      </div>

      <div className="card">
        <h2>3. Wallet System — who every rupee belongs to</h2>
        <table>
          <thead><tr><th>Ledger Type</th><th>Customer sees</th><th>Professional sees</th><th>Detail</th></tr></thead>
          <tbody>
            <tr><td><span className="badge topup">topup</span></td><td>+ In (JazzCash/Easypaisa)</td><td>—</td><td>PIN is entered on the secure gateway page — Hunar never sees it</td></tr>
            <tr><td><span className="badge hold">hold</span></td><td>− Out → "Professional's name"</td><td>—</td><td>Booking escrow; ledger shows the professional's name + booking code</td></tr>
            <tr><td><span className="badge payout">payout</span></td><td>—</td><td>+ In → "Customer's name"</td><td>Job release; recorded with the customer's name + booking code</td></tr>
            <tr><td><span className="badge refund">refund</span></td><td>+ In (unlock)</td><td>—</td><td>Cancellation / dispute refund into the customer's wallet</td></tr>
            <tr><td><span className="badge penalty">penalty</span></td><td>—</td><td>− Out</td><td>Pro-cancel penalty is auto-deducted from the next payout</td></tr>
            <tr><td><span className="badge commission">commission</span></td><td>10% cut at release</td><td>—</td><td>Platform revenue — automatic on every release</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>4. Commission (10%) — how it is guaranteed</h2>
        <table>
          <thead><tr><th>Item</th><th>Rs 3,000 job</th><th>Rs 15,000 job</th></tr></thead>
          <tbody>
            <tr><td>Customer pays (online, in full)</td><td>Rs 3,000</td><td>Rs 15,000</td></tr>
            <tr><td>Platform commission (10%)</td><td>Rs 300</td><td>Rs 1,500</td></tr>
            <tr><td><b>Professional payout (90%)</b></td><td><b>Rs 2,700</b></td><td><b>Rs 13,500</b></td></tr>
          </tbody>
        </table>
        <p className="muted mt">The price is locked at booking time — changing it later cannot reduce the commission. Neither the customer nor the professional can bypass the release code — it is the only path.</p>
      </div>

      <div className="card">
        <h2>5. Verification Process (100% free, manual)</h2>
        <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
          <li>The professional uploads CNIC front/back + a live selfie</li>
          <li>Admin matches all three photos side-by-side + checks the 13-digit CNIC format</li>
          <li>Approve → <b>"Verified" badge goes live instantly</b> · Reject → a reason is given; the professional can resubmit</li>
          <li>Every decision is saved in <b>verification_logs</b> (which admin, when, what)</li>
          <li><b>Only verified professionals receive bookings</b> — a system-level rule that cannot be bypassed</li>
        </ol>
      </div>

      <div className="card">
        <h2>6. Cancellation Rules</h2>
        <table>
          <thead><tr><th>Scenario</th><th>Customer gets back</th><th>Impact on professional</th></tr></thead>
          <tbody>
            <tr><td>Customer cancels (pro has not accepted)</td><td><b>100%</b> refund</td><td>No penalty</td></tr>
            <tr><td>Customer cancels (pro already accepted)</td><td><b>85%</b> refund</td><td>15% cut: professional compensation + platform share</td></tr>
            <tr><td>Professional cancels</td><td><b>100%</b> refund</td><td>10% penalty recorded → auto-deducted from the next payout</td></tr>
            <tr><td>Professional no-show</td><td><b>100%</b> refund</td><td>Trust score hit; 3 no-shows = suspension</td></tr>
            <tr><td>Dispute</td><td>Funds stay on hold</td><td>No release until the admin decides</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>6.1 Late / No-Show Rules (new — fair for both sides)</h2>
        <table>
          <thead><tr><th>Scenario</th><th>What happens</th></tr></thead>
          <tbody>
            <tr><td>Professional promises an <b>ETA on accept</b> (e.g. 45 min)</td><td>Customer sees the timeline + countdown</td></tr>
            <tr><td>Professional is running late — taps <b>"I'm running late"</b> (reason + new ETA)</td><td>Customer is notified: <b>Approve</b> and <b>nobody's money is deducted</b> (only the normal 10% commission at release) — or <b>Cancel</b></td></tr>
            <tr><td>Customer approves the lateness</td><td>The deal continues — zero penalty</td></tr>
            <tr><td>Time expires, no approval, customer cancels</td><td><b>100% refund</b> to the customer + <b>10% penalty</b> on the professional (auto-deducted from the next payout)</td></tr>
            <tr><td>Professional no-shows without notice</td><td>100% refund + penalty + trust score hit</td></tr>
          </tbody>
        </table>
      </div>

      <div className="card">
        <h2>6.2 Live Location Tracking (free)</h2>
        <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
          <li>After the deal is accepted, the <b>LiveMap</b> is visible to both sides — customer and professional pins</li>
          <li>Each party shares GPS location through the <b>"Share my current location"</b> button (browser permission)</li>
          <li><b>5-second auto-refresh</b> — while the page is open, locations keep updating live</li>
          <li>No GPS? Type the address in chat — or drop a pin by clicking the map</li>
          <li>Distance, travel-time estimate and a direction arrow are shown between the two pins</li>
          <li>100% free OpenStreetMap — no paid API</li>
        </ul>
      </div>

      <div className="card">
        <h2>7. Bulk / Contract Hiring</h2>
        <ol style={{ paddingLeft: 20, lineHeight: 2 }}>
          <li>Customer fills the form: category, workers, duration, budget, start date</li>
          <li>All verified professionals in that category are notified → bids arrive</li>
          <li>Customer selects a bid → the <b>full amount is locked in escrow</b> (40% = Milestone 1) and milestones are created</li>
          <li>For each milestone the customer confirms → payment is released (+10% commission on the total contract)</li>
        </ol>
      </div>

      <div className="card">
        <h2>8. Off-Platform Protection</h2>
        <ul style={{ paddingLeft: 20, lineHeight: 2 }}>
          <li>Phone numbers are never shared — chat is linked to the Booking ID, and contact info is automatically <b>flagged</b></li>
          <li>OTP arrival proof — "Arrived" is only possible on paid (escrow-secured) bookings</li>
          <li>Ratings + the verified badge are only built from platform-completed jobs</li>
          <li>Off-platform cash deals = account suspension (onboarding agreement)</li>
        </ul>
      </div>

      <a href={backTo} className="btn">← Back to Dashboard</a>
    </Layout>
  );
}
