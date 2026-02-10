# 架构设计

## 系统架构

```
┌─────────────┐
│   Browser   │
└──────┬──────┘
       │ HTTP/WebSocket
┌──────▼──────────────────────────────────┐
│         Nginx (Reverse Proxy)           │
└──────┬──────────────────────────────────┘
       │
   ┌───┴────┐
   │        │
┌──▼───┐ ┌─▼────────┐
│React │ │ FastAPI  │
│ SPA  │ │ Backend  │
└──────┘ └─┬────────┘
           │
    ┌──────┼──────┬─────────┐
    │      │      │         │
┌───▼──┐ ┌─▼──┐ ┌─▼──────┐ ┌▼────────┐
│Postgres│Redis│ Celery  │ │Claude AI│
└────────┘└────┘└─────────┘ └─────────┘
```

## 前后端分离

### 前端 (React)

**职责**
- UI 渲染与交互
- 状态管理 (Zustand/Redux)
- 数据可视化 (ECharts)
- API 调用封装

**目录结构**
```
frontend/src/
├── components/       # 通用组件
│   ├── DataUpload/
│   ├── ChartView/
│   └── DecisionCard/
├── pages/           # 页面组件
│   ├── Dashboard/
│   ├── Analysis/
│   └── Reports/
├── services/        # API 服务
│   └── api.ts
├── stores/          # 状态管理
│   └── useDataStore.ts
└── utils/           # 工具函数
```

### 后端 (FastAPI)

**职责**
- RESTful API
- 业务逻辑处理
- 数据库操作
- AI 服务调度
- 权限验证

**目录结构**
```
backend/
├── api/
│   ├── v1/
│   │   ├── data.py       # 数据上传接口
│   │   ├── analysis.py   # 分析接口
│   │   └── decision.py   # 决策接口
│   └── deps.py           # 依赖注入
├── models/
│   ├── user.py
│   ├── data.py
│   └── analysis.py
├── services/
│   ├── data_service.py
│   ├── analysis_service.py
│   └── ai_service.py
├── ai/
│   ├── mcp_client.py     # MCP 客户端
│   ├── prompts.py        # Prompt 模板
│   └── tools.py          # AI 工具定义
├── core/
│   ├── config.py
│   ├── security.py
│   └── database.py
└── main.py
```

---

## AI 服务集成

### Claude API 调用

```python
# backend/ai/claude_client.py
from anthropic import Anthropic

class ClaudeService:
    def __init__(self):
        self.client = Anthropic(api_key=settings.ANTHROPIC_API_KEY)

    async def analyze_data(self, data: dict, prompt: str):
        response = await self.client.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4096,
            messages=[{
                "role": "user",
                "content": f"{prompt}\n\nData: {data}"
            }]
        )
        return response.content[0].text
```

### Prompt 工程

```python
# backend/ai/prompts.py
ANALYSIS_PROMPT = """
你是一个数据分析专家。请分析以下数据并提供洞察：

数据概览：
{data_summary}

分析维度：
- 趋势分析
- 异常检测
- 相关性分析

请以 JSON 格式返回结果：
{{
  "summary": "总体概述",
  "insights": ["洞察1", "洞察2"],
  "recommendations": ["建议1", "建议2"]
}}
"""

DECISION_PROMPT = """
基于以下分析结果，提供决策建议：

分析结果：
{analysis_result}

业务背景：
{context}

约束条件：
{constraints}

请提供 3-5 条可执行的决策建议，包括优先级和预期影响。
"""
```

---

## MCP 工具调用流程

### 1. MCP Server 配置

```json
// backend/mcp_config.json
{
  "mcpServers": {
    "data-tools": {
      "command": "python",
      "args": ["-m", "mcp_servers.data_tools"],
      "tools": [
        "calculate_statistics",
        "detect_anomalies",
        "forecast_trend"
      ]
    }
  }
}
```

### 2. 工具定义

```python
# backend/ai/tools.py
from mcp import Tool

tools = [
    Tool(
        name="calculate_statistics",
        description="计算数据集的统计指标（均值、中位数、标准差等）",
        input_schema={
            "type": "object",
            "properties": {
                "data": {"type": "array"},
                "metrics": {"type": "array", "items": {"type": "string"}}
            }
        }
    ),
    Tool(
        name="detect_anomalies",
        description="检测时间序列数据中的异常点",
        input_schema={
            "type": "object",
            "properties": {
                "timeseries": {"type": "array"},
                "threshold": {"type": "number"}
            }
        }
    )
]
```

### 3. 调用流程

```
┌──────────┐
│  Client  │
└────┬─────┘
     │ 1. POST /analysis/run
┌────▼─────────┐
│   FastAPI    │
└────┬─────────┘
     │ 2. 调用 AI Service
┌────▼─────────┐
│Claude + MCP  │
└────┬─────────┘
     │ 3. 工具调用
┌────▼─────────┐
│  MCP Server  │ (calculate_statistics)
└────┬─────────┘
     │ 4. 返回结果
┌────▼─────────┐
│   FastAPI    │
└────┬─────────┘
     │ 5. 返回给客户端
┌────▼─────┐
│  Client  │
└──────────┘
```

### 4. 实现示例

```python
# backend/services/ai_service.py
from anthropic import Anthropic
from mcp import MCPClient

class AIService:
    def __init__(self):
        self.claude = Anthropic(api_key=settings.ANTHROPIC_API_KEY)
        self.mcp = MCPClient(config_path="mcp_config.json")

    async def analyze_with_tools(self, data: dict):
        # 1. 准备工具列表
        tools = await self.mcp.list_tools()

        # 2. 调用 Claude
        response = await self.claude.messages.create(
            model="claude-3-5-sonnet-20241022",
            max_tokens=4096,
            tools=tools,
            messages=[{
                "role": "user",
                "content": f"分析这些数据：{data}"
            }]
        )

        # 3. 处理工具调用
        if response.stop_reason == "tool_use":
            tool_use = response.content[-1]
            tool_result = await self.mcp.call_tool(
                tool_use.name,
                tool_use.input
            )

            # 4. 继续对话
            final_response = await self.claude.messages.create(
                model="claude-3-5-sonnet-20241022",
                max_tokens=4096,
                messages=[
                    {"role": "user", "content": f"分析这些数据：{data}"},
                    {"role": "assistant", "content": response.content},
                    {"role": "user", "content": [
                        {
                            "type": "tool_result",
                            "tool_use_id": tool_use.id,
                            "content": tool_result
                        }
                    ]}
                ]
            )
            return final_response.content[0].text

        return response.content[0].text
```

---

## 数据流

### 上传 → 分析 → 决策

```
1. 用户上传 CSV
   ↓
2. 后端解析并存储到 PostgreSQL
   ↓
3. 触发异步分析任务 (Celery)
   ↓
4. AI Service 调用 Claude + MCP 工具
   ↓
5. 生成分析报告并缓存到 Redis
   ↓
6. 前端轮询获取结果并可视化
   ↓
7. 用户请求决策建议
   ↓
8. AI Service 基于分析结果生成建议
   ↓
9. 返回可执行的决策方案
```

---

## 安全设计

### 认证与授权

- JWT Token 认证
- RBAC 权限控制
- API Rate Limiting

### 数据安全

- 敏感数据加密存储
- SQL 注入防护 (SQLAlchemy ORM)
- XSS 防护 (前端输入校验)
- CORS 配置

### AI 安全

- Prompt Injection 防护
- 输出内容过滤
- API Key 安全存储 (环境变量)

---

## 性能优化

### 缓存策略

- Redis 缓存分析结果 (TTL: 1 小时)
- 前端缓存图表配置
- CDN 加速静态资源

### 异步处理

- Celery 处理耗时任务
- WebSocket 推送实时进度

### 数据库优化

- 索引优化
- 查询优化 (避免 N+1)
- 连接池管理
