-- =====================================================================
-- Hunar Database Schema
-- Complete Transaction Marketplace for Home Services & Skilled Trades
-- 27 plan modules (Section 12) + supporting audit/config tables
-- =====================================================================

SET FOREIGN_KEY_CHECKS = 0;

-- 1. users: common login/auth for all roles
CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL UNIQUE,
  email VARCHAR(190) NULL,
  password_hash VARCHAR(255) NULL,
  role ENUM('customer','professional','admin') NOT NULL DEFAULT 'customer',
  status ENUM('active','suspended','deleted') NOT NULL DEFAULT 'active',
  preferred_language ENUM('ur','en') NOT NULL DEFAULT 'en',
  last_login_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  INDEX idx_users_role (role),
  INDEX idx_users_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2. customers: customer-specific profile
CREATE TABLE IF NOT EXISTS customers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  profile_photo VARCHAR(500) NULL,
  trust_score DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3. customer_addresses: multiple saved addresses per customer
CREATE TABLE IF NOT EXISTS customer_addresses (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  customer_id BIGINT UNSIGNED NOT NULL,
  label ENUM('home','office','other') NOT NULL DEFAULT 'home',
  city VARCHAR(80) NOT NULL DEFAULT 'Lahore',
  area VARCHAR(120) NULL,
  full_address VARCHAR(500) NOT NULL,
  latitude DECIMAL(10,7) NULL,
  longitude DECIMAL(10,7) NULL,
  is_default TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id) ON DELETE CASCADE,
  INDEX idx_addr_customer (customer_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 4. service_professionals: full professional profile + verification
CREATE TABLE IF NOT EXISTS service_professionals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  full_name VARCHAR(120) NOT NULL,
  cnic_number VARCHAR(15) NOT NULL,
  cnic_front_photo VARCHAR(500) NULL,
  cnic_back_photo VARCHAR(500) NULL,
  selfie_photo VARCHAR(500) NULL,
  profile_photo VARCHAR(500) NULL,
  experience_years INT NOT NULL DEFAULT 0,
  bio VARCHAR(1000) NULL,
  base_pricing_json JSON NULL,
  verification_status ENUM('pending','verified','rejected') NOT NULL DEFAULT 'pending',
  verification_note VARCHAR(500) NULL,
  payout_account VARCHAR(30) NULL,
  payout_provider ENUM('jazzcash','easypaisa','bank') NULL,
  average_rating DECIMAL(3,2) NOT NULL DEFAULT 0.00,
  completed_jobs INT NOT NULL DEFAULT 0,
  trust_score DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  available_now TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_pro_verification (verification_status),
  INDEX idx_pro_cnic (cnic_number)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 5. categories: master service-category list
CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  description VARCHAR(500) NULL,
  icon VARCHAR(50) NULL,
  is_active TINYINT(1) NOT NULL DEFAULT 1,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 6. professional_categories: many-to-many
CREATE TABLE IF NOT EXISTS professional_categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  professional_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  UNIQUE KEY uq_pro_cat (professional_id, category_id),
  FOREIGN KEY (professional_id) REFERENCES service_professionals(id) ON DELETE CASCADE,
  FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 7. service_areas: professional coverage areas
CREATE TABLE IF NOT EXISTS service_areas (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  professional_id BIGINT UNSIGNED NOT NULL,
  city VARCHAR(80) NOT NULL DEFAULT 'Lahore',
  area VARCHAR(120) NOT NULL,
  FOREIGN KEY (professional_id) REFERENCES service_professionals(id) ON DELETE CASCADE,
  UNIQUE KEY uq_pro_area (professional_id, city, area)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 8. availability_slots: calendar, double-booking prevention
CREATE TABLE IF NOT EXISTS availability_slots (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  professional_id BIGINT UNSIGNED NOT NULL,
  slot_date DATE NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  is_booked TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES service_professionals(id) ON DELETE CASCADE,
  UNIQUE KEY uq_slot (professional_id, slot_date, start_time),
  INDEX idx_slot_lookup (professional_id, slot_date, is_booked)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 9. bookings: core booking record
CREATE TABLE IF NOT EXISTS bookings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_code VARCHAR(20) NOT NULL UNIQUE,
  customer_id BIGINT UNSIGNED NOT NULL,
  professional_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  address_id BIGINT UNSIGNED NULL,
  service_address VARCHAR(500) NULL,
  scheduled_date DATE NOT NULL,
  scheduled_slot TIME NOT NULL,
  description VARCHAR(1000) NULL,
  final_price DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  booking_fee DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  otp_code VARCHAR(6) NULL,
  status ENUM(
    'pending_payment','paid','waiting_for_professional','accepted','on_the_way',
    'arrived','work_started','work_completed','customer_confirmed','completed',
    'cancelled','disputed','refunded'
  ) NOT NULL DEFAULT 'pending_payment',
  is_urgent TINYINT(1) NOT NULL DEFAULT 0,
  completed_at DATETIME NULL,
  auto_release_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (professional_id) REFERENCES service_professionals(id),
  FOREIGN KEY (category_id) REFERENCES categories(id),
  INDEX idx_booking_status (status),
  INDEX idx_booking_customer (customer_id, status),
  INDEX idx_booking_pro (professional_id, status),
  INDEX idx_auto_release (status, auto_release_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 10. booking_events: full timeline/audit trail
CREATE TABLE IF NOT EXISTS booking_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  actor_user_id BIGINT UNSIGNED NULL,
  note VARCHAR(500) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  INDEX idx_events_booking (booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 11. messages: in-app chat + contact-info filter
CREATE TABLE IF NOT EXISTS messages (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  sender_id BIGINT UNSIGNED NOT NULL,
  text TEXT NOT NULL,
  flagged TINYINT(1) NOT NULL DEFAULT 0,
  flag_reason VARCHAR(200) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  INDEX idx_msg_booking (booking_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 12. payments: customer payment records
CREATE TABLE IF NOT EXISTS payments (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  payment_method ENUM('jazzcash','easypaisa','wallet') NOT NULL DEFAULT 'wallet',
  transaction_ref VARCHAR(100) NULL,
  status ENUM('pending','success','failed') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL,
  INDEX idx_pay_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 13. commissions: platform 10% per confirmed deal (booking_id NULL = contract milestone commission)
CREATE TABLE IF NOT EXISTS commissions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NULL,
  amount DECIMAL(12,2) NOT NULL,
  percentage DECIMAL(5,2) NOT NULL DEFAULT 10.00,
  calculated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 14. payouts: released money to professionals
CREATE TABLE IF NOT EXISTS payouts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  professional_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NULL,
  amount DECIMAL(12,2) NOT NULL,
  status ENUM('pending','released','failed') NOT NULL DEFAULT 'released',
  released_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES service_professionals(id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 15. refunds: refund records per cancellation rules
CREATE TABLE IF NOT EXISTS refunds (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  reason VARCHAR(300) NULL,
  status ENUM('pending','processed') NOT NULL DEFAULT 'processed',
  processed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 16. disputes: complaint/dispute management
CREATE TABLE IF NOT EXISTS disputes (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  raised_by BIGINT UNSIGNED NOT NULL,
  description VARCHAR(1000) NOT NULL,
  status ENUM('open','under_review','resolved_customer','resolved_professional','closed') NOT NULL DEFAULT 'open',
  resolution VARCHAR(1000) NULL,
  resolved_by BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  INDEX idx_dispute_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 17. reviews: only completed bookings
CREATE TABLE IF NOT EXISTS reviews (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  booking_id BIGINT UNSIGNED NOT NULL,
  customer_id BIGINT UNSIGNED NOT NULL,
  professional_id BIGINT UNSIGNED NOT NULL,
  rating TINYINT NOT NULL,
  comment VARCHAR(1000) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE KEY uq_review_booking (booking_id),
  FOREIGN KEY (booking_id) REFERENCES bookings(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (professional_id) REFERENCES service_professionals(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 18. notifications: in-app notification log
CREATE TABLE IF NOT EXISTS notifications (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL,
  title VARCHAR(200) NULL,
  message VARCHAR(1000) NOT NULL,
  related_booking_id BIGINT UNSIGNED NULL,
  read_status TINYINT(1) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_notif_user (user_id, read_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 19. trust_scores: cancellation/no-show/dispute tracking
CREATE TABLE IF NOT EXISTS trust_scores (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  role ENUM('customer','professional') NOT NULL,
  score DECIMAL(5,2) NOT NULL DEFAULT 100.00,
  flags_count INT NOT NULL DEFAULT 0,
  last_updated TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 20. contracts: bulk/contract hiring
CREATE TABLE IF NOT EXISTS contracts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contract_code VARCHAR(20) NOT NULL UNIQUE,
  customer_id BIGINT UNSIGNED NOT NULL,
  category_id BIGINT UNSIGNED NOT NULL,
  workers_needed INT NOT NULL DEFAULT 1,
  duration_days INT NOT NULL DEFAULT 1,
  start_date DATE NOT NULL,
  budget_min DECIMAL(12,2) NOT NULL,
  budget_max DECIMAL(12,2) NOT NULL,
  description VARCHAR(1000) NULL,
  status ENUM('open','awarded','in_progress','completed','cancelled') NOT NULL DEFAULT 'open',
  awarded_bid_id BIGINT UNSIGNED NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (customer_id) REFERENCES customers(id),
  FOREIGN KEY (category_id) REFERENCES categories(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 21. contract_bids: professional quotes
CREATE TABLE IF NOT EXISTS contract_bids (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contract_id BIGINT UNSIGNED NOT NULL,
  professional_id BIGINT UNSIGNED NOT NULL,
  quoted_price DECIMAL(12,2) NOT NULL,
  quoted_timeline VARCHAR(100) NULL,
  note VARCHAR(500) NULL,
  status ENUM('submitted','selected','rejected') NOT NULL DEFAULT 'submitted',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
  FOREIGN KEY (professional_id) REFERENCES service_professionals(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 22. contract_milestones: milestone-based contract payments
CREATE TABLE IF NOT EXISTS contract_milestones (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  contract_id BIGINT UNSIGNED NOT NULL,
  milestone_no INT NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  description VARCHAR(500) NULL,
  status ENUM('pending','held','released','disputed') NOT NULL DEFAULT 'pending',
  released_at DATETIME NULL,
  FOREIGN KEY (contract_id) REFERENCES contracts(id) ON DELETE CASCADE,
  UNIQUE KEY uq_milestone (contract_id, milestone_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 23. verification_logs: manual verification audit trail
CREATE TABLE IF NOT EXISTS verification_logs (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  professional_id BIGINT UNSIGNED NOT NULL,
  reviewed_by BIGINT UNSIGNED NOT NULL,
  decision ENUM('approved','rejected') NOT NULL,
  notes VARCHAR(1000) NULL,
  reviewed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES service_professionals(id) ON DELETE CASCADE,
  FOREIGN KEY (reviewed_by) REFERENCES users(id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 24. wallets: live balance per user
CREATE TABLE IF NOT EXISTS wallets (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL UNIQUE,
  balance DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  held_amount DECIMAL(12,2) NOT NULL DEFAULT 0.00,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 25. wallet_transactions: complete wallet ledger
CREATE TABLE IF NOT EXISTS wallet_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  wallet_id BIGINT UNSIGNED NOT NULL,
  type ENUM('topup','hold','release','refund','payout','penalty','commission') NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  related_booking_id BIGINT UNSIGNED NULL,
  note VARCHAR(300) NULL,
  balance_after DECIMAL(12,2) NOT NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
  INDEX idx_wtx_wallet (wallet_id, created_at),
  INDEX idx_wtx_booking (related_booking_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 26. wallet_topups: top-up gateway records
CREATE TABLE IF NOT EXISTS wallet_topups (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  wallet_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  provider ENUM('jazzcash','easypaisa') NOT NULL,
  mobile_number VARCHAR(20) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  gateway_transaction_ref VARCHAR(100) NULL,
  status ENUM('pending','success','failed','expired') NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  completed_at DATETIME NULL,
  FOREIGN KEY (wallet_id) REFERENCES wallets(id) ON DELETE CASCADE,
  INDEX idx_topup_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 27. professional_penalties: pro-cancel owed amount, auto-deducted from next payouts
CREATE TABLE IF NOT EXISTS professional_penalties (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  professional_id BIGINT UNSIGNED NOT NULL,
  booking_id BIGINT UNSIGNED NULL,
  amount DECIMAL(12,2) NOT NULL,
  reason VARCHAR(300) NULL,
  settled TINYINT(1) NOT NULL DEFAULT 0,
  settled_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (professional_id) REFERENCES service_professionals(id) ON DELETE CASCADE,
  INDEX idx_penalty_pro (professional_id, settled)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- =====================================================================
-- Supporting tables (OTP logins, platform settings)
-- =====================================================================

-- otp_logins: dev OTP codes + expiry (swap with SMS provider in production)
CREATE TABLE IF NOT EXISTS otp_logins (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  phone VARCHAR(20) NOT NULL,
  code_hash VARCHAR(255) NOT NULL,
  purpose ENUM('login','verify') NOT NULL DEFAULT 'login',
  attempts INT NOT NULL DEFAULT 0,
  expires_at DATETIME NOT NULL,
  consumed_at DATETIME NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  INDEX idx_otp_phone (phone, expires_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- platform_settings: admin-configurable rules
CREATE TABLE IF NOT EXISTS platform_settings (
  setting_key VARCHAR(60) PRIMARY KEY,
  setting_value VARCHAR(200) NOT NULL,
  updated_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- withdrawals: cash-out requests (customer + professional) to JazzCash/Easypaisa
CREATE TABLE IF NOT EXISTS withdrawals (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  role ENUM('customer','professional') NOT NULL,
  provider ENUM('jazzcash','easypaisa') NOT NULL,
  account_number VARCHAR(20) NOT NULL,
  account_title VARCHAR(120) NOT NULL,
  amount DECIMAL(12,2) NOT NULL,
  status ENUM('pending','completed','rejected') NOT NULL DEFAULT 'pending',
  admin_note VARCHAR(300) NULL,
  created_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
  processed_at DATETIME NULL,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  INDEX idx_wd_user (user_id, status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = 1;
