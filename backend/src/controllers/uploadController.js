const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseFile } = require('../utils/fileParser');
const pool = require('../config/database');

const upload = multer({ dest: 'uploads/' });

async function handleUpload(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const data = await parseFile(req.file.path, req.file.mimetype);

    const validated = data.filter(row => row['企业名称'] && row['行业']);

    if (validated.length === 0) {
      fs.unlinkSync(req.file.path);
      return res.status(400).json({ error: 'No valid data found. Required fields: 企业名称, 行业' });
    }

    const inserted = [];
    for (const row of validated) {
      const result = await pool.query(
        'INSERT INTO enterprises (name, industry) VALUES ($1, $2) RETURNING *',
        [row['企业名称'], row['行业']]
      );
      inserted.push(result.rows[0]);
    }

    fs.unlinkSync(req.file.path);

    res.json({
      success: true,
      total: data.length,
      inserted: inserted.length,
      preview: inserted.slice(0, 10)
    });
  } catch (error) {
    if (req.file) fs.unlinkSync(req.file.path);
    res.status(500).json({ error: error.message });
  }
}

module.exports = { upload, handleUpload };
