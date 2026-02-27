# 茶颜算法分析系统

基于 AI 的企业数据分析与决策支持系统，提供多源检索、深度研究、质量门禁与智能推荐能力。

## 技术栈

**前端**
- Vue 3 + TypeScript
- Element Plus
- ECharts
- Pinia + Vue Router

**后端**
- Node.js + Express
- PostgreSQL 15
- Redis 7
- Python 3 (pandas, scikit-learn)

**容器化**
- Docker + Docker Compose
- Nginx

## 核心功能

- ✅ 企业数据管理（完整CRUD）
- ✅ 企业数据按用户维度隔离（`user_id`）
- ✅ 数据文件上传（CSV/XLSX/JSON）
- ✅ 财务健康度分析
- ✅ 市场趋势预测
- ✅ 竞争力评估
- ✅ 智能推荐生成与可视化图表展示
- ✅ AI 分析质量门禁（quality contract / fallback 可观测）
- ✅ MCP 多源检索聚合（open-webSearch、Tavily、SearXNG、Crawl4AI、EDGAR 等）
- ✅ 深度研究工作流（搜索 → 抓取 → 分析，支持异步任务）
- ✅ WebSocket 实时进度推送（`/ws/research`）
- ✅ Redis 缓存与任务状态存储

## 快速开始

### 使用 Docker Compose（推荐）

```bash
git clone https://github.com/ymylive/chayan_algorithm.git
cd chayan_algorithm
cp .env.example .env
docker compose up -d --build
```

访问 http://localhost:3000

### 服务器 Docker 部署

```bash
git pull origin main
cp .env.example .env
docker compose up -d --build --remove-orphans
docker compose ps
```

部署后可用以下命令检查服务状态：

```bash
curl http://127.0.0.1:8000/health
docker compose logs -f backend
```

默认端口：
- 前端：`3000`
- 后端 API：`8000`
- PostgreSQL：容器内部 `5432`
- Redis：容器内部 `6379`

### 本地开发

**后端**
```bash
cd backend
npm install
cp .env.example .env
npm start
```

**前端**
```bash
cd frontend
npm install
npm run dev
```

## 项目结构

```
chayan_algorithm/
├── backend/
│   ├── src/
│   │   ├── controllers/    # API控制器
│   │   ├── services/       # 业务逻辑
│   │   ├── config/         # 配置文件
│   │   └── utils/          # 工具函数
│   ├── python/             # Python分析脚本
│   └── Dockerfile
├── frontend/
│   ├── src/
│   │   ├── views/          # 页面组件
│   │   ├── utils/          # 工具函数
│   │   ├── stores/         # 状态管理
│   │   └── router/         # 路由配置
│   ├── Dockerfile
│   └── nginx.conf
├── db/
│   └── schema.sql          # 数据库结构
└── docker-compose.yml
```

## API 端点

**健康检查**
- `GET /health` - 基础健康检查
- `GET /api/health` - API 健康检查

**认证**
- `POST /api/auth/register` - 注册
- `POST /api/auth/login` - 登录（限流）
- `POST /api/auth/logout` - 退出登录
- `GET /api/auth/me` - 当前用户信息

**企业管理**
- `GET /api/enterprises` - 企业列表
- `GET /api/enterprises/:id` - 企业详情
- `POST /api/enterprises` - 创建企业
- `PUT /api/enterprises/:id` - 更新企业
- `DELETE /api/enterprises/:id` - 删除企业

**数据分析**
- `POST /api/upload` - 上传数据
- `POST /api/analyze` - 执行分析
- `GET /api/analysis/:enterpriseId` - 获取分析结果
- `POST /api/analysis` - 创建分析

**推荐系统**
- `GET /api/recommendations/:enterpriseId` - 获取推荐
- `POST /api/recommendations/:enterpriseId` - 生成推荐

**AI 与 MCP**
- `GET /api/settings/ai` - 获取 AI 配置
- `POST /api/settings/ai` - 更新 AI 配置
- `GET /api/mcp/search` - MCP 检索
- `POST /api/mcp/fetch` - MCP 抓取
- `POST /api/mcp/ai-analyze` - MCP 增强分析

**深度研究**
- `POST /api/research/deep` - 启动深度研究（支持同步/异步）
- `GET /api/research/progress/:jobId` - 获取研究进度
- `GET /api/research/result/:jobId` - 获取研究结果

## 相关文档

- `docs/DEEP_RESEARCH.md` - 深度研究功能与配置说明

## License

MIT
