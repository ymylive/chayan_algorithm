const fs = require('fs');
const path = require('path');

describe('settingsController.updateSettings', () => {
  const settingsFile = path.join(__dirname, '../data/ai-settings.json');
  const settingsDir = path.dirname(settingsFile);

  const buildRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

  beforeEach(async () => {
    jest.resetModules();
    delete process.env.AI_ALLOWED_ENDPOINT_HOSTS;
    await fs.promises.rm(settingsDir, { recursive: true, force: true });
  });

  afterEach(async () => {
    await fs.promises.rm(settingsDir, { recursive: true, force: true });
  });

  test('returns 403 when requester is not admin', async () => {
    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { role: 'user' },
      body: { apiEndpoint: 'https://openrouter.ai/api/v1' }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Forbidden' });
  });

  test('returns 400 for malformed API endpoint URL', async () => {
    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { role: 'admin' },
      body: { apiEndpoint: 'not-a-url' }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'Invalid API endpoint URL' });
  });

  test('returns 400 for non-https API endpoint', async () => {
    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { role: 'admin' },
      body: { apiEndpoint: 'http://openrouter.ai/api/v1' }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'API endpoint must use HTTPS' });
  });

  test('returns 400 for non-allowlisted API endpoint host', async () => {
    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { role: 'admin' },
      body: { apiEndpoint: 'https://example.com/api/v1' }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith({ success: false, message: 'API endpoint host is not allowed' });
  });

  test('accepts default allowlisted host openrouter.ai', async () => {
    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { role: 'admin' },
      body: { apiEndpoint: 'https://openrouter.ai/api/v1', model: 'x/y' }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Settings updated' });

    const saved = JSON.parse(await fs.promises.readFile(settingsFile, 'utf8'));
    expect(saved.apiEndpoint).toBe('https://openrouter.ai/api/v1');
  });

  test('accepts additional allowlisted host from env', async () => {
    process.env.AI_ALLOWED_ENDPOINT_HOSTS = 'api.allowed-host.com';
    const { updateSettings } = require('../src/controllers/settingsController');
    const req = {
      user: { role: 'admin' },
      body: { apiEndpoint: 'https://api.allowed-host.com/v1' }
    };
    const res = buildRes();

    await updateSettings(req, res);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({ success: true, message: 'Settings updated' });
  });
});
