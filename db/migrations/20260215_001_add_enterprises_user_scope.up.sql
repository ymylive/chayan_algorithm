ALTER TABLE enterprises
    ADD COLUMN IF NOT EXISTS user_id INTEGER;

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_enterprises_user_id'
    ) THEN
        ALTER TABLE enterprises
            ADD CONSTRAINT fk_enterprises_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX IF NOT EXISTS idx_enterprises_user_id ON enterprises(user_id);
