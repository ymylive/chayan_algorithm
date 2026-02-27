# Changelog

## [1.2.0] - 2026-02-22

### Added
- 新增深度研究能力：`/api/research/deep`、`/api/research/progress/:jobId`、`/api/research/result/:jobId`，以及前端 `DeepResearch` 页面。
- 新增 WebSocket 实时进度通道（`/ws/research`）与后端任务推送服务。
- 新增研究任务与质量相关测试资产（deep research 测试、golden benchmark、quality eval harness）。
- 新增企业用户隔离相关数据库变更（`enterprises.user_id` 字段、索引、外键）及迁移脚本。
- 新增共享回退原因映射（`shared/mcp-fallback-reasons.json`）供前端质量提示复用。

### Changed
- 重构并增强 MCP 聚合检索与排序链路，支持 open-webSearch、Tavily、SearXNG、Crawl4AI、EDGAR 等多源策略与回退机制。
- 增强 AI 分析服务质量门禁与遥测能力（quality contract、严格模式、部分失败可观测、运维提示）。
- 更新 Docker 与 `.env.example` 默认配置：移除示例中的硬编码敏感值，补充 MCP/AI 新参数。
- 前端 `AIAnalyze` 页面新增质量面板、MCP 健康状态和 TOPSIS 排名可视化增强。
- CI 增加 `npm run test:quality-eval` 质量评测步骤。

### Fixed
- 修复深度研究链路在抓取失败场景下的降级与错误传播一致性问题。
- 修复多源检索部分失败时前后端状态反馈不完整的问题（补充回退原因与来源信息）。

## [1.1.0] - 2026-02-13

### Added
- 新增基于 HttpOnly Cookie 的登录鉴权链路（`/api/auth/login`、JWT 中间件、登录限流）。
- 新增 AI 配置管理接口（`/api/settings/ai`）与 MCP 相关能力（`/api/mcp/search`、`/api/mcp/fetch`、`/api/mcp/ai-analyze`）。
- 新增前端登录、AI 分析、AI 设置页面及路由守卫（未登录跳转登录页并保留回跳地址）。
- 新增后端与前端关键测试用例（auth、middleware、settings、router、responsive）。
- 新增 GitHub Actions CI 工作流（backend test + frontend test/build）。

### Changed
- Docker 部署配置升级为根目录 `.env.example` 驱动，`docker compose up -d --build` 可直接完成全栈构建部署。
- 前端请求客户端默认启用 `withCredentials`，并统一处理 401 场景的会话清理与重定向。
- 优化分析、推荐、上传与企业管理相关流程的输入校验与错误处理。

### Fixed
- 修复 Node.js 版本与 Vite 7 构建兼容问题（升级到 Node 20 运行基线）。
- 修复后端 Docker 镜像中 Python 依赖安装兼容问题。

## [1.0.0] - 2026-02-10

### Added
- 完整的企业数据CRUD接口（创建、读取、更新、删除）
- 前端Home页面企业列表展示、搜索、分页功能
- ECharts图表配置工具（仪表盘、折线图、雷达图、柱状图）
- 数据分析控制器，集成Python AI分析服务
- 智能推荐生成系统，基于企业分析结果
- Redis缓存优化（5分钟TTL）
- 完整的数据库schema（enterprises、analysis_results、recommendations表）
- Docker生产环境配置（前后端多阶段构建）
- Nginx反向代理和Gzip压缩
- 数据验证和错误处理机制
- 日志记录系统

### Features
- 财务健康度分析（资产负债率、流动比率、净利润率）
- 市场趋势预测（线性回归模型）
- 竞争力评估（市场份额、创新能力、品牌价值）
- 数据文件上传支持（CSV、XLSX、JSON）
- 可视化图表展示

### Technical Stack
- Frontend: Vue 3 + TypeScript + Element Plus + ECharts
- Backend: Node.js + Express + PostgreSQL + Redis
- AI: Python (pandas, scikit-learn)
- DevOps: Docker + Docker Compose + Nginx

### Infrastructure
- PostgreSQL 15数据库，包含索引和约束优化
- Redis 7缓存层
- Docker容器化部署
- 多阶段构建优化镜像大小
