<?php
/**
 * Hunar API - Vercel PHP bridge (deploy safety net)
 * ---------------------------------------------------
 * The Node/Express API (backend/) runs on any Node host (Render/Railway/Fly).
 * If only this repo is deployed on Vercel, every /api/* request is rewritten
 * here by root vercel.json. Set env vars in the Vercel project:
 *   API_BASE  - base URL of the hosted Node API (no trailing slash), e.g. https://hunar-api.onrender.com
 *   MIRROR_DB - optional: "1" enables direct MySQL mirroring of auth endpoints (requires DB_* vars)
 *
 * Mirrored endpoints (JSON in / JSON out, same shapes as Express API):
 *   POST /api/auth/register        -> creates user + customers row + wallet + OTP row (returns dev_otp)
 *   POST /api/auth/otp/request     -> issues OTP for existing email
 *   POST /api/auth/otp/verify      -> verifies OTP, returns { token, user, profile }
 *   POST /api/auth/password/login  -> email + password login
 *   POST /api/auth/admin/login     -> email/phone + password (admin only)
 */

header('Content-Type: application/json; charset=utf-8');
header('Access-Control-Allow-Origin: *');
header('Access-Control-Allow-Headers: Content-Type, Authorization');
header('Access-Control-Allow-Methods: GET, POST, PUT, PATCH, DELETE, OPTIONS');

if (($_SERVER['REQUEST_METHOD'] ?? 'GET') === 'OPTIONS') {
  http_response_code(204);
  exit;
}

$path = $_GET['path'] ?? '';
// Also accept method override via header so DELETE/PUT can pass through GET proxies
$method = $_SERVER['HTTP_X_HTTP_METHOD_OVERRIDE'] ?? $_SERVER['REQUEST_METHOD'] ?? 'GET';
$raw = file_get_contents('php://input');
$body = [];
if ($raw) {
  $decoded = json_decode($raw, true);
  if (is_array($decoded)) $body = $decoded;
}

function out(int $code, array $data): void {
  http_response_code($code);
  echo json_encode($data);
  exit;
}
function fail(int $code, string $message): void {
  out($code, ['error' => $message]);
}

$apiBase = rtrim((getenv('API_BASE') ?: getenv('API_BASE_URL') ?: ''), '/');

// ---- 1) Proxy everything to the real Node API when API_BASE is configured ----
if ($apiBase !== '') {
  $url = $apiBase . '/' . ltrim($path, '/');
  $qs = $_SERVER['QUERY_STRING'] ?? '';
  $qs = preg_replace('/(^|&)path=[^&]*/', '', $qs);
  if ($qs !== '') $url .= (strpos($url, '?') === false ? '?' : '&') . $qs;

  $ch = curl_init($url);
  curl_setopt_array($ch, [
    CURLOPT_RETURNTRANSFER => true,
    CURLOPT_CUSTOMREQUEST => $method,
    CURLOPT_TIMEOUT => 25,
    CURLOPT_HTTPHEADER => ['Content-Type: application/json', 'Accept: application/json'],
  ]);
  $auth = $_SERVER['HTTP_AUTHORIZATION'] ?? ($_SERVER['REDIRECT_HTTP_AUTHORIZATION'] ?? '');
  if ($auth) curl_setopt($ch, CURLOPT_HTTPHEADER, ['Content-Type: application/json', 'Accept: application/json', 'Authorization: ' . $auth]);
  if ($method !== 'GET' && $raw !== false && $raw !== '') curl_setopt($ch, CURLOPT_POSTFIELDS, $raw);
  $resp = curl_exec($ch);
  $status = curl_getinfo($ch, CURLINFO_RESPONSE_CODE) ?: 502;
  $err = curl_error($ch);
  curl_close($ch);
  if ($resp === false) fail(502, 'API upstream error: ' . $err);
  http_response_code($status);
  header('Content-Type: application/json; charset=utf-8');
  echo $resp;
  exit;
}

// ---- 2) Direct mirror (no Node host needed) for the auth basics ----
if (getenv('MIRROR_DB') !== '1') {
  fail(503, 'API not configured. Set API_BASE (Node API URL) in environment, or MIRROR_DB=1 with DB_* vars.');
}

$dbHost = getenv('DB_HOST') ?: 'localhost';
$dbPort = (int)(getenv('DB_PORT') ?: 3306);
$dbUser = getenv('DB_USER') ?: 'root';
$dbPass = getenv('DB_PASSWORD') ?: '';
$dbName = getenv('DB_NAME') ?: 'hunar';

try {
  $pdo = new PDO("mysql:host=$dbHost;port=$dbPort;dbname=$dbName;charset=utf8mb4", $dbUser, $dbPass, [
    PDO::ATTR_ERRMODE => PDO::ERRMODE_EXCEPTION,
    PDO::ATTR_DEFAULT_FETCH_MODE => PDO::FETCH_ASSOC,
  ]);
} catch (PDOException $e) {
  fail(500, 'Database connection failed');
}

$jwtSecret = getenv('JWT_SECRET') ?: 'dev-secret-change-me';

/** Minimal HS256 JWT (compatible with jsonwebtoken) */
function b64url(string $s): string { return rtrim(strtr(base64_encode($s), '+/', '-_'), '='); }
function makeJwt(array $payload, string $secret): string {
  $payload['iat'] = time();
  $h = b64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
  $p = b64url(json_encode($payload));
  $sig = b64url(hash_hmac('sha256', "$h.$p", $secret, true));
  return "$h.$p.$sig";
}

function otpCode(string $phone, string $secret): string {
  return (string)substr(hash_hmac('sha256', 'hunar-otp:' . $phone, $secret), 0, 6);
}

function findUserByPhone(PDO $pdo, string $phone): ?array {
  $st = $pdo->prepare('SELECT * FROM users WHERE phone = ? LIMIT 1');
  $st->execute([$phone]);
  $u = $st->fetch();
  return $u ?: null;
}

function loginPayload(PDO $pdo, array $user, string $jwtSecret): array {
  $token = makeJwt([
    'sub' => (int)$user['id'],
    'role' => $user['role'],
    'phone' => $user['phone'],
    'exp' => time() + 7 * 24 * 3600,
  ], $jwtSecret);

  $profile = null;
  if ($user['role'] === 'customer') {
    $st = $pdo->prepare('SELECT id, full_name, address, city FROM customers WHERE user_id = ? LIMIT 1');
    $st->execute([(int)$user['id']]);
    $profile = $st->fetch() ?: null;
  } elseif ($user['role'] === 'professional') {
    $st = $pdo->prepare('SELECT id, full_name, city, category_id, verification_status FROM service_professionals WHERE user_id = ? LIMIT 1');
    $st->execute([(int)$user['id']]);
    $profile = $st->fetch() ?: null;
  } elseif ($user['role'] === 'admin') {
    $profile = ['full_name' => 'Administrator', 'email' => $user['email'], 'phone' => $user['phone']];
  }

  return [
    'token' => $token,
    'user' => ['id' => (int)$user['id'], 'phone' => $user['phone'], 'email' => $user['email'], 'role' => $user['role'], 'status' => $user['status']],
    'profile' => $profile,
  ];
}

$route = preg_replace('#^/#', '', $path);

if ($route === 'auth/register' && $method === 'POST') {
  $role = $body['role'] ?? '';
  if (!in_array($role, ['customer', 'professional'], true)) fail(400, 'role must be customer or professional');
  $phone = preg_replace('/[^0-9+]/', '', (string)($body['phone'] ?? ''));
  if (preg_match('/^92/', $phone)) $phone = '0' . substr($phone, 2);
  if (!preg_match('/^03[0-9]{9}$/', $phone)) fail(400, 'Invalid Pakistani mobile number (03XXXXXXXXX)');
  $fullName = trim((string)($body['full_name'] ?? ''));
  if ($fullName === '') fail(400, 'Full name required');
  $email = strtolower(trim((string)($body['email'] ?? '')));
  if (!preg_match('/^[A-Za-z][^\s@]*@[^\s@]+\.[A-Za-z]{2,}$/', $email)) fail(400, 'Valid email required (must start with an English letter)');
  $password = (string)($body['password'] ?? '');
  if (strlen($password) < 8) fail(400, 'Password min 8 characters');

  $st = $pdo->prepare('SELECT id FROM users WHERE phone = ?');
  $st->execute([$phone]);
  if ($st->fetch()) fail(409, 'This phone is already registered. Please login.');
  $st = $pdo->prepare('SELECT id FROM users WHERE email = ?');
  $st->execute([$email]);
  if ($st->fetch()) fail(409, 'This email is already registered. Please login.');

  $pdo->beginTransaction();
  try {
    $st = $pdo->prepare("INSERT INTO users (phone, email, password_hash, role, preferred_language) VALUES (?, ?, ?, ?, 'en')");
    $st->execute([$phone, $email, password_hash($password, PASSWORD_BCRYPT), $role]);
    $userId = (int)$pdo->lastInsertId();
    if ($role === 'customer') {
      $pdo->prepare('INSERT INTO customers (user_id, full_name) VALUES (?, ?)')->execute([$userId, $fullName]);
      $pdo->prepare('INSERT IGNORE INTO wallets (user_id) VALUES (?)')->execute([$userId]);
      $pdo->prepare("INSERT INTO trust_scores (user_id, role, score) VALUES (?, 'customer', 100)")->execute([$userId]);
    } else {
      $pdo->prepare('INSERT IGNORE INTO wallets (user_id) VALUES (?)')->execute([$userId]);
    }
    $pdo->commit();
  } catch (Throwable $e) {
    $pdo->rollBack();
    fail(500, 'Registration failed');
  }

  $devOtp = otpCode($phone, $jwtSecret);
  $st = $pdo->prepare('INSERT INTO otp_logins (phone, code, purpose, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE)) ON DUPLICATE KEY UPDATE code = VALUES(code), expires_at = VALUES(expires_at), verified = 0');
  try { $st->execute([$phone, $devOtp, 'phone_verification']); } catch (Throwable $e) { /* otp table may differ */ }

  out(201, [
    'user_id' => $userId,
    'role' => $role,
    'phone' => $phone,
    'message' => 'Registered. OTP sent to your phone (check server console in dev).',
    'dev_otp' => $devOtp,
  ]);
}

if ($route === 'auth/otp/request' && $method === 'POST') {
  $email = strtolower(trim((string)($body['email'] ?? '')));
  if ($email === '') fail(400, 'Valid email or phone required');
  $st = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
  $st->execute([$email]);
  $user = $st->fetch();
  if (!$user) fail(404, 'No account found for this email. Please register.');
  $devOtp = otpCode($user['phone'], $jwtSecret);
  $st = $pdo->prepare('INSERT INTO otp_logins (phone, code, purpose, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL 5 MINUTE)) ON DUPLICATE KEY UPDATE code = VALUES(code), expires_at = VALUES(expires_at), verified = 0');
  try { $st->execute([$user['phone'], $devOtp, 'login']); } catch (Throwable $e) { /* ignore */ }
  out(200, ['message' => 'OTP sent', 'sent_to' => $user['email'], 'dev_otp' => $devOtp]);
}

if ($route === 'auth/otp/verify' && $method === 'POST') {
  $email = strtolower(trim((string)($body['email'] ?? '')));
  $otp = trim((string)($body['otp'] ?? ''));
  if ($email === '') fail(400, 'Valid email required');
  $st = $pdo->prepare('SELECT * FROM users WHERE email = ? LIMIT 1');
  $st->execute([$email]);
  $user = $st->fetch();
  if (!$user) fail(404, 'No account found for this email.');
  if ($otp === '' || !hash_equals(otpCode($user['phone'], $jwtSecret), $otp)) fail(401, 'Invalid or expired OTP');
  if (($user['status'] ?? '') !== 'active') fail(403, 'Account suspended. Contact support.');
  out(200, loginPayload($pdo, $user, $jwtSecret));
}

if (($route === 'auth/password/login' || $route === 'auth/admin/login') && $method === 'POST') {
  $identifier = trim((string)($body['email'] ?? ($body['phone'] ?? ($body['identifier'] ?? ''))));
  $password = (string)($body['password'] ?? '');
  if ($identifier === '' || $password === '') fail(400, 'Email and password required');
  $column = filter_var($identifier, FILTER_VALIDATE_EMAIL) ? 'email' : 'phone';
  $st = $pdo->prepare("SELECT * FROM users WHERE $column = ? LIMIT 1");
  $st->execute([strtolower($identifier)]);
  $user = $st->fetch();
  if (!$user || !$user['password_hash'] || !password_verify($password, $user['password_hash'])) {
    fail(401, 'Invalid email or password');
  }
  if ($route === 'auth/admin/login' && $user['role'] !== 'admin') fail(403, 'Access denied. Requires role: admin');
  if (($user['status'] ?? '') !== 'active') fail(403, 'Account suspended. Contact support.');
  out(200, loginPayload($pdo, $user, $jwtSecret));
}

fail(404, "Route not found (mirror): $method /$route — set API_BASE to proxy the full Node API.");
