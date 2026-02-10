# API 文档

Base URL: `http://localhost:8000/api/v1`

## 认证

所有 API 请求需在 Header 中携带 Token：
```
Authorization: Bearer <token>
```

## 接口列表

### 1. 数据上传

**POST** `/data/upload`

上传业务数据文件（CSV/Excel）

**Request Body (multipart/form-data)**
```json
{
  "file": "file",
  "data_type": "sales|inventory|customer",
  "description": "string (optional)"
}
```

**Response**
```json
{
  "code": 0,
  "message": "success",
  "data": {
    "upload_id": "uuid",
    "filename": "string",
    "rows": 1000,
    "columns": ["col1", "col2"],
    "created_at": "2026-02-10T10:00:00Z"
  }
}
```

---

### 2. 数据分析

**POST** `/analysis/run`

执行数据分析任务

**Request Body**
```json
{
  "upload_id": "uuid",
  "analysis_type": "trend|correlation|forecast|anomaly",
  "params": {
    "time_range": "7d|30d|90d",
    "metrics": ["sales", "profit"]
  }
}
```

**Response**
```json
{
  "code": 0,
  "data": {
    "task_id": "uuid",
    "status": "pending|processing|completed|failed",
    "result": {
      "summary": "string",
      "insights": ["insight1", "insight2"],
      "metrics": {}
    }
  }
}
```

**GET** `/analysis/{task_id}`

查询分析任务状态

---

### 3. 数据可视化

**GET** `/visualization/chart`

获取图表数据

**Query Parameters**
- `upload_id`: string (required)
- `chart_type`: line|bar|pie|scatter
- `dimensions`: string[] (x 轴维度)
- `metrics`: string[] (y 轴指标)

**Response**
```json
{
  "code": 0,
  "data": {
    "chart_type": "line",
    "config": {},
    "data": [
      {"date": "2026-01-01", "sales": 1000},
      {"date": "2026-01-02", "sales": 1200}
    ]
  }
}
```

---

### 4. 决策建议

**POST** `/decision/suggest`

基于 AI 生成决策建议

**Request Body**
```json
{
  "analysis_id": "uuid",
  "context": "string (业务背景)",
  "constraints": {
    "budget": 100000,
    "timeframe": "30d"
  }
}
```

**Response**
```json
{
  "code": 0,
  "data": {
    "suggestions": [
      {
        "title": "string",
        "description": "string",
        "priority": "high|medium|low",
        "expected_impact": "string",
        "action_items": ["action1", "action2"]
      }
    ],
    "reasoning": "string (AI 推理过程)"
  }
}
```

---

## 错误码

| Code | Message | Description |
|------|---------|-------------|
| 0    | success | 成功 |
| 400  | bad_request | 请求参数错误 |
| 401  | unauthorized | 未授权 |
| 404  | not_found | 资源不存在 |
| 500  | internal_error | 服务器错误 |

## 限流

- 每个 IP 每分钟最多 60 次请求
- 文件上传最大 50MB
