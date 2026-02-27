jest.mock('../src/config/database', () => ({
  query: jest.fn()
}));

const pool = require('../src/config/database');
const {
  getEnterprises,
  getEnterpriseById,
  createEnterprise,
  updateEnterprise,
  deleteEnterprise
} = require('../src/controllers/enterpriseController');

const buildRes = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
};

const validEnterprisePayload = {
  name: 'Acme Corp',
  industry: 'Tech',
  revenue: 1000,
  employee_count: 10,
  region: 'East',
  status: 'active'
};

describe('enterpriseController.getEnterprises', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns paginated list and total count', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: '12' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: 'X' }] });

    const req = {
      user: { id: 123 },
      query: {
        page: '2',
        limit: '5',
        sort: 'name',
        order: 'DESC'
      }
    };
    const res = buildRes();

    await getEnterprises(req, res);

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[0][0]).toBe('SELECT COUNT(*) FROM enterprises WHERE user_id = $1');
    expect(pool.query.mock.calls[0][1]).toEqual([123]);

    const dataSql = pool.query.mock.calls[1][0];
    const dataParams = pool.query.mock.calls[1][1];
    expect(dataSql).toContain('ORDER BY name DESC');
    expect(dataSql).toContain('LIMIT $2 OFFSET $3');
    expect(dataParams).toEqual([123, 5, 5]);

    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Success',
      data: [{ id: 1, name: 'A', industry: 'X' }],
      total: 12
    });
  });

  test('applies status filter to both count and data queries', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockResolvedValueOnce({ rows: [{ id: 1, name: 'A', industry: 'X' }] });

    const req = {
      user: { id: 123 },
      query: {
        status: 'active',
        page: '1',
        limit: '10',
        sort: 'id',
        order: 'ASC'
      }
    };
    const res = buildRes();

    await getEnterprises(req, res);

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(pool.query.mock.calls[0][0]).toContain('WHERE status = $1');
    expect(pool.query.mock.calls[0][1]).toEqual(expect.arrayContaining(['active']));

    const dataSql = pool.query.mock.calls[1][0];
    const dataParams = pool.query.mock.calls[1][1];
    expect(dataSql).toContain('WHERE status = $1');
    expect(dataSql).toContain('ORDER BY id ASC');
    expect(dataSql).toContain('LIMIT $3 OFFSET $4');
    expect(dataParams).toEqual(expect.arrayContaining(['active']));
    expect(dataParams).toEqual(expect.arrayContaining([123]));
    expect(dataParams[dataParams.length - 2]).toBe(10);
    expect(dataParams[dataParams.length - 1]).toBe(0);

    expect(res.status).not.toHaveBeenCalled();
  });

  test('returns 500 when count query fails', async () => {
    pool.query.mockRejectedValueOnce(new Error('db unavailable'));

    const req = {
      user: { id: 123 },
      query: { page: '1', limit: '10', sort: 'id', order: 'ASC' }
    };
    const res = buildRes();

    await getEnterprises(req, res);

    expect(pool.query).toHaveBeenCalledTimes(1);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Failed to get enterprises',
      code: 500
    });
  });

  test('returns 500 when data query fails for unsafe sort input', async () => {
    pool.query
      .mockResolvedValueOnce({ rows: [{ count: '1' }] })
      .mockRejectedValueOnce(new Error('syntax error at or near ";"'));

    const req = {
      user: { id: 123 },
      query: {
        page: '1',
        limit: '10',
        sort: 'id; DROP TABLE enterprises; --',
        order: 'DESC'
      }
    };
    const res = buildRes();

    await getEnterprises(req, res);

    expect(pool.query).toHaveBeenCalledTimes(2);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Failed to get enterprises',
      code: 500
    });
  });
});

describe('enterpriseController.getEnterpriseById', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 403 when requester is not admin and has invalid user id', async () => {
    const req = {
      user: { id: 0, role: 'user' },
      params: { id: '1' }
    };
    const res = buildRes();

    await getEnterpriseById(req, res);

    expect(pool.query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Forbidden',
      code: 403
    });
  });

  test('returns enterprise for normal user with ownership filter', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 5, name: 'A', user_id: 123 }]
    });

    const req = {
      user: { id: 123, role: 'user' },
      params: { id: '5' }
    };
    const res = buildRes();

    await getEnterpriseById(req, res);

    expect(pool.query).toHaveBeenCalledWith(
      'SELECT * FROM enterprises WHERE id = $1 AND user_id = $2',
      ['5', 123]
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Success',
      data: { id: 5, name: 'A', user_id: 123 }
    });
  });

  test('returns enterprise for admin without ownership filter', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 8, name: 'B', user_id: 456 }]
    });

    const req = {
      user: { id: 1, role: 'admin' },
      params: { id: '8' }
    };
    const res = buildRes();

    await getEnterpriseById(req, res);

    expect(pool.query).toHaveBeenCalledWith(
      'SELECT * FROM enterprises WHERE id = $1',
      ['8']
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Success',
      data: { id: 8, name: 'B', user_id: 456 }
    });
  });

  test('returns 404 when enterprise does not exist', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const req = {
      user: { id: 123, role: 'user' },
      params: { id: '77' }
    };
    const res = buildRes();

    await getEnterpriseById(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Enterprise not found',
      code: 404
    });
  });

  test('returns 500 when query throws', async () => {
    pool.query.mockRejectedValueOnce(new Error('db unavailable'));

    const req = {
      user: { id: 123, role: 'user' },
      params: { id: '5' }
    };
    const res = buildRes();

    await getEnterpriseById(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Failed to get enterprise',
      code: 500
    });
  });
});

describe('enterpriseController.createEnterprise', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 403 when requester is not admin and has invalid user id', async () => {
    const req = {
      user: { id: null, role: 'user' },
      body: validEnterprisePayload
    };
    const res = buildRes();

    await createEnterprise(req, res);

    expect(pool.query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Forbidden',
      code: 403
    });
  });

  test('returns 400 when payload validation fails', async () => {
    const req = {
      user: { id: 123, role: 'user' },
      body: { name: '', industry: '' }
    };
    const res = buildRes();

    await createEnterprise(req, res);

    expect(pool.query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 400,
        message: expect.stringContaining('Name is required')
      })
    );
  });

  test('creates enterprise for normal user and ignores body user_id', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 1, name: 'Acme Corp', user_id: 123 }]
    });

    const req = {
      user: { id: 123, role: 'user' },
      body: { ...validEnterprisePayload, user_id: 999 }
    };
    const res = buildRes();

    await createEnterprise(req, res);

    const insertSql = pool.query.mock.calls[0][0];
    const insertParams = pool.query.mock.calls[0][1];
    expect(insertSql).toContain('INSERT INTO enterprises');
    expect(insertParams[1]).toBe(123);

    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Enterprise created',
      data: { id: 1, name: 'Acme Corp', user_id: 123 }
    });
  });

  test('creates enterprise for admin with provided user_id', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 2, name: 'Acme Corp', user_id: 456 }]
    });

    const req = {
      user: { id: 1, role: 'admin' },
      body: { ...validEnterprisePayload, user_id: 456 }
    };
    const res = buildRes();

    await createEnterprise(req, res);

    const insertParams = pool.query.mock.calls[0][1];
    expect(insertParams[1]).toBe(456);
    expect(res.status).toHaveBeenCalledWith(201);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Enterprise created',
      data: { id: 2, name: 'Acme Corp', user_id: 456 }
    });
  });

  test('returns 500 when insert fails', async () => {
    pool.query.mockRejectedValueOnce(new Error('insert failed'));

    const req = {
      user: { id: 123, role: 'user' },
      body: validEnterprisePayload
    };
    const res = buildRes();

    await createEnterprise(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Failed to create enterprise',
      code: 500
    });
  });
});

describe('enterpriseController.updateEnterprise', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 403 when requester is not admin and has invalid user id', async () => {
    const req = {
      user: { id: null, role: 'user' },
      params: { id: '3' },
      body: validEnterprisePayload
    };
    const res = buildRes();

    await updateEnterprise(req, res);

    expect(pool.query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Forbidden',
      code: 403
    });
  });

  test('returns 400 when payload validation fails', async () => {
    const req = {
      user: { id: 123, role: 'user' },
      params: { id: '3' },
      body: { name: '', industry: '' }
    };
    const res = buildRes();

    await updateEnterprise(req, res);

    expect(pool.query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({
        success: false,
        code: 400,
        message: expect.stringContaining('Name is required')
      })
    );
  });

  test('updates enterprise for normal user with ownership filter', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 3, name: 'Acme Corp', user_id: 123 }]
    });

    const req = {
      user: { id: 123, role: 'user' },
      params: { id: '3' },
      body: validEnterprisePayload
    };
    const res = buildRes();

    await updateEnterprise(req, res);

    const updateSql = pool.query.mock.calls[0][0];
    const updateParams = pool.query.mock.calls[0][1];
    expect(updateSql).toContain('WHERE id = $7 AND user_id = $8 RETURNING *');
    expect(updateParams[6]).toBe('3');
    expect(updateParams[7]).toBe(123);
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Enterprise updated',
      data: { id: 3, name: 'Acme Corp', user_id: 123 }
    });
  });

  test('updates enterprise for admin without ownership filter', async () => {
    pool.query.mockResolvedValueOnce({
      rows: [{ id: 3, name: 'Acme Corp', user_id: 999 }]
    });

    const req = {
      user: { id: 1, role: 'admin' },
      params: { id: '3' },
      body: validEnterprisePayload
    };
    const res = buildRes();

    await updateEnterprise(req, res);

    const updateSql = pool.query.mock.calls[0][0];
    const updateParams = pool.query.mock.calls[0][1];
    expect(updateSql).toContain('WHERE id = $7 RETURNING *');
    expect(updateParams).toHaveLength(7);
    expect(updateParams[6]).toBe('3');
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Enterprise updated',
      data: { id: 3, name: 'Acme Corp', user_id: 999 }
    });
  });

  test('returns 404 when enterprise does not exist', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const req = {
      user: { id: 123, role: 'user' },
      params: { id: '3' },
      body: validEnterprisePayload
    };
    const res = buildRes();

    await updateEnterprise(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Enterprise not found',
      code: 404
    });
  });

  test('returns 500 when update query fails', async () => {
    pool.query.mockRejectedValueOnce(new Error('update failed'));

    const req = {
      user: { id: 123, role: 'user' },
      params: { id: '3' },
      body: validEnterprisePayload
    };
    const res = buildRes();

    await updateEnterprise(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Failed to update enterprise',
      code: 500
    });
  });
});

describe('enterpriseController.deleteEnterprise', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  test('returns 403 when requester is not admin and has invalid user id', async () => {
    const req = {
      user: { id: 0, role: 'user' },
      params: { id: '7' }
    };
    const res = buildRes();

    await deleteEnterprise(req, res);

    expect(pool.query).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Forbidden',
      code: 403
    });
  });

  test('deletes enterprise for normal user with ownership filter', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 7 }] });

    const req = {
      user: { id: 123, role: 'user' },
      params: { id: '7' }
    };
    const res = buildRes();

    await deleteEnterprise(req, res);

    expect(pool.query).toHaveBeenCalledWith(
      'DELETE FROM enterprises WHERE id = $1 AND user_id = $2 RETURNING id',
      ['7', 123]
    );
    expect(res.status).not.toHaveBeenCalled();
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Enterprise deleted',
      data: { id: 7 }
    });
  });

  test('deletes enterprise for admin without ownership filter', async () => {
    pool.query.mockResolvedValueOnce({ rows: [{ id: 7 }] });

    const req = {
      user: { id: 1, role: 'admin' },
      params: { id: '7' }
    };
    const res = buildRes();

    await deleteEnterprise(req, res);

    expect(pool.query).toHaveBeenCalledWith(
      'DELETE FROM enterprises WHERE id = $1 RETURNING id',
      ['7']
    );
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      message: 'Enterprise deleted',
      data: { id: 7 }
    });
  });

  test('returns 404 when enterprise does not exist', async () => {
    pool.query.mockResolvedValueOnce({ rows: [] });

    const req = {
      user: { id: 123, role: 'user' },
      params: { id: '7' }
    };
    const res = buildRes();

    await deleteEnterprise(req, res);

    expect(res.status).toHaveBeenCalledWith(404);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Enterprise not found',
      code: 404
    });
  });

  test('returns 500 when delete query fails', async () => {
    pool.query.mockRejectedValueOnce(new Error('delete failed'));

    const req = {
      user: { id: 123, role: 'user' },
      params: { id: '7' }
    };
    const res = buildRes();

    await deleteEnterprise(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith({
      success: false,
      message: 'Failed to delete enterprise',
      code: 500
    });
  });
});
