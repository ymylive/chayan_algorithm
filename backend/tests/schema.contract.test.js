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
  const aiAnalyzeJobsMigrationUpPath = path.join(
    __dirname,
    '../../db/migrations/20260223_001_add_ai_analysis_jobs.up.sql'
  );
  const aiAnalyzeJobsMigrationDownPath = path.join(
    __dirname,
    '../../db/migrations/20260223_001_add_ai_analysis_jobs.down.sql'
  );

  const readSchema = () => fs.readFileSync(schemaPath, 'utf8');
  const readMigrationUp = () => fs.readFileSync(migrationUpPath, 'utf8');
  const readMigrationDown = () => fs.readFileSync(migrationDownPath, 'utf8');
  const readAiAnalyzeJobsMigrationUp = () => fs.readFileSync(aiAnalyzeJobsMigrationUpPath, 'utf8');
  const readAiAnalyzeJobsMigrationDown = () => fs.readFileSync(aiAnalyzeJobsMigrationDownPath, 'utf8');

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

  test('defines ai_analysis_jobs table with user-scoped linkage and constraints', () => {
    const schema = readSchema();

    expect(schema).toMatch(/CREATE TABLE IF NOT EXISTS ai_analysis_jobs/i);
    expect(schema).toMatch(/user_id\s+INTEGER\s+REFERENCES\s+users\(id\)\s+ON DELETE CASCADE/i);
    expect(schema).toMatch(/CONSTRAINT chk_ai_analysis_jobs_status CHECK \(status IN \('queued', 'running', 'completed', 'failed'\)\)/i);
    expect(schema).toMatch(/CONSTRAINT chk_ai_analysis_jobs_progress CHECK \(progress BETWEEN 0 AND 100\)/i);
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

  test('includes migration up/down artifacts for ai_analysis_jobs', () => {
    expect(fs.existsSync(aiAnalyzeJobsMigrationUpPath)).toBe(true);
    expect(fs.existsSync(aiAnalyzeJobsMigrationDownPath)).toBe(true);
  });

  test('ai_analysis_jobs migration up/down add and remove only ai_analysis_jobs artifacts', () => {
    const migrationUp = readAiAnalyzeJobsMigrationUp();
    const migrationDown = readAiAnalyzeJobsMigrationDown();

    expect(migrationUp).toMatch(/CREATE TABLE IF NOT EXISTS ai_analysis_jobs/i);
    expect(migrationUp).toMatch(/CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_user_created/i);
    expect(migrationUp).toMatch(/CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_status/i);
    expect(migrationUp).toMatch(/CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_target_lower/i);

    expect(migrationDown).toMatch(/DROP INDEX IF EXISTS idx_ai_analysis_jobs_target_lower/i);
    expect(migrationDown).toMatch(/DROP INDEX IF EXISTS idx_ai_analysis_jobs_status/i);
    expect(migrationDown).toMatch(/DROP INDEX IF EXISTS idx_ai_analysis_jobs_user_created/i);
    expect(migrationDown).toMatch(/DROP TABLE IF EXISTS ai_analysis_jobs/i);
    expect(migrationDown).not.toMatch(/DROP TABLE IF EXISTS enterprises/i);
    expect(migrationDown).not.toMatch(/DROP TABLE IF EXISTS analysis_results/i);
    expect(migrationDown).not.toMatch(/DROP TABLE IF EXISTS recommendations/i);
  });
});
