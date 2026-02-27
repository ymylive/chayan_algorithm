const crypto = require('crypto');

jest.mock('../src/config/database', () => ({
  query: jest.fn()
}));

let pool;

const buildDbPasswordHash = (password, salt = '00112233445566778899aabbccddeeff') => {
  const derived = crypto.scryptSync(password, salt, 64).toString('hex');
  return `scrypt$${salt}$${derived}`;
};

describe('authController', () => {
  const buildRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    res.clearCookie = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.resetModules();
    jest.unmock('jsonwebtoken');
    pool = require('../src/config/database');
    pool.query.mockReset();
    delete process.env.JWT_SECRET;
    delete process.env.ADMIN_USER;
    delete process.env.ADMIN_PASSWORD_HASH;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.AUTH_COOKIE_MAX_AGE_MS;
    delete process.env.NODE_ENV;
  });

  test('register returns 400 for missing credentials', async () => {
    const { register } = require('../src/controllers/authController');
    const req = { body: { email: '', password: '' } };
    const res = buildRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Email and password are required' })
    );
  });

  test('register returns 500 when jsonwebtoken is unavailable', async () => {
    jest.doMock('jsonwebtoken', () => {
      throw new Error('module missing');
    });

    const { register } = require('../src/controllers/authController');
    const req = { body: { email: 'user@example.com', password: 'P@ssw0rd!' } };
    const res = buildRes();

    await register(req, res);

    expect(pool.query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Authentication service unavailable' })
    );
  });

  test('register returns 500 when JWT secret is missing', async () => {
    const { register } = require('../src/controllers/authController');
    const req = { body: { email: 'user@example.com', password: 'P@ssw0rd!' } };
    const res = buildRes();

    await register(req, res);

    expect(pool.query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'JWT_SECRET is not configured' })
    );
  });

  test('register returns 409 for duplicate email conflict', async () => {
    process.env.JWT_SECRET = 'secret';
    pool.query.mockRejectedValueOnce({ code: '23505', constraint: 'idx_users_email_lower_unique' });

    const { register } = require('../src/controllers/authController');
    const req = { body: { email: 'user@example.com', password: 'P@ssw0rd!' } };
    const res = buildRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(409);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Email already exists' })
    );
  });

  test('register creates DB user, sets cookie, and returns safe payload', async () => {
    const sign = jest.fn().mockReturnValue('db-user-token');
    jest.doMock('jsonwebtoken', () => ({ sign }));

    process.env.JWT_SECRET = 'secret';
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 7, email: 'user@example.com', role: 'user' }]
    });

    const { register } = require('../src/controllers/authController');
    const req = { body: { email: 'User@Example.com', password: 'P@ssw0rd!' } };
    const res = buildRes();

    await register(req, res);

    expect(res.status).toHaveBeenCalledWith(201);

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(pool.query.mock.calls[0][0]).toContain('INSERT INTO users');
    expect(pool.query.mock.calls[0][1][0]).toBe('user@example.com');
    expect(pool.query.mock.calls[0][1][1]).not.toBe('P@ssw0rd!');

    expect(sign).toHaveBeenCalledWith(
      { id: 7, email: 'user@example.com', role: 'user' },
      'secret',
      expect.objectContaining({ algorithm: 'HS256' })
    );
    expect(res.cookie).toHaveBeenCalledWith('auth_token', 'db-user-token', expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax'
    }));

    const payload = res.json.mock.calls[0][0];
    expect(payload.success).toBe(true);
    expect(payload.data.user).toEqual({ id: 7, email: 'user@example.com', role: 'user' });
    expect(payload).not.toHaveProperty('token');
    expect(payload.data).not.toHaveProperty('token');
  });

  test('login returns 400 for missing credentials', async () => {
    const { login } = require('../src/controllers/authController');
    const req = { body: {} };
    const res = buildRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('login returns 500 when JWT secret is missing', async () => {
    const { login } = require('../src/controllers/authController');
    const req = { body: { username: 'admin', password: 'admin' } };
    const res = buildRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('login returns 500 when jsonwebtoken is unavailable', async () => {
    jest.doMock('jsonwebtoken', () => {
      throw new Error('module missing');
    });

    process.env.JWT_SECRET = 'secret';

    const { login } = require('../src/controllers/authController');
    const req = { body: { username: 'admin', password: 'admin' } };
    const res = buildRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Authentication service unavailable' })
    );
  });

  test('login returns 500 when admin credentials are not configured and db user missing', async () => {
    process.env.JWT_SECRET = 'secret';
    pool.query.mockResolvedValueOnce({ rows: [] });

    const { login } = require('../src/controllers/authController');
    const req = { body: { username: 'admin', password: 'admin' } };
    const res = buildRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Admin authentication is not configured' })
    );
  });

  test('login returns 401 for invalid credentials', async () => {
    process.env.JWT_SECRET = 'secret';
    process.env.ADMIN_USER = 'admin';
    process.env.ADMIN_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
    pool.query.mockResolvedValueOnce({ rows: [] });
    const { login } = require('../src/controllers/authController');
    const req = { body: { username: 'admin', password: 'wrong' } };
    const res = buildRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('login returns 401 for invalid admin credentials when db lookup throws', async () => {
    process.env.JWT_SECRET = 'secret';
    process.env.ADMIN_USER = 'admin';
    process.env.ADMIN_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
    pool.query.mockRejectedValueOnce(new Error('db unavailable'));

    const { login } = require('../src/controllers/authController');
    const req = { body: { username: 'admin', password: 'wrong' } };
    const res = buildRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Invalid credentials' })
    );
  });

  test('login returns 401 when configured password hash has invalid length', async () => {
    process.env.JWT_SECRET = 'secret';
    process.env.ADMIN_USER = 'admin';
    process.env.ADMIN_PASSWORD_HASH = 'short';
    pool.query.mockResolvedValueOnce({ rows: [] });

    const { login } = require('../src/controllers/authController');
    const req = { body: { username: 'admin', password: 'admin' } };
    const res = buildRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Invalid credentials' })
    );
  });

  test('login authenticates DB user credentials before legacy admin fallback', async () => {
    const sign = jest.fn().mockReturnValue('mock-token');
    jest.doMock('jsonwebtoken', () => ({ sign }));

    process.env.JWT_SECRET = 'secret';
    process.env.ADMIN_USER = 'admin';
    process.env.ADMIN_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
    const password = 'DB-Safe-Password';

    pool.query.mockResolvedValueOnce({
      rows: [{ id: 15, email: 'member@example.com', role: 'user', password_hash: buildDbPasswordHash(password) }]
    });

    const { login } = require('../src/controllers/authController');
    const req = { body: { username: 'member@example.com', password } };
    const res = buildRes();

    await login(req, res);

    expect(sign).toHaveBeenCalledWith(
      { id: 15, email: 'member@example.com', role: 'user' },
      'secret',
      expect.objectContaining({ algorithm: 'HS256' })
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      data: expect.objectContaining({
        user: { id: 15, email: 'member@example.com', role: 'user' }
      })
    }));
  });

  test('login keeps legacy admin env compatibility path', async () => {
    const sign = jest.fn().mockReturnValue('mock-token');
    jest.doMock('jsonwebtoken', () => ({ sign }));

    process.env.JWT_SECRET = 'secret';
    process.env.ADMIN_USER = 'admin';
    process.env.ADMIN_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
    process.env.JWT_ISSUER = 'issuer-x';
    process.env.JWT_AUDIENCE = 'audience-y';
    process.env.JWT_EXPIRES_IN = '12h';
    process.env.AUTH_COOKIE_MAX_AGE_MS = '1800000';
    process.env.NODE_ENV = 'production';
    pool.query.mockResolvedValueOnce({ rows: [] });

    const { login } = require('../src/controllers/authController');
    const req = { body: { username: 'admin', password: 'admin' } };
    const res = buildRes();

    await login(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(sign).toHaveBeenCalledWith(
      { username: 'admin', role: 'admin' },
      'secret',
      {
        algorithm: 'HS256',
        issuer: 'issuer-x',
        audience: 'audience-y',
        expiresIn: '12h'
      }
    );
    expect(res.cookie).toHaveBeenCalledWith('auth_token', 'mock-token', {
      httpOnly: true,
      sameSite: 'lax',
      secure: true,
      maxAge: 1800000
    });
    expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
      success: true,
      expiresIn: '12h',
      data: expect.objectContaining({
        user: { username: 'admin', role: 'admin' }
      })
    }));

    const payload = res.json.mock.calls[0][0];
    expect(payload).not.toHaveProperty('token');
    expect(payload.data).not.toHaveProperty('token');
  });

  test('login uses default cookie maxAge when AUTH_COOKIE_MAX_AGE_MS is invalid', async () => {
    const sign = jest.fn().mockReturnValue('mock-token');
    jest.doMock('jsonwebtoken', () => ({ sign }));

    process.env.JWT_SECRET = 'secret';
    process.env.ADMIN_USER = 'admin';
    process.env.ADMIN_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
    process.env.AUTH_COOKIE_MAX_AGE_MS = '0';
    pool.query.mockResolvedValueOnce({ rows: [] });

    const { login } = require('../src/controllers/authController');
    const req = { body: { username: 'admin', password: 'admin' } };
    const res = buildRes();

    await login(req, res);

    expect(res.cookie).toHaveBeenCalledWith('auth_token', 'mock-token', expect.objectContaining({
      maxAge: 24 * 60 * 60 * 1000,
      secure: false
    }));
  });

  test('logout clears cookie and returns success response', async () => {
    const { logout } = require('../src/controllers/authController');
    const req = {};
    const res = buildRes();

    await logout(req, res);

    expect(res.clearCookie).toHaveBeenCalledWith('auth_token', expect.objectContaining({
      httpOnly: true,
      sameSite: 'lax'
    }));
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Logout successful' });
  });

  test('me returns authenticated user profile', async () => {
    const { me } = require('../src/controllers/authController');
    const req = { user: { id: 3, email: 'x@example.com', role: 'user', iat: 10, exp: 20 } };
    const res = buildRes();

    await me(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: {
        user: { id: 3, email: 'x@example.com', role: 'user' }
      }
    });
  });

  test('me returns 401 when unauthenticated', async () => {
    const { me } = require('../src/controllers/authController');
    const req = {};
    const res = buildRes();

    await me(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Not authenticated' });
  });
});
