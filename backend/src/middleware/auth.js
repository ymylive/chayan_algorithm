const logger = require('../config/logger');

let jwt;
try {
  jwt = require('jsonwebtoken');
} catch {
  jwt = null;
}

const PUBLIC_PATHS = ['/health'];

const getCookieValue = (cookieHeader, key) => {
  if (!cookieHeader || !key) return null;

  const cookies = cookieHeader.split(';');
  for (const cookie of cookies) {
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex === -1) continue;

    const name = cookie.slice(0, separatorIndex).trim();
    if (name !== key) continue;

    const value = cookie.slice(separatorIndex + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }

  return null;
};

const getTokenFromRequest = (req) => {
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith('Bearer ')) {
    const bearerToken = authHeader.slice(7).trim();
    if (bearerToken) return bearerToken;
  }

  return getCookieValue(req.headers.cookie, 'auth_token');
};

const normalizeUserClaims = (claims) => {
  const safeClaims = claims && typeof claims === 'object' && !Array.isArray(claims) ? claims : {};

  return {
    ...safeClaims,
    id: safeClaims.id ?? null,
    email: typeof safeClaims.email === 'string' && safeClaims.email.trim() ? safeClaims.email : null,
    username: typeof safeClaims.username === 'string' && safeClaims.username.trim() ? safeClaims.username : null,
    role: typeof safeClaims.role === 'string' && safeClaims.role.trim() ? safeClaims.role : null
  };
};

const authMiddleware = (req, res, next) => {
  if (PUBLIC_PATHS.includes(req.path)) return next();

  if (!jwt) {
    return res.status(500).json({ success: false, message: 'Authentication service unavailable' });
  }

  const secret = process.env.JWT_SECRET;
  if (!secret) {
    logger.error('JWT_SECRET is not configured');
    return res.status(500).json({ success: false, message: 'Server authentication is not configured' });
  }

  const token = getTokenFromRequest(req);
  if (!token) {
    return res.status(401).json({ success: false, message: 'Authentication token is required' });
  }

  const issuer = process.env.JWT_ISSUER || 'chayan-backend';
  const audience = process.env.JWT_AUDIENCE || 'chayan-frontend';

  try {
    const claims = jwt.verify(token, secret, {
      algorithms: ['HS256'],
      issuer,
      audience
    });
    req.user = normalizeUserClaims(claims);
  } catch (err) {
    logger.warn('JWT verification failed:', err.message);
    return res.status(401).json({ success: false, message: 'Invalid or expired token' });
  }

  next();
};

module.exports = authMiddleware;
