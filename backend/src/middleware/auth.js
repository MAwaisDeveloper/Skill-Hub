const jwt = require('jsonwebtoken');
const config = require('../config');
const { pool } = require('../config/db');

function signToken(user) {
  return jwt.sign({ id: user.id, role: user.role, phone: user.phone }, config.jwtSecret, {
    expiresIn: config.jwtExpiresIn,
  });
}

// Require valid JWT
function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (!token) return res.status(401).json({ error: 'Authentication required' });
  try {
    req.user = jwt.verify(token, config.jwtSecret);
    return next();
  } catch {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

// Require specific role(s)
function requireRole(...roles) {
  return (req, res, next) => {
    if (!req.user) return res.status(401).json({ error: 'Authentication required' });
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ error: `Access denied. Requires role: ${roles.join(' or ')}` });
    }
    next();
  };
}

async function authOptional(req, res, next) {
  try {
    await authenticate(req, res, () => {});
  } catch { /* noop */ }
  next();
}

module.exports = { signToken, authenticate, requireRole, authOptional, pool };
