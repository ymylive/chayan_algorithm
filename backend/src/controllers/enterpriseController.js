const { success, error } = require('../utils/responseFormatter');
const pool = require('../config/database');
const { validateEnterprise } = require('../utils/validator');
const logger = require('../config/logger');

const ALLOWED_SORT_FIELDS = new Set([
  'id',
  'name',
  'industry',
  'revenue',
  'employee_count',
  'region',
  'status',
  'created_at',
  'updated_at'
]);
const ALLOWED_ORDER = new Set(['ASC', 'DESC']);
const ALLOWED_STATUS = new Set(['active', 'inactive', 'archived']);
const MAX_LIMIT = 100;

const isAdminUser = (user) => user && user.role === 'admin';

const resolveUserId = (user) => {
  const userId = Number(user && user.id);
  if (!Number.isInteger(userId) || userId <= 0) {
    return null;
  }
  return userId;
};

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
};

const getEnterprises = async (req, res) => {
  try {
    const adminUser = isAdminUser(req.user);
    const userId = resolveUserId(req.user);
    if (!adminUser && !userId) {
      return res.status(403).json(error('Forbidden', 403));
    }

    const {
      page: rawPage = 1,
      sort: rawSort = 'id',
      order: rawOrder = 'ASC',
      status: rawStatus
    } = req.query;
    const rawLimit = req.query.limit ?? req.query.page_size;
    const page = parsePositiveInt(rawPage, 1);
    const limit = Math.min(parsePositiveInt(rawLimit, 10), MAX_LIMIT);
    const sort = ALLOWED_SORT_FIELDS.has(rawSort) ? rawSort : 'id';
    const normalizedOrder = typeof rawOrder === 'string' ? rawOrder.toUpperCase() : 'ASC';
    const order = ALLOWED_ORDER.has(normalizedOrder) ? normalizedOrder : 'ASC';
    const status = typeof rawStatus === 'string' ? rawStatus.trim() : '';
    const offset = (page - 1) * limit;

    const whereClauses = [];
    const params = [];

    if (status && ALLOWED_STATUS.has(status)) {
      whereClauses.push(`status = $${params.length + 1}`);
      params.push(status);
    }

    if (!adminUser) {
      whereClauses.push(`user_id = $${params.length + 1}`);
      params.push(userId);
    }

    const whereSql = whereClauses.length > 0 ? ` WHERE ${whereClauses.join(' AND ')}` : '';

    const countSql = `SELECT COUNT(*) FROM enterprises${whereSql}`;
    const countResult = await pool.query(countSql, [...params]);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataSql = `SELECT * FROM enterprises${whereSql} ORDER BY ${sort} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const dataParams = [...params, limit, offset];

    const result = await pool.query(dataSql, dataParams);
    res.json(success(result.rows, 'Success', total));
  } catch (err) {
    logger.error('Get enterprises error:', err);
    res.status(500).json(error('Failed to get enterprises'));
  }
};

const getEnterpriseById = async (req, res) => {
  try {
    const adminUser = isAdminUser(req.user);
    const userId = resolveUserId(req.user);
    if (!adminUser && !userId) {
      return res.status(403).json(error('Forbidden', 403));
    }

    const { id } = req.params;
    const queryText = adminUser
      ? 'SELECT * FROM enterprises WHERE id = $1'
      : 'SELECT * FROM enterprises WHERE id = $1 AND user_id = $2';
    const queryParams = adminUser ? [id] : [id, userId];
    const result = await pool.query(queryText, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json(error('Enterprise not found', 404));
    }

    res.json(success(result.rows[0]));
  } catch (err) {
    logger.error('Get enterprise error:', err);
    res.status(500).json(error('Failed to get enterprise'));
  }
};

const createEnterprise = async (req, res) => {
  try {
    const adminUser = isAdminUser(req.user);
    const userId = resolveUserId(req.user);
    if (!adminUser && !userId) {
      return res.status(403).json(error('Forbidden', 403));
    }

    const validation = validateEnterprise(req.body);
    if (!validation.valid) {
      return res.status(400).json(error(validation.errors.join(', '), 400));
    }

    const { name, industry, revenue, employee_count, region, status = 'active' } = req.body;
    const normalizedRevenue = revenue ?? 0;
    const normalizedEmployeeCount = employee_count ?? 0;
    const normalizedRegion = region ?? '';
    const normalizedStatus = status ?? 'active';
    const ownerUserId = adminUser
      ? (Number.isInteger(Number(req.body.user_id)) && Number(req.body.user_id) > 0 ? Number(req.body.user_id) : null)
      : userId;
    const result = await pool.query(
      'INSERT INTO enterprises (name, user_id, industry, revenue, employee_count, region, status) VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING *',
      [name, ownerUserId, industry, normalizedRevenue, normalizedEmployeeCount, normalizedRegion, normalizedStatus]
    );

    logger.info(`Enterprise created: ${result.rows[0].id}`);
    res.status(201).json(success(result.rows[0], 'Enterprise created'));
  } catch (err) {
    logger.error('Create enterprise error:', err);
    res.status(500).json(error('Failed to create enterprise'));
  }
};

const updateEnterprise = async (req, res) => {
  try {
    const adminUser = isAdminUser(req.user);
    const userId = resolveUserId(req.user);
    if (!adminUser && !userId) {
      return res.status(403).json(error('Forbidden', 403));
    }

    const { id } = req.params;
    const validation = validateEnterprise(req.body);
    if (!validation.valid) {
      return res.status(400).json(error(validation.errors.join(', '), 400));
    }

    const { name, industry, revenue, employee_count, region, status } = req.body;
    const normalizedRevenue = revenue ?? 0;
    const normalizedEmployeeCount = employee_count ?? 0;
    const normalizedRegion = region ?? '';
    const normalizedStatus = status ?? 'active';
    const queryText = adminUser
      ? 'UPDATE enterprises SET name = $1, industry = $2, revenue = $3, employee_count = $4, region = $5, status = $6, updated_at = NOW() WHERE id = $7 RETURNING *'
      : 'UPDATE enterprises SET name = $1, industry = $2, revenue = $3, employee_count = $4, region = $5, status = $6, updated_at = NOW() WHERE id = $7 AND user_id = $8 RETURNING *';
    const queryParams = adminUser
      ? [name, industry, normalizedRevenue, normalizedEmployeeCount, normalizedRegion, normalizedStatus, id]
      : [name, industry, normalizedRevenue, normalizedEmployeeCount, normalizedRegion, normalizedStatus, id, userId];
    const result = await pool.query(queryText, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json(error('Enterprise not found', 404));
    }

    logger.info(`Enterprise updated: ${id}`);
    res.json(success(result.rows[0], 'Enterprise updated'));
  } catch (err) {
    logger.error('Update enterprise error:', err);
    res.status(500).json(error('Failed to update enterprise'));
  }
};

const deleteEnterprise = async (req, res) => {
  try {
    const adminUser = isAdminUser(req.user);
    const userId = resolveUserId(req.user);
    if (!adminUser && !userId) {
      return res.status(403).json(error('Forbidden', 403));
    }

    const { id } = req.params;
    const queryText = adminUser
      ? 'DELETE FROM enterprises WHERE id = $1 RETURNING id'
      : 'DELETE FROM enterprises WHERE id = $1 AND user_id = $2 RETURNING id';
    const queryParams = adminUser ? [id] : [id, userId];
    const result = await pool.query(queryText, queryParams);

    if (result.rows.length === 0) {
      return res.status(404).json(error('Enterprise not found', 404));
    }

    logger.info(`Enterprise deleted: ${id}`);
    res.json(success({ id: result.rows[0].id }, 'Enterprise deleted'));
  } catch (err) {
    logger.error('Delete enterprise error:', err);
    res.status(500).json(error('Failed to delete enterprise'));
  }
};

module.exports = { getEnterprises, getEnterpriseById, createEnterprise, updateEnterprise, deleteEnterprise };
