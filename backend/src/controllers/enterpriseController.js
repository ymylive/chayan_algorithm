const { success, error } = require('../utils/responseFormatter');
const pool = require('../config/database');
const { validateEnterprise } = require('../utils/validator');
const logger = require('../config/logger');

const getEnterprises = async (req, res) => {
  try {
    const { page = 1, limit = 10, sort = 'id', order = 'ASC', status } = req.query;
    const offset = (page - 1) * limit;

    let sql = 'SELECT * FROM enterprises';
    const params = [];

    if (status) {
      sql += ' WHERE status = $1';
      params.push(status);
    }

    sql += ` ORDER BY ${sort} ${order} LIMIT $${params.length + 1} OFFSET $${params.length + 2}`;
    params.push(limit, offset);

    const result = await pool.query(sql, params);
    res.json(success(result.rows));
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
    const result = await pool.query(
      'INSERT INTO enterprises (name, industry, revenue, employee_count, region, status) VALUES ($1, $2, $3, $4, $5, $6) RETURNING *',
      [name, industry, revenue, employee_count, region, status]
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
    const result = await pool.query(
      'UPDATE enterprises SET name = $1, industry = $2, revenue = $3, employee_count = $4, region = $5, status = $6, updated_at = NOW() WHERE id = $7 RETURNING *',
      [name, industry, revenue, employee_count, region, status, id]
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
