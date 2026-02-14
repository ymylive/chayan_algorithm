const fs = require('fs');
const path = require('path');

describe('db schema contracts for account and user ai settings', () => {
  const schemaPath = path.join(__dirname, '../../db/schema.sql');
  const migrationUpPath = path.join(
    __dirname,
    '../../db/migrations/20260214_001_add_users_and_user_ai_settings.up.sql'
  );
  const migrationDownPath = path.join(
    __dirname,
    '../../db/migrations/20260214_001_add_users_and_user_ai_settings.down.sql'
  );

  const readSchema = () => fs.readFileSync(schemaPath, 'utf8');
  const readMigrationUp = () => fs.readFileSync(migrationUpPath, 'utf8');
  const readMigrationDown = () => fs.readFileSync(migrationDownPath, 'utf8');

  test('keeps legacy business tables defined', () => {
    const schema = readSchema();

    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS enterprises/i);
    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS analysis_results/i);
    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS recommendations/i);
  });

  test('defines persistent users and user_ai_settings tables with fk linkage', () => {
    const schema = readSchema();

    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS users/i);
    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS user_ai_settings/i);
    expect(schema).toMatch(/user_id\s+INTEGER\s+NOT NULL\s+REFERENCES\s+users\(id\)\s+ON DELETE CASCADE/i);
  });

  test('enforces case-insensitive unique email semantics', () => {
    const schema = readSchema();

    expect(schema).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique\s+ON users\s*\(\s*LOWER\(email\)\s*\)/i
    );
  });

  test('includes migration up/down artifacts for users and user_ai_settings', () => {
    expect(fs.existsSync(migrationUpPath)).toBe(true);
    expect(fs.existsSync(migrationDownPath)).toBe(true);
  });

  test('migration up creates users, user_ai_settings, and unique lower(email) index', () => {
    const migrationUp = readMigrationUp();

    expect(migrationUp).toMatch(/CREATE TABLE IF NOT EXISTS users/i);
    expect(migrationUp).toMatch(/CREATE TABLE IF NOT EXISTS user_ai_settings/i);
    expect(migrationUp).toMatch(
      /CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique\s+ON users\s*\(\s*LOWER\(email\)\s*\)/i
    );
  });

  test('migration down drops only new user settings objects safely', () => {
    const migrationDown = readMigrationDown();

    expect(migrationDown).toMatch(/DROP INDEX IF EXISTS idx_user_ai_settings_user_id/i);
    expect(migrationDown).toMatch(/DROP INDEX IF EXISTS idx_users_email_lower_unique/i);
    expect(migrationDown).toMatch(/DROP TABLE IF EXISTS user_ai_settings/i);
    expect(migrationDown).toMatch(/DROP TABLE IF EXISTS users/i);
    expect(migrationDown).not.toMatch(/DROP TABLE IF EXISTS enterprises/i);
    expect(migrationDown).not.toMatch(/DROP TABLE IF EXISTS analysis_results/i);
    expect(migrationDown).not.toMatch(/DROP TABLE IF EXISTS recommendations/i);
  });
});
