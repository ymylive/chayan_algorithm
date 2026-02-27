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

CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_user_created ON ai_analysis_jobs(user_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_status ON ai_analysis_jobs(status);
CREATE INDEX IF NOT EXISTS idx_ai_analysis_jobs_target_lower ON ai_analysis_jobs(LOWER(target));
