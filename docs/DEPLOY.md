# 部署指南

## 本地开发环境

### 1. 环境准备

```bash
# 安装 Python 依赖
cd backend
python -m venv venv
source venv/bin/activate  # Windows: venv\Scripts\activate
pip install -r requirements.txt

# 安装 Node 依赖
cd ../frontend
npm install
```

### 2. 配置环境变量

创建 `backend/.env`：

```env
# 数据库
DATABASE_URL=postgresql://user:password@localhost:5432/chayan_db

# Redis
REDIS_URL=redis://localhost:6379/0

# AI 服务
ANTHROPIC_API_KEY=your_claude_api_key
MCP_SERVER_URL=http://localhost:3001

# JWT
SECRET_KEY=your_secret_key_here
ALGORITHM=HS256
ACCESS_TOKEN_EXPIRE_MINUTES=30

# 应用配置
DEBUG=True
CORS_ORIGINS=http://localhost:3000
```

### 3. 初始化数据库

```bash
cd backend
alembic upgrade head
python scripts/init_db.py
```

### 4. 启动服务

```bash
# 终端 1: 后端
cd backend
uvicorn main:app --reload --port 8000

# 终端 2: 前端
cd frontend
npm run dev

# 终端 3: Celery Worker (可选)
cd backend
celery -A tasks.celery worker --loglevel=info
```

---

## Docker 部署

### 1. 构建镜像

```bash
# 构建后端镜像
docker build -t chayan-backend:latest -f docker/backend.Dockerfile .

# 构建前端镜像
docker build -t chayan-frontend:latest -f docker/frontend.Dockerfile .
```

### 2. 使用 Docker Compose

创建 `docker-compose.yml`：

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:14
    environment:
      POSTGRES_DB: chayan_db
      POSTGRES_USER: chayan
      POSTGRES_PASSWORD: password
    volumes:
      - postgres_data:/var/lib/postgresql/data
    ports:
      - "5432:5432"

  redis:
    image: redis:6-alpine
    ports:
      - "6379:6379"

  backend:
    image: chayan-backend:latest
    depends_on:
      - postgres
      - redis
    environment:
      DATABASE_URL: postgresql://chayan:password@postgres:5432/chayan_db
      REDIS_URL: redis://redis:6379/0
    ports:
      - "8000:8000"
    volumes:
      - ./backend:/app

  frontend:
    image: chayan-frontend:latest
    depends_on:
      - backend
    ports:
      - "3000:3000"
    environment:
      VITE_API_URL: http://localhost:8000

volumes:
  postgres_data:
```

启动：
```bash
docker-compose up -d
```

---

## 生产部署

### 1. 服务器要求

- CPU: 4 核+
- 内存: 8GB+
- 磁盘: 50GB+ SSD
- 操作系统: Ubuntu 22.04 LTS

### 2. 使用 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    # 前端
    location / {
        proxy_pass http://localhost:3000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
    }

    # 后端 API
    location /api {
        proxy_pass http://localhost:8000;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
    }

    # WebSocket (如需要)
    location /ws {
        proxy_pass http://localhost:8000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
    }
}
```

### 3. 使用 Supervisor 管理进程

创建 `/etc/supervisor/conf.d/chayan.conf`：

```ini
[program:chayan-backend]
command=/path/to/venv/bin/uvicorn main:app --host 0.0.0.0 --port 8000
directory=/path/to/backend
user=www-data
autostart=true
autorestart=true
stderr_logfile=/var/log/chayan/backend.err.log
stdout_logfile=/var/log/chayan/backend.out.log

[program:chayan-celery]
command=/path/to/venv/bin/celery -A tasks.celery worker --loglevel=info
directory=/path/to/backend
user=www-data
autostart=true
autorestart=true
```

重启 Supervisor：
```bash
sudo supervisorctl reread
sudo supervisorctl update
sudo supervisorctl start chayan-backend
```

### 4. SSL 证书（Let's Encrypt）

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d your-domain.com
```

### 5. 监控与日志

- 使用 Prometheus + Grafana 监控系统指标
- 使用 ELK Stack 收集日志
- 配置告警规则（CPU、内存、磁盘、API 响应时间）

---

## 备份策略

### 数据库备份

```bash
# 每日自动备份
0 2 * * * pg_dump -U chayan chayan_db | gzip > /backup/db_$(date +\%Y\%m\%d).sql.gz
```

### 文件备份

```bash
# 备份上传文件和配置
rsync -avz /path/to/uploads /backup/
rsync -avz /path/to/.env /backup/
```

---

## 故障排查

### 后端无法启动
1. 检查数据库连接：`psql -U chayan -d chayan_db`
2. 检查端口占用：`lsof -i :8000`
3. 查看日志：`tail -f /var/log/chayan/backend.err.log`

### 前端白屏
1. 检查 API 地址配置
2. 查看浏览器控制台错误
3. 检查 Nginx 配置

### 性能问题
1. 检查数据库慢查询：`SELECT * FROM pg_stat_statements ORDER BY total_time DESC LIMIT 10;`
2. 检查 Redis 连接数
3. 使用 `htop` 查看系统资源
