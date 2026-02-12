const crypto = require('crypto');
const logger = require('../config/logger');

let jwt;
try {
  jwt = require('jsonwebtoken');
} catch {
  jwt = null;
}

const hashPassword = (password) =>
  crypto.createHash('sha256').update(password).digest('hex');

const parseCookieMaxAgeMs = () => {
  const defaultMs = 24 * 60 * 60 * 1000;
  const configured = Number(process.env.AUTH_COOKIE_MAX_AGE_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return defaultMs;
  }
  return configured;
};

const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    if (!username || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    if (!jwt) {
      return res.status(500).json({ success: false, message: 'Authentication service unavailable' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ success: false, message: 'JWT_SECRET is not configured' });
    }

    const adminUser = process.env.ADMIN_USER;
    const adminPassHash = process.env.ADMIN_PASSWORD_HASH;
    if (!adminUser || !adminPassHash) {
      logger.error('ADMIN_USER and ADMIN_PASSWORD_HASH must be configured');
      return res.status(500).json({ success: false, message: 'Admin authentication is not configured' });
    }

    const inputHash = hashPassword(password);
    const usernameMatch = username === adminUser;

    let passwordMatch = false;
    try {
      passwordMatch = crypto.timingSafeEqual(
        Buffer.from(inputHash, 'utf8'),
        Buffer.from(adminPassHash, 'utf8')
      );
    } catch {
      passwordMatch = false;
    }

    if (!usernameMatch || !passwordMatch) {
      logger.warn(`Login failed for user: ${username}`);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const issuer = process.env.JWT_ISSUER || 'chayan-backend';
    const audience = process.env.JWT_AUDIENCE || 'chayan-frontend';
    const expiresIn = process.env.JWT_EXPIRES_IN || '24h';

    const token = jwt.sign(
      { username, role: 'admin' },
      secret,
      { algorithm: 'HS256', issuer, audience, expiresIn }
    );

    res.cookie('auth_token', token, {
      httpOnly: true,
      sameSite: 'lax',
      secure: process.env.NODE_ENV === 'production',
      maxAge: parseCookieMaxAgeMs()
    });

    logger.info(`User logged in: ${username}`);
    res.json({
      success: true,
      expiresIn,
      data: {
        expiresIn,
        user: {
          username,
          role: 'admin'
        }
      }
    });
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
};

module.exports = { login };
