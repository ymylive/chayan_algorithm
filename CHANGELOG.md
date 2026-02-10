# Changelog

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
