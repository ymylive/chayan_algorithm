const crypto = require('crypto');
const logger = require('../config/logger');
const pool = require('../config/database');

let jwt;
try {
  jwt = require('jsonwebtoken');
} catch {
  jwt = null;
}

const hashPassword = (password) =>
  crypto.createHash('sha256').update(password).digest('hex');

const normalizeEmail = (email) => {
  if (typeof email !== 'string') return '';
  return email.trim().toLowerCase();
};

const hashDbPassword = (password) => {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
};

const verifyDbPassword = (password, storedHash) => {
  if (!storedHash || typeof storedHash !== 'string') return false;

  const parts = storedHash.split('$');
  if (parts.length !== 3 || parts[0] !== 'scrypt') {
    return false;
  }

  const [, salt, expectedHash] = parts;
  if (!salt || !expectedHash) return false;

  try {
    const derived = crypto.scryptSync(password, salt, 64).toString('hex');
    return crypto.timingSafeEqual(
      Buffer.from(derived, 'utf8'),
      Buffer.from(expectedHash, 'utf8')
    );
  } catch {
    return false;
  }
};

const parseCookieMaxAgeMs = () => {
  const defaultMs = 24 * 60 * 60 * 1000;
  const configured = Number(process.env.AUTH_COOKIE_MAX_AGE_MS);
  if (!Number.isFinite(configured) || configured <= 0) {
    return defaultMs;
  }
  return configured;
};

const getCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production',
  maxAge: parseCookieMaxAgeMs()
});

const getClearCookieOptions = () => ({
  httpOnly: true,
  sameSite: 'lax',
  secure: process.env.NODE_ENV === 'production'
});

const buildJwtConfig = () => ({
  issuer: process.env.JWT_ISSUER || 'chayan-backend',
  audience: process.env.JWT_AUDIENCE || 'chayan-frontend',
  expiresIn: process.env.JWT_EXPIRES_IN || '24h'
});

const createAuthToken = (payload, secret, jwtConfig) =>
  jwt.sign(payload, secret, {
    algorithm: 'HS256',
    issuer: jwtConfig.issuer,
    audience: jwtConfig.audience,
    expiresIn: jwtConfig.expiresIn
  });

const setAuthCookie = (res, token) => {
  res.cookie('auth_token', token, getCookieOptions());
};

const respondWithAuth = (res, user, jwtConfig) => {
  res.json({
    success: true,
    expiresIn: jwtConfig.expiresIn,
    data: {
      expiresIn: jwtConfig.expiresIn,
      user
    }
  });
};

const register = async (req, res) => {
  try {
    const email = normalizeEmail(req.body?.email);
    const { password } = req.body || {};

    if (!email || !password) {
      return res.status(400).json({ success: false, message: 'Email and password are required' });
    }

    if (!jwt) {
      return res.status(500).json({ success: false, message: 'Authentication service unavailable' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ success: false, message: 'JWT_SECRET is not configured' });
    }

    const passwordHash = hashDbPassword(password);
    const result = await pool.query(
      `INSERT INTO users (email, password_hash)
       VALUES ($1, $2)
       RETURNING id, email, role`,
      [email, passwordHash]
    );

    const user = result.rows[0];
    const jwtConfig = buildJwtConfig();
    const token = createAuthToken(
      { id: user.id, email: user.email, role: user.role },
      secret,
      jwtConfig
    );

    setAuthCookie(res, token);
    res.status(201);
    respondWithAuth(res, { id: user.id, email: user.email, role: user.role }, jwtConfig);
  } catch (err) {
    if (err && err.code === '23505') {
      return res.status(409).json({ success: false, message: 'Email already exists' });
    }

    logger.error('Register error:', err);
    res.status(500).json({ success: false, message: 'Registration failed' });
  }
};

const login = async (req, res) => {
  try {
    const { username, email, password } = req.body || {};
    const loginIdentifier = (typeof email === 'string' && email.trim())
      ? email.trim()
      : (typeof username === 'string' ? username.trim() : '');

    if (!loginIdentifier || !password) {
      return res.status(400).json({ success: false, message: 'Username and password are required' });
    }

    if (!jwt) {
      return res.status(500).json({ success: false, message: 'Authentication service unavailable' });
    }

    const secret = process.env.JWT_SECRET;
    if (!secret) {
      return res.status(500).json({ success: false, message: 'JWT_SECRET is not configured' });
    }

    const jwtConfig = buildJwtConfig();

    let dbUser = null;
    try {
      const dbUserResult = await pool.query(
        `SELECT id, email, password_hash, role
         FROM users
         WHERE LOWER(email) = LOWER($1)
         LIMIT 1`,
        [loginIdentifier]
      );
      dbUser = dbUserResult.rows[0];
    } catch (err) {
      logger.warn(`DB user lookup failed during login for: ${loginIdentifier}`, err);
    }

    if (dbUser && verifyDbPassword(password, dbUser.password_hash)) {
      const token = createAuthToken(
        { id: dbUser.id, email: dbUser.email, role: dbUser.role },
        secret,
        jwtConfig
      );

      setAuthCookie(res, token);
      logger.info(`User logged in: ${dbUser.email}`);
      return respondWithAuth(
        res,
        { id: dbUser.id, email: dbUser.email, role: dbUser.role },
        jwtConfig
      );
    }

    const adminUser = process.env.ADMIN_USER;
    const adminPassHash = process.env.ADMIN_PASSWORD_HASH;
    if (!adminUser || !adminPassHash) {
      logger.error('ADMIN_USER and ADMIN_PASSWORD_HASH must be configured');
      return res.status(500).json({ success: false, message: 'Admin authentication is not configured' });
    }

    const inputHash = hashPassword(password);
    const usernameMatch = loginIdentifier === adminUser;

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
      logger.warn(`Login failed for user: ${loginIdentifier}`);
      return res.status(401).json({ success: false, message: 'Invalid credentials' });
    }

    const token = createAuthToken(
      { username: loginIdentifier, role: 'admin' },
      secret,
      jwtConfig
    );

    setAuthCookie(res, token);
    logger.info(`User logged in: ${loginIdentifier}`);
    respondWithAuth(res, { username: loginIdentifier, role: 'admin' }, jwtConfig);
  } catch (err) {
    logger.error('Login error:', err);
    res.status(500).json({ success: false, message: 'Login failed' });
  }
};

const logout = async (req, res) => {
  res.clearCookie('auth_token', getClearCookieOptions());
  res.json({ success: true, message: 'Logout successful' });
};

const me = async (req, res) => {
  if (!req.user) {
    return res.status(401).json({ success: false, message: 'Not authenticated' });
  }

  const user = {
    ...(req.user.id ? { id: req.user.id } : {}),
    ...(req.user.email ? { email: req.user.email } : {}),
    ...(req.user.username ? { username: req.user.username } : {}),
    ...(req.user.role ? { role: req.user.role } : {})
  };

  return res.json({
    success: true,
    data: {
      user
    }
  });
};

module.exports = { register, login, logout, me };
