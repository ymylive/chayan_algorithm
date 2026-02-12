jest.mock('../src/config/database', () => ({
  query: jest.fn()
}));

const pool = require('../src/config/database');
const { getEnterprises } = require('../src/controllers/enterpriseController');

describe('enterpriseController.getEnterprises', () => {
  const buildRes = () => {
    const res = {};
    res.status = jest.fn().mockReturnValue(res);
    res.json = jest.fn().mockReturnValue(res);
    return res;
  };

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
    expect(pool.query.mock.calls[0][0]).toBe('SELECT COUNT(*) FROM enterprises');

    const dataSql = pool.query.mock.calls[1][0];
    const dataParams = pool.query.mock.calls[1][1];
    expect(dataSql).toContain('ORDER BY name DESC');
    expect(dataSql).toContain('LIMIT $1 OFFSET $2');
    expect(dataParams).toEqual([5, 5]);

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
    expect(dataSql).toContain('LIMIT $2 OFFSET $3');
    expect(dataParams).toEqual(expect.arrayContaining(['active']));
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
      message: 'db unavailable',
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
      message: 'syntax error at or near ";"',
      code: 500
    });
  });
});
