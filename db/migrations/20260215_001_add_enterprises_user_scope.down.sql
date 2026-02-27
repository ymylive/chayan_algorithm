DROP INDEX IF EXISTS idx_enterprises_user_id;

ALTER TABLE enterprises
    DROP CONSTRAINT IF EXISTS fk_enterprises_user_id;

ALTER TABLE enterprises
    DROP COLUMN IF EXISTS user_id;
