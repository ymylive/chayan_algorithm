const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { parseFile } = require('../utils/fileParser');
const pool = require('../config/database');

const DEFAULT_MAX_UPLOAD_SIZE_BYTES = 10 * 1024 * 1024;
const DEFAULT_INSERT_BATCH_SIZE = 500;
const ALLOWED_MIME_TYPES = new Set([
  'text/csv',
  'application/json',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'
]);
const ALLOWED_EXTENSIONS = new Set(['.csv', '.json', '.xlsx']);

function toPositiveInt(value, fallback) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? Math.floor(parsed) : fallback;
}

const maxUploadSizeBytes = toPositiveInt(
  process.env.UPLOAD_MAX_SIZE_BYTES,
  DEFAULT_MAX_UPLOAD_SIZE_BYTES
);

const multerUpload = multer({
  dest: 'uploads/',
  limits: {
    fileSize: maxUploadSizeBytes
  },
  fileFilter: (req, file, cb) => {
    const extension = path.extname(String(file.originalname || '')).toLowerCase();
    const isAllowedType = ALLOWED_MIME_TYPES.has(file.mimetype) || ALLOWED_EXTENSIONS.has(extension);

    if (!isAllowedType) {
      req.fileValidationError = 'Unsupported file type. Allowed: CSV, XLSX, JSON';
      return cb(null, false);
    }

    cb(null, true);
  }
});

const upload = {
  single(fieldName) {
    const middleware = multerUpload.single(fieldName);
    return (req, res, next) => {
      middleware(req, res, (err) => {
        if (err instanceof multer.MulterError) {
          err.status = 400;
          if (err.code === 'LIMIT_FILE_SIZE') {
            err.message = `File too large. Max size is ${maxUploadSizeBytes} bytes`;
          }
        }
        next(err);
      });
    };
  }
};

async function cleanupUploadedFile(filePath) {
  if (!filePath) {
    return;
  }

  await fs.promises.unlink(filePath).catch(() => {});
}

async function bulkInsertEnterprises(rows) {
  const batchSize = toPositiveInt(process.env.UPLOAD_INSERT_BATCH_SIZE, DEFAULT_INSERT_BATCH_SIZE);
  const preview = [];
  let insertedCount = 0;

  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const values = [];
    const params = [];

    batch.forEach((row, rowIndex) => {
      const offset = rowIndex * 2;
      values.push(`($${offset + 1}, $${offset + 2})`);
      params.push(row['企业名称'], row['行业']);
    });

    const result = await pool.query(
      `INSERT INTO enterprises (name, industry) VALUES ${values.join(', ')} RETURNING *`,
      params
    );

    insertedCount += result.rows.length;

    if (preview.length < 10) {
      const remainingSlots = 10 - preview.length;
      preview.push(...result.rows.slice(0, remainingSlots));
    }
  }

  return { insertedCount, preview };
}

async function handleUpload(req, res) {
  const uploadedFilePath = req.file?.path;

  try {
    if (req.fileValidationError) {
      return res.status(400).json({ error: req.fileValidationError });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No file uploaded' });
    }

    const data = await parseFile(req.file.path, req.file.mimetype);

    const validated = data.filter(row => row['企业名称'] && row['行业']);

    if (validated.length === 0) {
      return res.status(400).json({ error: 'No valid data found. Required fields: 企业名称, 行业' });
    }

    const insertedResult = await bulkInsertEnterprises(validated);

    res.json({
      success: true,
      total: data.length,
      inserted: insertedResult.insertedCount,
      preview: insertedResult.preview
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  } finally {
    await cleanupUploadedFile(uploadedFilePath);
  }
}

module.exports = { upload, handleUpload };
