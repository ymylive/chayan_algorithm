const csv = require('csv-parser');
const xlsx = require('xlsx');
const fs = require('fs');

async function parseFile(filePath, mimetype) {
  if (mimetype === 'text/csv' || filePath.endsWith('.csv')) {
    return parseCsv(filePath);
  } else if (mimetype === 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' || filePath.endsWith('.xlsx')) {
    return parseExcel(filePath);
  } else if (mimetype === 'application/json' || filePath.endsWith('.json')) {
    return parseJson(filePath);
  }
  throw new Error('Unsupported file type');
}

function parseCsv(filePath) {
  return new Promise((resolve, reject) => {
    const results = [];
    fs.createReadStream(filePath)
      .pipe(csv())
      .on('data', (data) => results.push(data))
      .on('end', () => resolve(results))
      .on('error', reject);
  });
}

function parseExcel(filePath) {
  const workbook = xlsx.readFile(filePath);
  const sheetName = workbook.SheetNames[0];
  const sheet = workbook.Sheets[sheetName];
  return xlsx.utils.sheet_to_json(sheet);
}

function parseJson(filePath) {
  const data = fs.readFileSync(filePath, 'utf8');
  return JSON.parse(data);
}

module.exports = { parseFile };
