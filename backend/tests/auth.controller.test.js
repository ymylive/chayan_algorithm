describe('authController.login', () => {
  const buildRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    res.cookie = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.resetModules();
    jest.unmock('jsonwebtoken');
    delete process.env.JWT_SECRET;
    delete process.env.ADMIN_USER;
    delete process.env.ADMIN_PASSWORD_HASH;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
    delete process.env.JWT_EXPIRES_IN;
    delete process.env.AUTH_COOKIE_MAX_AGE_MS;
    delete process.env.NODE_ENV;
  });

  test('returns 400 for missing credentials', async () => {
    const { login } = require('../src/controllers/authController');
    const req = { body: {} };
    const res = buildRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
  });

  test('returns 500 when JWT secret is missing', async () => {
    const { login } = require('../src/controllers/authController');
    const req = { body: { username: 'admin', password: 'admin' } };
    const res = buildRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });

  test('returns 500 when jsonwebtoken is unavailable', async () => {
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

  test('returns 500 when admin credentials are not configured', async () => {
    process.env.JWT_SECRET = 'secret';

    const { login } = require('../src/controllers/authController');
    const req = { body: { username: 'admin', password: 'admin' } };
    const res = buildRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Admin authentication is not configured' })
    );
  });

  test('returns 401 for invalid credentials', async () => {
    process.env.JWT_SECRET = 'secret';
    process.env.ADMIN_USER = 'admin';
    process.env.ADMIN_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
    const { login } = require('../src/controllers/authController');
    const req = { body: { username: 'admin', password: 'wrong' } };
    const res = buildRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
  });

  test('returns 401 when configured password hash has invalid length', async () => {
    process.env.JWT_SECRET = 'secret';
    process.env.ADMIN_USER = 'admin';
    process.env.ADMIN_PASSWORD_HASH = 'short';

    const { login } = require('../src/controllers/authController');
    const req = { body: { username: 'admin', password: 'admin' } };
    const res = buildRes();

    await login(req, res);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Invalid credentials' })
    );
  });

  test('sets secure cookie and does not return JWT in body for valid credentials', async () => {
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

  test('uses default cookie maxAge when AUTH_COOKIE_MAX_AGE_MS is invalid', async () => {
    const sign = jest.fn().mockReturnValue('mock-token');
    jest.doMock('jsonwebtoken', () => ({ sign }));

    process.env.JWT_SECRET = 'secret';
    process.env.ADMIN_USER = 'admin';
    process.env.ADMIN_PASSWORD_HASH = '8c6976e5b5410415bde908bd4dee15dfb167a9c873fc4bb8a81f6f2ab448a918';
    process.env.AUTH_COOKIE_MAX_AGE_MS = '0';

    const { login } = require('../src/controllers/authController');
    const req = { body: { username: 'admin', password: 'admin' } };
    const res = buildRes();

    await login(req, res);

    expect(res.cookie).toHaveBeenCalledWith('auth_token', 'mock-token', expect.objectContaining({
      maxAge: 24 * 60 * 60 * 1000,
      secure: false
    }));
  });
});
