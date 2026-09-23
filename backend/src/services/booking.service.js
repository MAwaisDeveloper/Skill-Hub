const { pool, withTransaction } = require('../config/db');
const { HttpError } = require('../middleware/error');
const { getSettings, notify, adjustTrustScore, logBookingEvent } = require('../utils/helpers');
const walletService = require('./wallet.service');

const ACTIVE_STATUSES = ['waiting_for_professional', 'accepted', 'on_the_way', 'arrived', 'work_started', 'work_completed'];

// ---------- Search: only VERIFIED pros, matching area/slot (Section 6) ----------

async function searchProfessionals({ category_id, area, date, slot_time, urgent }) {
  let sql = `
    SELECT sp.id, sp.full_name, sp.profile_photo, sp.experience_years, sp.bio,
           sp.average_rating, sp.completed_jobs, sp.trust_score, sp.available_now,
           u.phone, c.name AS category_name,
           (SELECT GROUP_CONCAT(sa.area) FROM service_areas sa WHERE sa.professional_id = sp.id) AS areas
    FROM service_professionals sp
    JOIN users u ON u.id = sp.user_id AND u.status = 'active'
    JOIN professional_categories pc ON pc.professional_id = sp.id
    JOIN categories c ON c.id = pc.category_id
    WHERE sp.verification_status = 'verified'`;
  const params = [];
  if (category_id) {
    sql += ` AND pc.category_id = ?`;
    params.push(category_id);
  }
  if (area) {
    sql += ` AND EXISTS (SELECT 1 FROM service_areas sa2 WHERE sa2.professional_id = sp.id AND sa2.area LIKE ?)`;
    params.push(`%${area}%`);
  }
  if (urgent) {
    sql += ` AND sp.available_now = 1`;
  }
  if (date && slot_time) {
    sql += ` AND EXISTS (
      SELECT 1 FROM availability_slots s
      WHERE s.professional_id = sp.id AND s.slot_date = ? AND s.start_time = ? AND s.is_booked = 0)`;
    params.push(date, slot_time);
  }
  sql += ` GROUP BY sp.id ORDER BY sp.average_rating DESC, sp.completed_jobs DESC`;
  let [rows] = await pool.query(sql, params);
  // Fallback: agar area/slot filter se 0 results aaye, category-wide results do (area_matched=false)
  if (rows.length === 0 && category_id) {
    let fallback = `
      SELECT sp.id, sp.full_name, sp.profile_photo, sp.experience_years, sp.bio,
             sp.average_rating, sp.completed_jobs, sp.trust_score, sp.available_now,
             u.phone, c.name AS category_name,
             (SELECT GROUP_CONCAT(sa.area) FROM service_areas sa WHERE sa.professional_id = sp.id) AS areas
      FROM service_professionals sp
      JOIN users u ON u.id = sp.user_id AND u.status = 'active'
      JOIN professional_categories pc ON pc.professional_id = sp.id
      JOIN categories c ON c.id = pc.category_id
      WHERE sp.verification_status = 'verified' AND pc.category_id = ?
      GROUP BY sp.id ORDER BY sp.average_rating DESC, sp.completed_jobs DESC`;
    [rows] = await pool.query(fallback, [category_id]);
    return rows.map((r) => ({ ...r, area_matched: false }));
  }
  return rows.map((r) => ({ ...r, area_matched: true }));
}

async function getProfessionalProfile(professionalId) {
  const [rows] = await pool.query(
    `SELECT sp.*, u.phone, u.status AS user_status, u.preferred_language,
            (SELECT GROUP_CONCAT(sa.area) FROM service_areas sa WHERE sa.professional_id = sp.id) AS areas,
            (SELECT GROUP_CONCAT(c.name) FROM professional_categories pc JOIN categories c ON c.id = pc.category_id WHERE pc.professional_id = sp.id) AS categories
     FROM service_professionals sp JOIN users u ON u.id = sp.user_id WHERE sp.id = ?`,
    [professionalId]
  );
  if (!rows.length) throw new HttpError(404, 'Professional not found');
  const [slots] = await pool.query(
    `SELECT id, slot_date, start_time, end_time FROM availability_slots
     WHERE professional_id = ? AND is_booked = 0 AND slot_date >= CURDATE() ORDER BY slot_date, start_time LIMIT 60`,
    [professionalId]
  );
  const [reviewRows] = await pool.query(
    `SELECT r.rating, r.comment, r.created_at, cu.full_name AS customer_name
     FROM reviews r JOIN bookings b ON b.id = r.booking_id JOIN customers cu ON cu.id = r.customer_id
     WHERE r.professional_id = ? ORDER BY r.created_at DESC LIMIT 20`,
    [professionalId]
  );
  return { professional: rows[0], availability: slots, reviews: reviewRows };
}

// ---------- Create booking (price confirmed -> wallet balance checked) ----------

async function createBooking(customerUserId, payload) {
  const settings = await getSettings();
  const { professional_id, category_id, address_id, scheduled_date, scheduled_slot, description, final_price, is_urgent } = payload;

  if (!(final_price > 0)) throw new HttpError(400, 'final_price must be greater than 0');

  const [pros] = await pool.query(
    `SELECT sp.*, u.id AS user_id FROM service_professionals sp JOIN users u ON u.id = sp.user_id WHERE sp.id = ? AND u.status = 'active'`,
    [professional_id]
  );
  const pro = pros[0];
  if (!pro) throw new HttpError(404, 'Professional not found');
  if (pro.verification_status !== 'verified') {
    throw new HttpError(403, 'Only verified professionals can be booked (system-level rule)');
  }

  // advance-booking rules (Section 10)
  const minStart = new Date(Date.now() + settings.minAdvanceBookingHours * 3600 * 1000);
  const maxStart = new Date(Date.now() + settings.maxAdvanceBookingDays * 24 * 3600 * 1000);
  const when = new Date(`${scheduled_date}T${scheduled_slot}`);
  if (Number.isNaN(when.getTime())) throw new HttpError(400, 'Invalid scheduled_date or scheduled_slot');
  if (when < minStart) throw new HttpError(400, `Book at least ${settings.minAdvanceBookingHours} hours in advance`);
  if (when > maxStart) throw new HttpError(400, `Book at most ${settings.maxAdvanceBookingDays} days in advance`);

  // double-booking prevention: slot must be free
  const [slots] = await pool.query(
    `SELECT * FROM availability_slots WHERE professional_id = ? AND slot_date = ? AND start_time = ? FOR UPDATE`,
    [professional_id, scheduled_date, scheduled_slot]
  );

  const booking_code = 'HB' + Date.now().toString(36).toUpperCase() + Math.floor(100 + Math.random() * 900);
  const otp_code = String(Math.floor(100000 + Math.random() * 900000));

  const [custRows] = await pool.query(`SELECT id FROM customers WHERE user_id = ?`, [customerUserId]);
  if (!custRows.length) throw new HttpError(400, 'Customer profile missing');
  const customerId = custRows[0].id;

  return withTransaction(async (conn) => {
    let slotLocked = false;
    if (slots.length) {
      // lock slot atomically
      const [res] = await conn.query(
        `UPDATE availability_slots SET is_booked = 1 WHERE id = ? AND is_booked = 0`,
        [slots[0].id]
      );
      if (res.affectedRows !== 1) throw new HttpError(409, 'Slot just got booked. Pick another slot.');
      slotLocked = true;
    }

    const [bres] = await conn.query(
      `INSERT INTO bookings (booking_code, customer_id, professional_id, category_id, address_id, scheduled_date, scheduled_slot, description, final_price, otp_code, status, is_urgent)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending_payment', ?)`,
      [booking_code, customerId, pro.id, category_id, address_id || null, scheduled_date, scheduled_slot, description || null, final_price, otp_code, is_urgent ? 1 : 0]
    );
    const bookingId = bres.insertId;

    await logBookingEvent(conn, bookingId, 'created', customerUserId, 'Booking request created');

    // price confirmation + wallet hold happens at payment step; here we only validate balance
    const [walletRows] = await conn.query(`SELECT balance FROM wallets WHERE user_id = ?`, [customerUserId]);
    const balance = walletRows.length ? Number(walletRows[0].balance) : 0;
    return {
      booking_id: bookingId,
      booking_code,
      status: 'pending_payment',
      slot_locked: slotLocked,
      wallet_balance: balance,
      wallet_sufficient: balance >= Number(final_price),
      next_step: 'POST /bookings/:id/pay to hold funds in escrow',
    };
  });
}

// ---------- Pay: escrow hold (Section 8.2) ----------

async function payBooking(customerUserId, bookingId) {
  return withTransaction(async (conn) => {
    const [bookings] = await conn.query(`SELECT * FROM bookings WHERE id = ? FOR UPDATE`, [bookingId]);
    const booking = bookings[0];
    if (!booking) throw new HttpError(404, 'Booking not found');

    const [custRows] = await conn.query(
      `SELECT u.id AS user_id FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
      [booking.customer_id]
    );
    if (custRows[0].user_id !== customerUserId) throw new HttpError(403, 'Not your booking');
    if (booking.status !== 'pending_payment') throw new HttpError(400, `Booking is ${booking.status}, not payable`);

    await walletService.holdForBooking(conn, customerUserId, bookingId, Number(booking.final_price));

    await conn.query(`UPDATE bookings SET status = 'waiting_for_professional' WHERE id = ?`, [bookingId]);
    await logBookingEvent(conn, bookingId, 'paid', customerUserId, `Escrow hold Rs ${booking.final_price}`);

    const [proUser] = await conn.query(
      `SELECT u.id FROM service_professionals sp JOIN users u ON u.id = sp.user_id WHERE sp.id = ?`,
      [booking.professional_id]
    );
    await notify(proUser[0].id, 'booking', `New booking request ${booking.booking_code} - Rs ${booking.final_price} (funds secured)`, bookingId);

    return { booking_id: bookingId, status: 'waiting_for_professional', held_amount: booking.final_price };
  });
}

// ---------- Professional actions ----------

async function proAccept(proUserId, bookingId, { arrival_minutes } = {}) {
  return withTransaction(async (conn) => {
    const ctx = await proBookingContext(conn, proUserId, bookingId);
    if (ctx.booking.status !== 'waiting_for_professional') throw new HttpError(400, `Cannot accept a ${ctx.booking.status} booking`);
    await conn.query(`UPDATE bookings SET status = 'accepted', arrival_minutes = COALESCE(?, arrival_minutes) WHERE id = ?`, [arrival_minutes ? Number(arrival_minutes) : null, bookingId]);
    await logBookingEvent(conn, bookingId, 'accepted', proUserId, `Professional accepted${arrival_minutes ? ` (ETA ${arrival_minutes} min)` : ''}`);
    await notify(ctx.customerUserId, 'booking', `Professional accepted booking ${ctx.booking.booking_code}${arrival_minutes ? ` — ${arrival_minutes} min mein pohanchne ka wada` : ''}`, bookingId);
    return { status: 'accepted', arrival_minutes: arrival_minutes ? Number(arrival_minutes) : null };
  });
}

async function proReject(proUserId, bookingId, reason) {
  return withTransaction(async (conn) => {
    const ctx = await proBookingContext(conn, proUserId, bookingId);
    if (!['waiting_for_professional'].includes(ctx.booking.status)) throw new HttpError(400, 'Cannot reject at this stage');
    if (!reason || String(reason).trim().length < 10) throw new HttpError(400, 'Reject karne ke liye reason (min 10 chars) likhna zaroori hai — customer ko dikhega');
    const clean = String(reason).trim();
    // auto refund (customer did nothing wrong -> 100%)
    await walletService.refundHold(conn, ctx.customerUserId, bookingId, Number(ctx.booking.final_price), `Professional rejected: ${clean}`);
    await conn.query(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`, [bookingId]);
    await conn.query(
      `INSERT INTO refunds (booking_id, amount, reason, status, processed_at) VALUES (?, ?, ?, 'processed', NOW())`,
      [bookingId, ctx.booking.final_price, `Professional rejected: ${clean}`]
    );
    // free the slot
    await conn.query(
      `UPDATE availability_slots SET is_booked = 0 WHERE professional_id = ? AND slot_date = ? AND start_time = ?`,
      [ctx.booking.professional_id, ctx.booking.scheduled_date, ctx.booking.scheduled_slot]
    );
    await logBookingEvent(conn, bookingId, 'rejected', proUserId, `Reason: ${clean}`);
    await notify(ctx.customerUserId, 'booking', `Booking ${ctx.booking.booking_code} rejected by professional. Reason: ${clean}. Full refund Rs ${ctx.booking.final_price} wallet mein aa gaya.`, bookingId);
    return { status: 'cancelled', refund: ctx.booking.final_price, reason: clean };
  });
}

async function proStatus(proUserId, bookingId, nextStatus) {
  const allowed = {
    on_the_way: 'accepted',
    arrived: 'on_the_way',
    work_started: 'arrived',
    work_completed: 'work_started',
  };
  if (!allowed[nextStatus]) throw new HttpError(400, `Invalid status transition to ${nextStatus}`);
  return withTransaction(async (conn) => {
    const ctx = await proBookingContext(conn, proUserId, bookingId);
    const current = ctx.booking.status;
    // 'Arrived' only possible when booking is Paid-status chain (Section 9 table)
    if (current !== allowed[nextStatus]) {
      throw new HttpError(400, `Cannot move from ${current} to ${nextStatus}`);
    }
    if (nextStatus === 'arrived') {
      // OTP proof: booking must be paid (escrow held) - implicit since paid earlier in chain
      await logBookingEvent(conn, bookingId, 'arrived', proUserId, 'Marked arrived; awaiting customer OTP confirmation');
    }
    await conn.query(`UPDATE bookings SET status = ? WHERE id = ?`, [nextStatus, bookingId]);
    await logBookingEvent(conn, bookingId, nextStatus, proUserId, null);
    if (nextStatus === 'work_completed') {
      // start auto-release countdown (Section 8.4)
      const settings = await getSettings();
      const autoAt = new Date(Date.now() + settings.autoReleaseHours * 3600 * 1000);
      await conn.query(`UPDATE bookings SET auto_release_at = ? WHERE id = ?`, [autoAt, bookingId]);
      await notify(ctx.customerUserId, 'booking', `Work marked complete on ${ctx.booking.booking_code}. Confirm within ${settings.autoReleaseHours}h or payment auto-releases.`, bookingId);
    }
    return { status: nextStatus };
  });
}

// ---------- Customer: confirm OTP at arrival ----------

async function customerConfirmArrival(customerUserId, bookingId, otp) {
  return withTransaction(async (conn) => {
    const ctx = await custBookingContext(conn, customerUserId, bookingId);
    if (ctx.booking.status !== 'arrived') throw new HttpError(400, 'Professional has not marked arrived yet');
    if (String(otp) !== String(ctx.booking.otp_code)) throw new HttpError(400, 'Incorrect OTP');
    await conn.query(`UPDATE bookings SET status = 'work_started' WHERE id = ?`, [bookingId]);
    await logBookingEvent(conn, bookingId, 'work_started', customerUserId, 'Customer confirmed arrival via OTP');
    return { status: 'work_started' };
  });
}

// ---------- Customer: confirm completion & release, or dispute ----------

async function customerConfirmComplete(customerUserId, bookingId) {
  const result = await withTransaction(async (conn) => {
    const ctx = await custBookingContext(conn, customerUserId, bookingId);
    if (!['work_completed'].includes(ctx.booking.status)) throw new HttpError(400, `Booking is ${ctx.booking.status}; wait for professional to complete work`);
    return walletService.releaseForBooking(conn, bookingId, 'customer_confirm');
  });
  return result;
}

async function customerDispute(customerUserId, bookingId, description) {
  return withTransaction(async (conn) => {
    const ctx = await custBookingContext(conn, customerUserId, bookingId);
    if (!['work_completed', 'work_started', 'arrived'].includes(ctx.booking.status)) {
      throw new HttpError(400, `Cannot dispute a booking in ${ctx.booking.status}`);
    }
    await conn.query(`UPDATE bookings SET status = 'disputed' WHERE id = ?`, [bookingId]);
    await conn.query(`INSERT INTO disputes (booking_id, raised_by, description) VALUES (?, ?, ?)`, [bookingId, ctx.userId, description]);
    await logBookingEvent(conn, bookingId, 'disputed', ctx.userId, description);
    return { status: 'disputed', note: 'Funds stay on hold until admin resolves' };
  });
}

// ---------- Cancellation (Section 10.1) ----------

// Preview: user cancel dabane se PEHLE exact breakdown dekhta hai (kya cut hoga)
async function getCancelPreview(actorUserId, actorRole, bookingId) {
  const settings = await getSettings();
  const [bookings] = await pool.query(`SELECT * FROM bookings WHERE id = ?`, [bookingId]);
  const booking = bookings[0];
  if (!booking) throw new HttpError(404, 'Booking not found');

  const [custRows] = await pool.query(
    `SELECT u.id AS user_id FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
    [booking.customer_id]
  );
  const customerUserId = custRows[0]?.user_id;
  const [proRows] = await pool.query(
    `SELECT u.id AS user_id, sp.full_name FROM service_professionals sp JOIN users u ON u.id = sp.user_id WHERE sp.id = ?`,
    [booking.professional_id]
  );
  const proUserId = proRows[0]?.user_id;

  const isCustomer = actorRole === 'customer' && actorUserId === customerUserId;
  const isPro = actorRole === 'professional' && actorUserId === proUserId;
  if (!isCustomer && !isPro) throw new HttpError(403, 'Not a party to this booking');

  const cancellable = ['waiting_for_professional', 'accepted'].includes(booking.status);
  const proAccepted = booking.status === 'accepted';
  const held = Number(booking.final_price);

  const base = {
    booking_id: bookingId,
    booking_code: booking.booking_code,
    status: booking.status,
    held_amount: held,
    can_cancel: cancellable,
    pro_has_accepted: proAccepted,
  };
  if (!cancellable) {
    return { ...base, message: `Ye booking ${booking.status.replace(/_/g, ' ')} stage par hai — ab cancel nahi ho sakti (funds escrow mein protected hain).` };
  }

  if (isCustomer) {
    const refundPercent = proAccepted ? settings.customerCancelRefundPercent : 100;
    const refundAmount = Math.round(held * (refundPercent / 100) * 100) / 100;
    const cut = Math.round((held - refundAmount) * 100) / 100;
    const proCompensation = Math.round(held * (settings.customerCancelProCompensationPercent / 100) * 100) / 100;
    const platformShare = Math.round((cut - proCompensation) * 100) / 100;
    return {
      ...base,
      you_are: 'customer',
      refund_percent: refundPercent,
      you_will_get_back: refundAmount,
      will_be_cut: cut,
      cut_breakdown: proAccepted
        ? {
            professional_compensation: { percent: settings.customerCancelProCompensationPercent, amount: proCompensation, goes_to: `${proRows[0].full_name} (slot block hone ka compensation)` },
            platform_share: { percent: Math.round((refundPercent === 100 ? 0 : 100 - refundPercent - settings.customerCancelProCompensationPercent) * 100) / 100, amount: platformShare },
          }
        : null,
      trust_score_impact: proAccepted ? -5 : -1,
      message: proAccepted
        ? `Professional ne accept kar liya hai: aap ko Rs ${refundAmount} wapas milega, Rs ${cut} cut hoga (${settings.customerCancelProCompensationPercent}% professional ko compensation, ${Math.round((100 - refundPercent - settings.customerCancelProCompensationPercent) * 100) / 100}% platform).`
        : 'Professional ne abhi accept nahi kiya — 100% refund turant wallet mein aa jayega.',
    };
  }

  // professional preview
  const penaltyAmount = Math.round(held * (settings.proCancelPenaltyPercent / 100) * 100) / 100;
  return {
    ...base,
    you_are: 'professional',
    customer_will_get_back: held,
    customer_refund_percent: 100,
    your_penalty: proAccepted ? penaltyAmount : 0,
    penalty_note: proAccepted
      ? `Aap ki Rs ${penaltyAmount} penalty professional_penalties mein "owed" entry banegi — aap ke agle successful payout(s) se automatic kaat li jayegi jab tak settle na ho. Trust score bhi -10 hoga.`
      : 'Abhi aap ne accept nahi kiya tha — koi penalty nahi (reject-with-reason use karein).',
    trust_score_impact: -10,
    message: proAccepted
      ? `Customer ko 100% (Rs ${held}) turant refund milega. Aap ki Rs ${penaltyAmount} penalty record hogi — agle payout se auto-cut.`
      : 'Customer ko 100% refund milega. Koi penalty nahi (abhi accept nahi hua tha).',
  };
}

async function cancelBooking(actorUserId, actorRole, bookingId) {
  const settings = await getSettings();
  return withTransaction(async (conn) => {
    const [bookings] = await conn.query(`SELECT * FROM bookings WHERE id = ? FOR UPDATE`, [bookingId]);
    const booking = bookings[0];
    if (!booking) throw new HttpError(404, 'Booking not found');

    const [custRows] = await conn.query(
      `SELECT u.id AS user_id FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
      [booking.customer_id]
    );
    const customerUserId = custRows[0].user_id;
    const [proRows] = await conn.query(
      `SELECT u.id AS user_id FROM service_professionals sp JOIN users u ON u.id = sp.user_id WHERE sp.id = ?`,
      [booking.professional_id]
    );
    const proUserId = proRows[0].user_id;

    if (![customerUserId, proUserId].includes(actorUserId)) throw new HttpError(403, 'Not a party to this booking');
    if (!['waiting_for_professional', 'accepted'].includes(booking.status)) {
      throw new HttpError(400, `Cannot cancel a booking in ${booking.status}`);
    }

    const proAccepted = booking.status === 'accepted';
    const held = Number(booking.final_price);

    // free the slot
    await conn.query(
      `UPDATE availability_slots SET is_booked = 0 WHERE professional_id = ? AND slot_date = ? AND start_time = ?`,
      [booking.professional_id, booking.scheduled_date, booking.scheduled_slot]
    );

    if (actorRole === 'customer') {
      let refundPercent = 100;
      if (proAccepted) refundPercent = settings.customerCancelRefundPercent; // 85% default
      const refundAmount = Math.round(held * (refundPercent / 100) * 100) / 100;
      await walletService.refundHold(conn, customerUserId, bookingId, refundAmount, `Customer cancellation (${refundPercent}% refund)`);
      if (refundPercent < 100) {
        const cut = held - refundAmount; // 15% cut (admin-configurable refund%) split: pro compensation + platform (Section 10.1)
        const proShare = Math.round(held * (settings.customerCancelProCompensationPercent / 100) * 100) / 100;
        const platShare = Math.round((cut - proShare) * 100) / 100;
        // professional compensation (slot-block) goes to their wallet ledger
        const [proWallet] = await conn.query(`SELECT id FROM wallets WHERE user_id = ?`, [proUserId]);
        if (proWallet.length) {
          await conn.query(`UPDATE wallets SET balance = balance + ? WHERE id = ?`, [proShare, proWallet[0].id]);
          const [pwAfter] = await conn.query(`SELECT balance FROM wallets WHERE id = ?`, [proWallet[0].id]);
          await walletService.addLedger(conn, proWallet[0].id, 'commission', proShare, bookingId, 'Compensation share of customer cancellation cut', pwAfter[0].balance);
        }
        // platform share recorded as commission revenue
        await conn.query(
          `INSERT INTO commissions (booking_id, amount, percentage) VALUES (?, ?, 0.00)`,
          [bookingId, platShare]
        );
        await conn.query(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`, [bookingId]);
      } else {
        await conn.query(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`, [bookingId]);
      }
      await conn.query(
        `INSERT INTO refunds (booking_id, amount, reason, status, processed_at) VALUES (?, ?, 'Customer cancellation', 'processed', NOW())`,
        [bookingId, refundAmount]
      );
      await logBookingEvent(conn, bookingId, 'cancelled', actorUserId, `Customer cancelled; refund ${refundPercent}%`);
      await adjustTrustScore(customerUserId, proAccepted ? -5 : -1);
      await notify(proUserId, 'booking', `Booking ${booking.booking_code} cancelled by customer`, bookingId);
      return { status: 'cancelled', refund_amount: refundAmount };
    }

    // Professional cancels (Section 10.1): 100% refund + 10% penalty as owed entry
    await walletService.refundHold(conn, customerUserId, bookingId, held, 'Professional cancellation - full refund');
    await conn.query(
      `INSERT INTO refunds (booking_id, amount, reason, status, processed_at) VALUES (?, ?, 'Professional cancellation', 'processed', NOW())`,
      [bookingId, held]
    );
    await conn.query(`UPDATE bookings SET status = 'cancelled' WHERE id = ?`, [bookingId]);
    const penaltyAmount = Math.round(held * (settings.proCancelPenaltyPercent / 100) * 100) / 100;
    if (proAccepted) {
      await conn.query(
        `INSERT INTO professional_penalties (professional_id, booking_id, amount, reason) VALUES (?, ?, ?, 'Cancellation penalty')`,
        [booking.professional_id, bookingId, penaltyAmount]
      );
    }
    await logBookingEvent(conn, bookingId, 'cancelled', actorUserId, `Professional cancelled; penalty Rs ${penaltyAmount}`);
    await adjustTrustScore(proUserId, -10);
    await notify(customerUserId, 'booking', `Booking ${booking.booking_code} cancelled by professional; full refund in wallet`, bookingId);
    return { status: 'cancelled', penalty_recorded: proAccepted ? penaltyAmount : 0 };
  });
}

// ---------- Auto-release timer (Section 8.4) ----------

async function runAutoRelease() {
  const [rows] = await pool.query(
    `SELECT id FROM bookings WHERE status = 'work_completed' AND auto_release_at IS NOT NULL AND auto_release_at <= NOW()`
  );
  let released = 0;
  for (const row of rows) {
    try {
      await withTransaction(async (conn) => {
        const [b] = await conn.query(`SELECT id FROM bookings WHERE id = ? AND status = 'work_completed' FOR UPDATE`, [row.id]);
        if (!b.length) return;
        await walletService.releaseForBooking(conn, row.id, 'auto_release_timer');
        released += 1;
      });
    } catch (err) {
      console.error(`[auto-release] booking ${row.id} failed:`, err.message);
    }
  }
  return released;
}

// ---------- shared context helpers ----------

async function proBookingContext(conn, proUserId, bookingId) {
  const [rows] = await conn.query(
    `SELECT b.*, sp.id AS sp_id FROM bookings b JOIN service_professionals sp ON sp.id = b.professional_id WHERE b.id = ?`,
    [bookingId]
  );
  if (!rows.length) throw new HttpError(404, 'Booking not found');
  if (rows[0].sp_id !== (await getProIdByUser(conn, proUserId))) throw new HttpError(403, 'Not your booking');
  const [cust] = await conn.query(
    `SELECT u.id AS user_id FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
    [rows[0].customer_id]
  );
  return { booking: rows[0], customerUserId: cust[0].user_id, userId: proUserId };
}

async function custBookingContext(conn, customerUserId, bookingId) {
  const [rows] = await conn.query(`SELECT * FROM bookings WHERE id = ?`, [bookingId]);
  if (!rows.length) throw new HttpError(404, 'Booking not found');
  const [cust] = await conn.query(
    `SELECT u.id AS user_id FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = ?`,
    [rows[0].customer_id]
  );
  if (cust[0].user_id !== customerUserId) throw new HttpError(403, 'Not your booking');
  return { booking: rows[0], userId: customerUserId };
}

async function getProIdByUser(conn, userId) {
  const [rows] = await conn.query(`SELECT id FROM service_professionals WHERE user_id = ?`, [userId]);
  return rows.length ? rows[0].id : null;
}

// ---------- Counter-offer (pro apni price bolta hai, customer accept/reject) ----------

async function makeOffer(proUserId, bookingId, { offered_price, message, arrival_minutes }) {
  if (!(Number(offered_price) > 0)) throw new HttpError(400, 'offered_price must be > 0');
  return withTransaction(async (conn) => {
    const ctx = await proBookingContext(conn, proUserId, bookingId);
    if (ctx.booking.status !== 'waiting_for_professional') throw new HttpError(400, `Offer sirf waiting_for_professional stage par (abhi: ${ctx.booking.status})`);
    await conn.query(
      `UPDATE bookings SET offered_price = ?, offer_message = ?, offer_status = 'pending', arrival_minutes = ? WHERE id = ?`,
      [Number(offered_price), message || null, arrival_minutes ? Number(arrival_minutes) : null, bookingId]
    );
    await logBookingEvent(conn, bookingId, 'offer_made', proUserId, `Offer: Rs ${offered_price}${arrival_minutes ? ` in ${arrival_minutes} min` : ''}`);
    await notify(ctx.customerUserId, 'booking', `Professional ne offer diya on ${ctx.booking.booking_code}: Rs ${offered_price} — dashboard par accept/reject karein`, bookingId);
    return { offer_status: 'pending', offered_price: Number(offered_price) };
  });
}

async function respondOffer(customerUserId, bookingId, accept) {
  return withTransaction(async (conn) => {
    const ctx = await custBookingContext(conn, customerUserId, bookingId);
    if (ctx.booking.offer_status !== 'pending') throw new HttpError(400, 'Koi pending offer nahi hai');
    if (ctx.booking.status !== 'waiting_for_professional') throw new HttpError(400, 'Offer sirf waiting stage par respond ho sakta hai');
    if (accept) {
      // price update ho kar deal finalize ho jati hai — customer ab pay karega (escrow)
      await conn.query(`UPDATE bookings SET final_price = ?, offer_status = 'accepted' WHERE id = ?`, [Number(ctx.booking.offered_price), bookingId]);
      await logBookingEvent(conn, bookingId, 'offer_accepted', ctx.userId, `Customer accepted offer Rs ${ctx.booking.offered_price}`);
      await notify(ctx.proUserId, 'booking', `Customer ne aap ka offer accept kiya on ${ctx.booking.booking_code} — deal finalized at Rs ${ctx.booking.offered_price}`, bookingId);
      return { offer_status: 'accepted', final_price: Number(ctx.booking.offered_price), next_step: 'POST /customer/bookings/:id/pay (escrow hold)' };
    }
    await conn.query(`UPDATE bookings SET offer_status = 'rejected' WHERE id = ?`, [bookingId]);
    await logBookingEvent(conn, bookingId, 'offer_rejected', ctx.userId, 'Customer rejected the offer');
    await notify(ctx.proUserId, 'booking', `Customer ne offer reject kar diya on ${ctx.booking.booking_code}`, bookingId);
    return { offer_status: 'rejected' };
  });
}

// ---------- Live location share (free: browser geolocation -> DB -> LiveMap) ----------

async function shareLocation(userId, role, bookingId, { lat, lng }) {
  const la = Number(lat), ln = Number(lng);
  if (!Number.isFinite(la) || !Number.isFinite(ln) || la < -90 || la > 90 || ln < -180 || ln > 180) {
    throw new HttpError(400, 'Invalid lat/lng');
  }
  return withTransaction(async (conn) => {
    const [bookings] = await conn.query(`SELECT * FROM bookings WHERE id = ? FOR UPDATE`, [bookingId]);
    const b = bookings[0];
    if (!b) throw new HttpError(404, 'Booking not found');
    const [custRows] = await conn.query(`SELECT u.id AS uid FROM customers c JOIN users u ON u.id = c.user_id WHERE c.id = ?`, [b.customer_id]);
    const [proRows] = await conn.query(`SELECT u.id AS uid FROM service_professionals sp JOIN users u ON u.id = sp.user_id WHERE sp.id = ?`, [b.professional_id]);
    const custUid = custRows[0]?.uid, proUid = proRows[0]?.uid;
    if (![custUid, proUid].includes(userId)) throw new HttpError(403, 'Not a party to this booking');
    const col = role === 'professional' ? 'pro' : 'customer';
    if (role === 'professional' && userId !== proUid) throw new HttpError(403, 'Not your booking');
    if (role === 'customer' && userId !== custUid) throw new HttpError(403, 'Not your booking');
    await conn.query(
      `UPDATE bookings SET ${col}_lat = ?, ${col}_lng = ?, ${col}_loc_at = NOW() WHERE id = ?`,
      [la, ln, bookingId]
    );
    const other = role === 'professional' ? custUid : proUid;
    await notify(other, 'booking', `${role === 'professional' ? 'Professional' : 'Customer'} ne live location share ki on ${b.booking_code}`, bookingId);
    return { shared: true, lat: la, lng: ln };
  });
}

// ---------- Late / no-show (Section 10 flow: arrival timeline) ----------

async function lateNotify(proUserId, bookingId, { reason, new_eta_minutes }) {
  return withTransaction(async (conn) => {
    const ctx = await proBookingContext(conn, proUserId, bookingId);
    if (!['accepted', 'on_the_way'].includes(ctx.booking.status)) throw new HttpError(400, 'Late notify sirf accept ke baad');
    await conn.query(`UPDATE bookings SET late_notified = 1 WHERE id = ?`, [bookingId]);
    await logBookingEvent(conn, bookingId, 'late_notified', proUserId, `Late: ${reason || 'no reason'} (ETA +${new_eta_minutes || '?'} min)`);
    await notify(ctx.customerUserId, 'booking', `Professional late hai on ${ctx.booking.booking_code}: ${reason || ''} — aap approve ya cancel kar sakte hain (cancel par 100% refund)`, bookingId);
    return { late_notified: true };
  });
}

// Customer approves late arrival => kisi ke paise nahi katte (commission release par normal lagegi)
async function lateApprove(customerUserId, bookingId) {
  return withTransaction(async (conn) => {
    const ctx = await custBookingContext(conn, customerUserId, bookingId);
    await conn.query(`UPDATE bookings SET late_approved = 1 WHERE id = ?`, [bookingId]);
    await logBookingEvent(conn, bookingId, 'late_approved', ctx.userId, 'Customer approved late arrival — no penalty');
    await notify(ctx.proUserId, 'booking', `Customer ne late arrival approve kar di on ${ctx.booking.booking_code} — koi penalty nahi`, bookingId);
    return { late_approved: true };
  });
}

module.exports = {
  ACTIVE_STATUSES,
  searchProfessionals,
  getProfessionalProfile,
  createBooking,
  payBooking,
  proAccept,
  proReject,
  proStatus,
  customerConfirmArrival,
  customerConfirmComplete,
  customerDispute,
  getCancelPreview,
  cancelBooking,
  runAutoRelease,
  makeOffer,
  respondOffer,
  shareLocation,
  lateNotify,
  lateApprove,
};
