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

const parsePositiveInt = (value, fallback) => {
  const parsed = Number.parseInt(value, 10);
  if (Number.isNaN(parsed) || parsed < 1) {
    return fallback;
  }
  return parsed;
};

const getEnterprises = async (req, res) => {
  try {
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

    let whereSql = '';
    const params = [];

    if (status && ALLOWED_STATUS.has(status)) {
      whereSql = ' WHERE status = $1';
      params.push(status);
    }

    const countSql = `SELECT COUNT(*) FROM enterprises${whereSql}`;
    const countResult = await pool.query(countSql, [...params]);
    const total = parseInt(countResult.rows[0].count, 10);

    const dataSql = `SELECT * FROM enterprises${whereSql} ORDER BY ${sort} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    const dataParams = [...params, limit, offset];

    const result = await pool.query(dataSql, dataParams);
    res.json(success(result.rows, 'Success', total));
  } catch (err) {
    logger.error('Get enterprises error:', err);
    res.status(500).json(error(err.message));
  }
};

const getEnterpriseById = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('SELECT * FROM enterprises WHERE id = $1', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json(error('Enterprise not found', 404));
    }

    res.json(success(result.rows[0]));
  } catch (err) {
    logger.error('Get enterprise error:', err);
    res.status(500).json(error(err.message));
  }
};

const createEnterprise = async (req, res) => {
  try {
    const validation = validateEnterprise(req.body);
    if (!validation.valid) {
      return res.status(400).json(error(validation.errors.join(', '), 400));
    }

    const { name, industry, revenue, employee_count, region, status = 'active' } = req.body;
    const normalizedRevenue = revenue ?? 0;
    const normalizedEmployeeCount = employee_count ?? 0;
    const normalizedRegion = region ?? '';
    const normalizedStatus = status ?? 'active';
    const result = await pool.query(
      'INSERT INTO enterprises (name, industry, revenue, employee_count, region, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, industry, normalizedRevenue, normalizedEmployeeCount, normalizedRegion, normalizedStatus]
    );

    logger.info(`Enterprise created: ${result.rows[0].id}`);
    res.status(201).json(success(result.rows[0], 'Enterprise created'));
  } catch (err) {
    logger.error('Create enterprise error:', err);
    res.status(500).json(error(err.message));
  }
};

const updateEnterprise = async (req, res) => {
  try {
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
    const result = await pool.query(
      'UPDATE enterprises SET name = $1, industry = $2, revenue = $3, employee_count = $4, region = $5, status = $6, updated_at = NOW() WHERE id = $7 RETURNING *',
      [name, industry, normalizedRevenue, normalizedEmployeeCount, normalizedRegion, normalizedStatus, id]
    );

    if (result.rows.length === 0) {
      return res.status(404).json(error('Enterprise not found', 404));
    }

    logger.info(`Enterprise updated: ${id}`);
    res.json(success(result.rows[0], 'Enterprise updated'));
  } catch (err) {
    logger.error('Update enterprise error:', err);
    res.status(500).json(error(err.message));
  }
};

const deleteEnterprise = async (req, res) => {
  try {
    const { id } = req.params;
    const result = await pool.query('DELETE FROM enterprises WHERE id = $1 RETURNING id', [id]);

    if (result.rows.length === 0) {
      return res.status(404).json(error('Enterprise not found', 404));
    }

    logger.info(`Enterprise deleted: ${id}`);
    res.json(success({ id: result.rows[0].id }, 'Enterprise deleted'));
  } catch (err) {
    logger.error('Delete enterprise error:', err);
    res.status(500).json(error(err.message));
  }
};

module.exports = { getEnterprises, getEnterpriseById, createEnterprise, updateEnterprise, deleteEnterprise };
