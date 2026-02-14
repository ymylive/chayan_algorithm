describe('auth middleware', () => {
  const buildRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(() => {
    jest.resetModules();
    jest.unmock('jsonwebtoken');
    delete process.env.JWT_SECRET;
    delete process.env.JWT_ISSUER;
    delete process.env.JWT_AUDIENCE;
  });

  test('allows /health without authentication', () => {
    const authMiddleware = require('../src/middleware/auth');
    const req = { path: '/health', headers: {} };
    const res = buildRes();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 500 when jsonwebtoken is unavailable', () => {
    jest.doMock('jsonwebtoken', () => {
      throw new Error('module missing');
    });

    const authMiddleware = require('../src/middleware/auth');
    const req = { path: '/api/enterprises', headers: { authorization: 'Bearer token' } };
    const res = buildRes();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Authentication service unavailable' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 500 when JWT_SECRET is not configured', () => {
    const authMiddleware = require('../src/middleware/auth');
    const req = { path: '/api/enterprises', headers: { authorization: 'Bearer token' } };
    const res = buildRes();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 when token is missing', () => {
    process.env.JWT_SECRET = 'secret';
    const authMiddleware = require('../src/middleware/auth');
    const req = { path: '/api/enterprises', headers: {} };
    const res = buildRes();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false, message: 'Authentication token is required' })
    );
    expect(next).not.toHaveBeenCalled();
  });

  test('returns 401 on invalid token', () => {
    process.env.JWT_SECRET = 'secret';
    jest.doMock('jsonwebtoken', () => ({
      verify: jest.fn(() => {
        throw new Error('bad token');
      })
    }));

    const authMiddleware = require('../src/middleware/auth');
    const req = { path: '/api/enterprises', headers: { authorization: 'Bearer invalid' } };
    const res = buildRes();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(res.status).toHaveBeenCalledWith(401);
    expect(next).not.toHaveBeenCalled();
  });

  test('verifies bearer token with expected jwt constraints', () => {
    process.env.JWT_SECRET = 'secret';
    process.env.JWT_ISSUER = 'issuer-x';
    process.env.JWT_AUDIENCE = 'audience-y';
    const verify = jest.fn().mockReturnValue({ sub: 'u1' });

    jest.doMock('jsonwebtoken', () => ({ verify }));

    const authMiddleware = require('../src/middleware/auth');
    const req = { path: '/api/enterprises', headers: { authorization: 'Bearer valid' } };
    const res = buildRes();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(verify).toHaveBeenCalledWith('valid', 'secret', {
      algorithms: ['HS256'],
      issuer: 'issuer-x',
      audience: 'audience-y'
    });
    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({
      sub: 'u1',
      id: null,
      email: null,
      username: null,
      role: null
    });
  });

  test('normalizes legacy auth payload claims', () => {
    process.env.JWT_SECRET = 'secret';
    const verify = jest.fn().mockReturnValue({ username: 'admin', role: 'admin' });

    jest.doMock('jsonwebtoken', () => ({ verify }));

    const authMiddleware = require('../src/middleware/auth');
    const req = { path: '/api/enterprises', headers: { authorization: 'Bearer legacy-token' } };
    const res = buildRes();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({
      username: 'admin',
      role: 'admin',
      id: null,
      email: null
    });
  });

  test('normalizes new auth payload claims', () => {
    process.env.JWT_SECRET = 'secret';
    const verify = jest.fn().mockReturnValue({ id: 5, email: 'member@example.com', role: 'user' });

    jest.doMock('jsonwebtoken', () => ({ verify }));

    const authMiddleware = require('../src/middleware/auth');
    const req = { path: '/api/enterprises', headers: { authorization: 'Bearer user-token' } };
    const res = buildRes();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(next).toHaveBeenCalledTimes(1);
    expect(req.user).toEqual({
      id: 5,
      email: 'member@example.com',
      role: 'user',
      username: null
    });
  });

  test('uses auth_token cookie when bearer header is missing', () => {
    process.env.JWT_SECRET = 'secret';
    const verify = jest.fn().mockReturnValue({ sub: 'cookie-user' });

    jest.doMock('jsonwebtoken', () => ({ verify }));

    const authMiddleware = require('../src/middleware/auth');
    const req = {
      path: '/api/enterprises',
      headers: { cookie: 'foo=bar; auth_token=cookie-token%2E123; another=value' }
    };
    const res = buildRes();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(verify).toHaveBeenCalledWith(
      'cookie-token.123',
      'secret',
      expect.objectContaining({ algorithms: ['HS256'] })
    );
    expect(next).toHaveBeenCalledTimes(1);
  });

  test('prefers bearer token over cookie token when both are present', () => {
    process.env.JWT_SECRET = 'secret';
    const verify = jest.fn().mockReturnValue({ sub: 'header-user' });

    jest.doMock('jsonwebtoken', () => ({ verify }));

    const authMiddleware = require('../src/middleware/auth');
    const req = {
      path: '/api/enterprises',
      headers: {
        authorization: 'Bearer header-token',
        cookie: 'auth_token=cookie-token'
      }
    };
    const res = buildRes();
    const next = jest.fn();

    authMiddleware(req, res, next);

    expect(verify).toHaveBeenCalledWith(
      'header-token',
      'secret',
      expect.objectContaining({ algorithms: ['HS256'] })
    );
    expect(next).toHaveBeenCalledTimes(1);
  });
});
