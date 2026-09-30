-- Seed data: categories, admin, demo professionals/customers, sample slots
USE hunar;

-- Platform settings (Section 10 + 8 defaults)
INSERT INTO platform_settings (setting_key, setting_value) VALUES
  ('commission_percent', '10'),
  ('auto_release_hours', '24'),
  ('min_advance_booking_hours', '2'),
  ('max_advance_booking_days', '30'),
  ('customer_cancel_refund_percent', '85'),
  ('customer_cancel_pro_compensation_percent', '10'),
  ('pro_cancel_penalty_percent', '10'),
  ('max_no_shows_before_suspend', '3')
ON DUPLICATE KEY UPDATE setting_value = VALUES(setting_value);

-- Categories (Section 5)
INSERT INTO categories (name, description, icon) VALUES
  ('AC Technician', 'Gas fill, service, installation', 'ac'),
  ('Electrician', 'Wiring, switchboard, fan/light install', 'zap'),
  ('Plumber', 'Leakage, pipe fitting, tank/motor', 'droplet'),
  ('Painter', 'Room/house painting, texture', 'paint'),
  ('Carpenter', 'Furniture repair, door/window fitting', 'hammer'),
  ('Tailor', 'Stitching, alteration, bulk uniform orders', 'scissors'),
  ('Appliance Repair', 'Washing machine, fridge, microwave', 'wrench'),
  ('Other / Custom', 'Custom requests', 'grid')
ON DUPLICATE KEY UPDATE description = VALUES(description);

-- Admin user (password from env ADMIN_PASSWORD, default Admin@123)
INSERT INTO users (phone, email, password_hash, role, status, preferred_language)
VALUES ('03000000000', 'admin@hunar.pk', '$2a$10$jgbPiW3bTA3zO6I36xGEV..wtPzHKQvBafboShOYITWlfRwEuFKMq', 'admin', 'active', 'en')
ON DUPLICATE KEY UPDATE email = VALUES(email);

-- Demo customer: phone 03001234567 / OTP login (any OTP accepted in dev mode)
INSERT INTO users (phone, role, status, preferred_language)
VALUES ('03001234567', 'customer', 'active', 'en')
ON DUPLICATE KEY UPDATE phone = VALUES(phone);

INSERT INTO customers (user_id, full_name)
SELECT id, 'Ali Raza' FROM users WHERE phone = '03001234567'
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

-- Wallet for demo customer
INSERT INTO wallets (user_id, balance)
SELECT id, 20000.00 FROM users WHERE phone = '03001234567'
ON DUPLICATE KEY UPDATE balance = balance;

INSERT INTO wallet_transactions (wallet_id, type, amount, note, balance_after)
SELECT w.id, 'topup', 20000.00, 'Demo seed top-up', 20000.00
FROM wallets w JOIN users u ON u.id = w.user_id WHERE u.phone = '03001234567'
AND NOT EXISTS (SELECT 1 FROM wallet_transactions t WHERE t.wallet_id = w.id AND t.type = 'topup');

-- Wallet for demo contract customer (Sadia Khan) — seed balance ko ledger-tracked banata hai
INSERT INTO wallets (user_id, balance)
SELECT id, 100000.00 FROM users WHERE phone = '03012222222'
ON DUPLICATE KEY UPDATE balance = balance;

INSERT INTO wallet_transactions (wallet_id, type, amount, note, balance_after)
SELECT w.id, 'topup', 100000.00, 'Demo seed top-up (contracts)', 100000.00
FROM wallets w JOIN users u ON u.id = w.user_id WHERE u.phone = '03012222222'
AND NOT EXISTS (SELECT 1 FROM wallet_transactions t WHERE t.wallet_id = w.id AND t.type = 'topup' AND t.note LIKE 'Demo seed%');

-- Demo address
INSERT INTO customer_addresses (customer_id, label, city, area, full_address, latitude, longitude, is_default)
SELECT c.id, 'home', 'Lahore', 'Gulberg III', 'House 12, Street 5, Gulberg III, Lahore', 31.5155, 74.3436, 1
FROM customers c JOIN users u ON u.id = c.user_id WHERE u.phone = '03001234567'
AND NOT EXISTS (SELECT 1 FROM customer_addresses ca WHERE ca.customer_id = c.id);

-- Demo professionals (verified) - login via phone OTP
INSERT INTO users (phone, role, status, preferred_language) VALUES
  ('03011111111', 'professional', 'active', 'en'),
  ('03011111112', 'professional', 'active', 'en'),
  ('03011111113', 'professional', 'active', 'en')
ON DUPLICATE KEY UPDATE phone = VALUES(phone);

INSERT INTO service_professionals (user_id, full_name, cnic_number, verification_status, experience_years, bio, payout_account, payout_provider)
SELECT u.id, v.full_name, v.cnic, 'verified', v.exp, v.bio, v.payout, 'jazzcash'
FROM users u
JOIN (
  SELECT '03011111111' AS phone, 'Imran Yousaf' AS full_name, '3520212345671' AS cnic, 8 AS exp, 'Senior AC technician. Gas filling, installation, service.' AS bio, '03011111111' AS payout
  UNION ALL SELECT '03011111112', 'Bilal Ahmed', '3520212345672', 5, 'Licensed electrician. Wiring, fans, switchboards.', '03011111112'
  UNION ALL SELECT '03011111113', 'Kashif Nadeem', '3520212345673', 6, 'Expert plumber. Leakage, motors, tank fitting.', '03011111113'
) v ON v.phone = u.phone
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

-- Link professionals to categories
INSERT IGNORE INTO professional_categories (professional_id, category_id)
SELECT sp.id,
  CASE v.phone WHEN '03011111111' THEN (SELECT id FROM categories WHERE name='AC Technician')
               WHEN '03011111112' THEN (SELECT id FROM categories WHERE name='Electrician')
               WHEN '03011111113' THEN (SELECT id FROM categories WHERE name='Plumber') END
FROM service_professionals sp
JOIN users u ON u.id = sp.user_id
JOIN (SELECT '03011111111' AS phone UNION ALL SELECT '03011111112' UNION ALL SELECT '03011111113') v ON v.phone = u.phone;

-- Service areas
INSERT IGNORE INTO service_areas (professional_id, city, area)
SELECT sp.id, 'Lahore', v.area
FROM service_professionals sp
JOIN users u ON u.id = sp.user_id
JOIN (
  SELECT '03011111111' AS phone, 'Gulberg III' AS area
  UNION ALL SELECT '03011111111', 'DHA Phase 5'
  UNION ALL SELECT '03011111112', 'Gulberg III'
  UNION ALL SELECT '03011111112', 'Model Town'
  UNION ALL SELECT '03011111113', 'Johar Town'
  UNION ALL SELECT '03011111113', 'Gulberg III'
) v ON v.phone = u.phone;

-- Availability slots: next 7 days 09:00-17:00 per professional
INSERT IGNORE INTO availability_slots (professional_id, slot_date, start_time, end_time)
SELECT sp.id,
       CURDATE() + INTERVAL n DAY,
       MAKETIME(h, 0, 0),
       MAKETIME(h + 2, 0, 0)
FROM service_professionals sp
JOIN (
  SELECT 0 AS n UNION ALL SELECT 1 UNION ALL SELECT 2 UNION ALL SELECT 3
  UNION ALL SELECT 4 UNION ALL SELECT 5 UNION ALL SELECT 6
) nums
JOIN (
  SELECT 9 AS h UNION ALL SELECT 11 UNION ALL SELECT 13 UNION ALL SELECT 15
) hours;

-- One pending verification demo (professional awaiting admin review)
INSERT INTO users (phone, role, status, preferred_language)
VALUES ('03014444444', 'professional', 'active', 'en')
ON DUPLICATE KEY UPDATE phone = VALUES(phone);

INSERT INTO service_professionals (user_id, full_name, cnic_number, verification_status, experience_years, bio, payout_account, payout_provider)
SELECT u.id, 'Zafar Iqbal', '3520299999999', 'pending', 3, 'Painter - new applicant', '03014444444', 'easypaisa'
FROM users u WHERE u.phone = '03014444444'
ON DUPLICATE KEY UPDATE full_name = VALUES(full_name);

INSERT IGNORE INTO professional_categories (professional_id, category_id)
SELECT sp.id, (SELECT id FROM categories WHERE name = 'Painter')
FROM service_professionals sp JOIN users u ON u.id = sp.user_id WHERE u.phone = '03014444444';

INSERT IGNORE INTO service_areas (professional_id, city, area)
SELECT sp.id, 'Lahore', 'Gulberg III'
FROM service_professionals sp JOIN users u ON u.id = sp.user_id WHERE u.phone = '03014444444';
INSERT INTO contracts (contract_code, customer_id, category_id, workers_needed, duration_days, start_date, budget_min, budget_max, description, status)
SELECT 'HCDEMO01', (SELECT id FROM customers WHERE user_id = (SELECT id FROM users WHERE phone='03012222222')), c.id, 2, 7, CURDATE() + INTERVAL 3 DAY, 25000, 40000,
  'Office wiring renovation: 2 electricians needed for 7 days. DHA Phase 5 commercial building. Material humari taraf se.', 'open'
FROM categories c WHERE c.name = 'Electrician' AND NOT EXISTS (SELECT 1 FROM contracts WHERE contract_code='HCDEMO01');
INSERT INTO contracts (contract_code, customer_id, category_id, workers_needed, duration_days, start_date, budget_min, budget_max, description, status)
SELECT 'HCDEMO02', (SELECT id FROM customers WHERE user_id = (SELECT id FROM users WHERE phone='03012222222')), c.id, 3, 5, CURDATE() + INTERVAL 5 DAY, 40000, 60000,
  '100 split AC units installation - 3 technicians, 5 days. Gulberg commercial plaza.', 'open'
FROM categories c WHERE c.name = 'AC Technician' AND NOT EXISTS (SELECT 1 FROM contracts WHERE contract_code='HCDEMO02');
INSERT INTO contracts (contract_code, customer_id, category_id, workers_needed, duration_days, start_date, budget_min, budget_max, description, status)
SELECT 'HCDEMO03', (SELECT id FROM customers WHERE user_id = (SELECT id FROM users WHERE phone='03012222222')), c.id, 1, 3, CURDATE() + INTERVAL 2 DAY, 8000, 15000,
  'Full house repaint - 2 bed lounge + 3 rooms. Johar Town. Paint provided.', 'open'
FROM categories c WHERE c.name = 'Painter' AND NOT EXISTS (SELECT 1 FROM contracts WHERE contract_code='HCDEMO03');
