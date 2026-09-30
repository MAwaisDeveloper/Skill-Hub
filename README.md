# Hunar — Verified Skill, Trusted Service

Complete **booking-to-payout transaction marketplace** for home services & skilled trades (Lahore), built on the technical plan (`Market-Plateform(Correct).pdf`): React + Node.js/Express + MySQL, 100% free-tier/open-source stack.

## Core Flow (implemented)

```
Customer books verified Professional → final price confirmed → full amount
HELD in customer wallet (escrow) → job lifecycle (accept → on the way →
arrived → OTP → work → complete) → Customer confirms release
→ 10% commission auto-deducted, 90% to Professional wallet
(24h auto-release if customer silent; penalties auto-deduct from next payouts)
```

## Project Structure

```
Skill-Hub/
├── backend/               Node.js + Express REST API
│   ├── src/
│   │   ├── schema.sql     27 plan tables + OTP logins + platform_settings
│   │   ├── seed.sql       Categories, admin, demo professionals & slots
│   │   ├── config/        DB pool + settings
│   │   ├── middleware/    JWT auth, roles, validators, error handler
│   │   ├── services/      wallet, booking, verification, chat, contracts, payments
│   │   ├── routes/        /api/auth /api/customer /api/professional /api/admin
│   │   ├── jobs/          24h auto-release cron (Section 8.4)
│   │   └── utils/         OTP, contact-info filter (Section 9), haversine
│   └── scripts/           migrate.js, seed.js
└── frontend/              React (Vite) SPA — Customer / Professional / Admin
```

## Quick Start

### Prerequisites
- Node.js 18+
- MySQL (XAMPP works fine)

### 1. Backend

```bash
cd backend
cp .env.example .env        # edit DB_USER/DB_PASSWORD if needed
npm install
npm run migrate             # creates DB `hunar`, 29 tables, seed data
npm run dev                 # API on http://localhost:4000
```

### 2. Frontend

```bash
cd frontend
npm install
npm run dev                 # UI on http://localhost:5173 (proxies /api to :4000)
```

### Demo Logins (dev)

| Role | Phone | Login method |
|---|---|---|
| Customer (Ali Raza, wallet Rs 20,000) | `03001234567` | OTP (printed in backend console + shown in UI) |
| AC Technician (Imran, verified) | `03011111111` | OTP |
| Electrician (Bilal, verified) | `03011111112` | OTP |
| Plumber (Kashif, verified) | `03011111113` | OTP |
| Painter (Zafar, **pending verification**) | `03014444444` | OTP |
| Admin | `03000000000` / `Admin@123` | Admin password login |

## Implemented Plan Sections

| Plan Section | Where |
|---|---|
| §2/§3 Profiles (customer + professional fields) | `users`, `customers`, `service_professionals` + register flow |
| §4 Manual verification (CNIC + selfie, admin approve/reject, `verification_logs`) | Admin Panel → Verifications; only **verified** pros are bookable (system-enforced) |
| §5 Categories | seeded 8 categories; admin can add more |
| §6 Booking flow (search → slot → price → escrow → OTP arrival → complete → release → review) | Booking service + UI wizard; double-booking blocked via `availability_slots` atomic update |
| §7 10% commission per deal | `releaseForBooking()` — commission row + 90% payout, price locked at booking |
| §8 Wallet: top-up redirect (PIN **never** on our site), escrow hold, release, 24h auto-release | `wallet.service.js`, simulated gateway page, cron job |
| §9 Off-platform protection | Hidden numbers (API never exposes), in-app chat with contact-info flagging (phones/emails/WhatsApp/cash phrases), OTP as arrival proof |
| §10 Cancellation rules | Customer: 85% refund (15% cut split pro/platform, admin-configurable). Pro: 100% refund + 10% penalty → `professional_penalties`, auto-deducted from next payout |
| §11 Bulk/Contract hiring | Contracts + bids + milestone plan + 40% deposit escrow |
| §12 Database 27 modules | `schema.sql` (27 + `otp_logins` + `platform_settings`) |
| §13 Free-tier architecture | React (Vercel/Netlify) + Express (Render free) + MySQL (Clever Cloud free) — all wired, no paid APIs |
| §14 Roadmap phases 1–10 | All implemented & smoke-tested end-to-end |

## Production Notes (when going live)

1. **OTP SMS**: replace console print in `utils/helpers.issueOtp()` with a gateway (free-tier options exist).
2. **Payments**: implement JazzCash/Easypaisa hosted-checkout redirect + HMAC-verified callback in `payment.service.js` (the wallet credit path `completeTopup()` is already transactional). PIN is never collected on Hunar — this matches gateway rules.
3. **File uploads**: document photos currently accept URLs/base64 refs — wire to S3-compatible free storage (Cloudflare R2) if needed.
4. **Deployment**: backend → Render free web service (cron included); frontend → Vercel; MySQL → Clever Cloud Dev plan.

## Live Deployment (Vercel)

Live URL: **https://skill-hub-ten-psi.vercel.app** (single Vercel project, repo root)

The built SPA (`frontend/dist`, committed) is served statically and every `/api/*` request is rewritten to root `api/index.php` (Vercel runs PHP functions only from the root `api/` folder), which forwards to the Node API. Two modes (set in Vercel Dashboard > Settings > Environment Variables):

1. **`API_BASE` mode (full API - recommended)**
   - Host `backend/` (Express) on any Node host: Render / Railway / Fly.io (build: `npm install`, start: `npm start`).
   - Create a hosted MySQL (Clever Cloud / Aiven free), then on the Node host set `DB_HOST, DB_PORT, DB_USER, DB_PASSWORD, DB_NAME, JWT_SECRET, CLIENT_URL=https://skill-hub-ten-psi.vercel.app` and run `npm run migrate` once (schema + seed).
   - In Vercel set `API_BASE=https://<your-node-api>`; `/api/*` is proxied through the PHP bridge.
2. **`MIRROR_DB` mode (no Node host needed for auth basics)**
   - In Vercel set `MIRROR_DB=1` + `DB_HOST/DB_PORT/DB_USER/DB_PASSWORD/DB_NAME` + `JWT_SECRET`.
   - Register, OTP login, password login and admin login are served directly by the PHP bridge against that MySQL (same JSON shapes). Wallet/booking endpoints still need mode 1.

Local development is unchanged: `cd backend && npm run dev` (API :4000) + `cd frontend && npm run dev` (UI :5173, proxies `/api`).

## API Smoke Test (already verified)

Registered flow tested end-to-end via API:
`register → otp → search → booking(3000) → pay(hold) → accept → on_the_way → arrived → OTP confirm → work_started → work_completed → confirm-complete → {commission:300, payout:2700}` ✅
