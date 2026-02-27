CREATE TABLE IF NOT EXISTS enterprises (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    user_id INTEGER,
    industry VARCHAR(100),
    revenue NUMERIC(18,2) NOT NULL DEFAULT 0,
    employee_count INTEGER NOT NULL DEFAULT 0,
    region VARCHAR(100) NOT NULL DEFAULT '',
    status VARCHAR(20) NOT NULL DEFAULT 'active',
    data_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_name_not_empty CHECK (LENGTH(TRIM(name)) > 0),
    CONSTRAINT chk_enterprises_revenue_non_negative CHECK (revenue >= 0),
    CONSTRAINT chk_enterprises_employee_count_non_negative CHECK (employee_count >= 0),
    CONSTRAINT chk_enterprises_status_valid CHECK (status IN ('active', 'inactive', 'archived'))
);

CREATE TABLE IF NOT EXISTS analysis_results (
    id SERIAL PRIMARY KEY,
    enterprise_id INTEGER NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    analysis_type VARCHAR(50) NOT NULL,
    result_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_analysis_type CHECK (analysis_type IN ('financial', 'market_trend', 'competitiveness'))
);

CREATE TABLE IF NOT EXISTS recommendations (
    id SERIAL PRIMARY KEY,
    enterprise_id INTEGER NOT NULL REFERENCES enterprises(id) ON DELETE CASCADE,
    recommendation_text TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_priority_range CHECK (priority BETWEEN 0 AND 10),
    CONSTRAINT chk_recommendation_not_empty CHECK (LENGTH(TRIM(recommendation_text)) > 0)
);

CREATE TABLE IF NOT EXISTS users (
    id SERIAL PRIMARY KEY,
    email VARCHAR(320) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    role VARCHAR(20) NOT NULL DEFAULT 'user',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_users_email_not_empty CHECK (LENGTH(TRIM(email)) > 0)
);

CREATE TABLE IF NOT EXISTS user_ai_settings (
    id SERIAL PRIMARY KEY,
    user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    settings_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT uq_user_ai_settings_user_id UNIQUE (user_id)
);

CREATE TABLE IF NOT EXISTS ai_analysis_jobs (
    id UUID PRIMARY KEY,
    user_id INTEGER REFERENCES users(id) ON DELETE CASCADE,
    target VARCHAR(200) NOT NULL,
    status VARCHAR(20) NOT NULL DEFAULT 'queued',
    progress INTEGER NOT NULL DEFAULT 0,
    workflow_step VARCHAR(80) NOT NULL DEFAULT 'queued',
    workflow_trace JSONB NOT NULL DEFAULT '[]',
    request_payload JSONB NOT NULL DEFAULT '{}',
    result_json JSONB,
    error_message TEXT,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    CONSTRAINT chk_ai_analysis_jobs_status CHECK (status IN ('queued', 'running', 'completed', 'failed')),
    CONSTRAINT chk_ai_analysis_jobs_progress CHECK (progress BETWEEN 0 AND 100),
    CONSTRAINT chk_ai_analysis_jobs_target_not_empty CHECK (LENGTH(TRIM(target)) > 0)
);

ALTER TABLE enterprises
    ADD COLUMN IF NOT EXISTS user_id INTEGER,
    ADD COLUMN IF NOT EXISTS revenue NUMERIC(18,2) NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS employee_count INTEGER NOT NULL DEFAULT 0,
    ADD COLUMN IF NOT EXISTS region VARCHAR(100) NOT NULL DEFAULT '',
    ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'active';

DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_enterprises_revenue_non_negative'
    ) THEN
        ALTER TABLE enterprises
            ADD CONSTRAINT chk_enterprises_revenue_non_negative CHECK (revenue >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_enterprises_employee_count_non_negative'
    ) THEN
        ALTER TABLE enterprises
            ADD CONSTRAINT chk_enterprises_employee_count_non_negative CHECK (employee_count >= 0);
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'chk_enterprises_status_valid'
    ) THEN
        ALTER TABLE enterprises
            ADD CONSTRAINT chk_enterprises_status_valid CHECK (status IN ('active', 'inactive', 'archived'));
    END IF;

    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'fk_enterprises_user_id'
    ) THEN
        ALTER TABLE enterprises
            ADD CONSTRAINT fk_enterprises_user_id FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL;
    END IF;
END $$;

CREATE INDEX idx_enterprises_industry ON enterprises(industry);
CREATE INDEX idx_enterprises_created ON enterprises(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_enterprises_user_id ON enterprises(user_id);
CREATE INDEX idx_analysis_results_enterprise ON analysis_results(enterprise_id);
CREATE INDEX idx_analysis_results_type ON analysis_results(analysis_type);
CREATE INDEX idx_analysis_results_enterprise_created ON analysis_results(enterprise_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_user_created ON ai_analysis_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_status ON ai_analysis_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_target_lower ON ai_analysis_jobs(LOWER(target));
CREATE INDEX idx_recommendations_enterprise ON recommendations(enterprise_id);
CREATE INDEX idx_recommendations_priority ON recommendations(priority DESC);
CREATE INDEX idx_recommendations_enterprise_priority ON recommendations(enterprise_id, priority DESC);
CREATE UNIQUE INDEX IF NOT EXISTS idx_users_email_lower_unique ON users (LOWER(email));
CREATE INDEX idx_user_ai_settings_user_id ON user_ai_settings(user_id);
