const fs = require('fs');
const path = require('path');

const FIXTURE_DIR = path.join(__dirname, 'fixtures/golden-benchmark');

const readJson = (filePath) => JSON.parse(fs.readFileSync(filePath, 'utf8'));

const listFiles = (suffix) => fs
  .readdirSync(FIXTURE_DIR)
  .filter((fileName) => fileName.endsWith(suffix))
  .sort();

const isPlainObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);

const validateSchema = (schema, value, nodePath = '$') => {
  const errors = [];

  if (schema.const !== undefined && value !== schema.const) {
    errors.push(`${nodePath} must equal ${JSON.stringify(schema.const)}`);
  }

  if (schema.enum && !schema.enum.includes(value)) {
    errors.push(`${nodePath} must be one of ${schema.enum.join(', ')}`);
  }

  if (schema.type === 'object') {
    if (!isPlainObject(value)) {
      errors.push(`${nodePath} must be an object`);
      return errors;
    }

    if (Array.isArray(schema.required)) {
      schema.required.forEach((key) => {
        if (!(key in value)) {
          errors.push(`${nodePath}.${key} is required`);
        }
      });
    }

    if (schema.additionalProperties === false && schema.properties) {
      Object.keys(value).forEach((key) => {
        if (!Object.prototype.hasOwnProperty.call(schema.properties, key)) {
          errors.push(`${nodePath}.${key} is not allowed`);
        }
      });
    }

    if (schema.properties) {
      Object.entries(schema.properties).forEach(([key, childSchema]) => {
        if (Object.prototype.hasOwnProperty.call(value, key)) {
          errors.push(...validateSchema(childSchema, value[key], `${nodePath}.${key}`));
        }
      });
    }

    return errors;
  }

  if (schema.type === 'array') {
    if (!Array.isArray(value)) {
      errors.push(`${nodePath} must be an array`);
      return errors;
    }

    if (typeof schema.minItems === 'number' && value.length < schema.minItems) {
      errors.push(`${nodePath} must have at least ${schema.minItems} items`);
    }

    if (schema.items) {
      value.forEach((item, index) => {
        errors.push(...validateSchema(schema.items, item, `${nodePath}[${index}]`));
      });
    }

    return errors;
  }

  if (schema.type === 'string') {
    if (typeof value !== 'string') {
      errors.push(`${nodePath} must be a string`);
      return errors;
    }

    if (typeof schema.minLength === 'number' && value.length < schema.minLength) {
      errors.push(`${nodePath} must have minLength ${schema.minLength}`);
    }

    return errors;
  }

  if (schema.type === 'number' && typeof value !== 'number') {
    errors.push(`${nodePath} must be a number`);
  }

  if (schema.type === 'boolean' && typeof value !== 'boolean') {
    errors.push(`${nodePath} must be a boolean`);
  }

  return errors;
};

describe('golden benchmark fixture schema validation', () => {
  const inputSchemaPath = path.join(FIXTURE_DIR, 'benchmark.input.schema.json');
  const expectedSchemaPath = path.join(FIXTURE_DIR, 'benchmark.expected.schema.json');

  const inputSchema = readJson(inputSchemaPath);
  const expectedSchema = readJson(expectedSchemaPath);

  test('keeps benchmark input and expected schema artifacts', () => {
    expect(fs.existsSync(inputSchemaPath)).toBe(true);
    expect(fs.existsSync(expectedSchemaPath)).toBe(true);
  });

  test('valid input fixtures satisfy input schema', () => {
    const inputFiles = listFiles('.input.json').filter((fileName) => fileName !== 'corrupt.input.json');
    expect(inputFiles.length).toBeGreaterThan(0);

    inputFiles.forEach((fileName) => {
      const payload = readJson(path.join(FIXTURE_DIR, fileName));
      const errors = validateSchema(inputSchema, payload);
      expect(errors).toEqual([]);
    });
  });

  test('valid expected fixtures satisfy expected schema', () => {
    const expectedFiles = listFiles('.expected.json').filter((fileName) => fileName !== 'corrupt.expected.json');
    expect(expectedFiles.length).toBeGreaterThan(0);

    expectedFiles.forEach((fileName) => {
      const payload = readJson(path.join(FIXTURE_DIR, fileName));
      const errors = validateSchema(expectedSchema, payload);
      expect(errors).toEqual([]);
    });
  });

  test('rejects explicit corrupt fixtures', () => {
    const corruptInput = readJson(path.join(FIXTURE_DIR, 'corrupt.input.json'));
    const corruptExpected = readJson(path.join(FIXTURE_DIR, 'corrupt.expected.json'));

    const inputErrors = validateSchema(inputSchema, corruptInput);
    const expectedErrors = validateSchema(expectedSchema, corruptExpected);

    expect(inputErrors.length).toBeGreaterThan(0);
    expect(expectedErrors.length).toBeGreaterThan(0);
  });
});
