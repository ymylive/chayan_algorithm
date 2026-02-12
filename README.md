# 茶颜算法分析系统

基于 AI 的企业数据分析与决策支持系统，提供智能化数据洞察和推荐。

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
- ✅ 数据文件上传（CSV/XLSX/JSON）
- ✅ 财务健康度分析
- ✅ 市场趋势预测
- ✅ 竞争力评估
- ✅ 智能推荐生成
- ✅ 可视化图表展示
- ✅ Redis缓存优化

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

## License

MIT
