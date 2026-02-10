CREATE TABLE IF NOT EXISTS enterprises (
    id SERIAL PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    industry VARCHAR(100),
    data_json JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT chk_name_not_empty CHECK (LENGTH(TRIM(name)) > 0)
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

CREATE INDEX idx_enterprises_industry ON enterprises(industry);
CREATE INDEX idx_enterprises_created ON enterprises(created_at DESC);
CREATE INDEX idx_analysis_results_enterprise ON analysis_results(enterprise_id);
CREATE INDEX idx_analysis_results_type ON analysis_results(analysis_type);
CREATE INDEX idx_recommendations_enterprise ON recommendations(enterprise_id);
CREATE INDEX idx_recommendations_priority ON recommendations(priority DESC);
