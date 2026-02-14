# Production mock/simulated upload cleanup runbook

This runbook removes uploaded simulated/mock enterprise data and cascaded rows in
`analysis_results` and `recommendations`.

Safety principles:

- Preview first, delete second.
- Keep all deletes inside one transaction.
- Use deterministic candidate filters.
- Record before/after counts.

## 1) Connect to server and open Postgres shell

```bash
cd /root/chayan_algorithm
docker compose exec -T db psql -U postgres -d chayan_algorithm
```

## 2) Preview candidate rows (NO DELETE)

Run this SQL first:

```sql
WITH candidates AS (
  SELECT e.id, e.name, e.industry, e.created_at
  FROM enterprises e
  WHERE
    (
      e.name ~* '(mock|demo|test|sample|simulat|模拟|测试|样例|示例)'
      OR e.industry ~* '(mock|demo|test|sample|simulat|模拟|测试|样例|示例)'
    )
    OR (
      COALESCE(e.revenue, 0) = 0
      AND COALESCE(e.employee_count, 0) = 0
      AND COALESCE(e.region, '') = ''
      AND COALESCE(e.status, 'active') = 'active'
      AND e.created_at >= NOW() - INTERVAL '30 days'
    )
)
SELECT
  (SELECT COUNT(*) FROM candidates) AS candidate_enterprises,
  (SELECT COUNT(*) FROM analysis_results a WHERE a.enterprise_id IN (SELECT id FROM candidates)) AS candidate_analysis_results,
  (SELECT COUNT(*) FROM recommendations r WHERE r.enterprise_id IN (SELECT id FROM candidates)) AS candidate_recommendations;

WITH candidates AS (
  SELECT e.id, e.name, e.industry, e.created_at
  FROM enterprises e
  WHERE
    (
      e.name ~* '(mock|demo|test|sample|simulat|模拟|测试|样例|示例)'
      OR e.industry ~* '(mock|demo|test|sample|simulat|模拟|测试|样例|示例)'
    )
    OR (
      COALESCE(e.revenue, 0) = 0
      AND COALESCE(e.employee_count, 0) = 0
      AND COALESCE(e.region, '') = ''
      AND COALESCE(e.status, 'active') = 'active'
      AND e.created_at >= NOW() - INTERVAL '30 days'
    )
)
SELECT id, name, industry, created_at
FROM candidates
ORDER BY created_at DESC
LIMIT 200;
```

## 3) Delete candidates in one transaction

Only run this after preview looks correct:

```sql
BEGIN;

WITH candidates AS (
  SELECT e.id
  FROM enterprises e
  WHERE
    (
      e.name ~* '(mock|demo|test|sample|simulat|模拟|测试|样例|示例)'
      OR e.industry ~* '(mock|demo|test|sample|simulat|模拟|测试|样例|示例)'
    )
    OR (
      COALESCE(e.revenue, 0) = 0
      AND COALESCE(e.employee_count, 0) = 0
      AND COALESCE(e.region, '') = ''
      AND COALESCE(e.status, 'active') = 'active'
      AND e.created_at >= NOW() - INTERVAL '30 days'
    )
), deleted_enterprises AS (
  DELETE FROM enterprises e
  USING candidates c
  WHERE e.id = c.id
  RETURNING e.id
)
SELECT COUNT(*) AS deleted_enterprises FROM deleted_enterprises;

COMMIT;
```

Notes:

- `analysis_results` and `recommendations` are removed automatically by
  `ON DELETE CASCADE` through `enterprise_id`.

## 4) Verify after deletion

```sql
SELECT COUNT(*) AS enterprises_total FROM enterprises;
SELECT COUNT(*) AS analysis_results_total FROM analysis_results;
SELECT COUNT(*) AS recommendations_total FROM recommendations;
```

## 5) Clear related Redis cache keys

```bash
docker compose exec -T redis redis-cli --scan --pattern 'analysis:*' | xargs -r docker compose exec -T redis redis-cli DEL
docker compose exec -T redis redis-cli --scan --pattern 'recommendations:*' | xargs -r docker compose exec -T redis redis-cli DEL
docker compose exec -T redis redis-cli DEL mcp:latest-enterprises
```

## 6) Service health checks

```bash
docker compose ps
curl -sS http://127.0.0.1:8000/health
docker compose logs --tail=150 backend
```
