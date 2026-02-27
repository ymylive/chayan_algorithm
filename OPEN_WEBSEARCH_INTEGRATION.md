# 深度研究功能 - open-webSearch 集成指南

## 问题诊断

当前深度研究功能存在的问题：
- Google News RSS 返回重定向链接（`https://news.google.com/rss/articles/CBMi...?oc=5`）
- 抓取后只能获取标题（11 chars），无法获取实际网页内容
- 导致数据质量评估为 insufficient

## 解决方案：集成 open-webSearch

### 什么是 open-webSearch？

open-webSearch 是一个开源的 MCP 服务器，提供：
- **无需 API key** 的多引擎搜索
- **8 个搜索引擎**：Bing、Baidu、DuckDuckGo、Brave、Exa、GitHub、Juejin、CSDN
- **返回实际网页 URL**（不是重定向链接）
- **内容抓取工具**：fetchCsdnArticle、fetchGithubReadme、fetchJuejinArticle

GitHub: https://github.com/Aas-ee/open-webSearch

### 集成步骤

#### 1. 安装 open-webSearch

**方式 A：使用 npx（推荐）**
```bash
# 在后台启动 open-webSearch MCP 服务器
npx open-websearch@latest &

# 或指定端口和搜索引擎
DEFAULT_SEARCH_ENGINE=duckduckgo PORT=3001 npx open-websearch@latest &
```

**方式 B：使用 Docker**
```bash
# 创建 docker-compose.yml
cat > docker-compose-open-websearch.yml <<EOF
version: '3.8'
services:
  open-websearch:
    image: ghcr.io/aas-ee/open-websearch:latest
    ports:
      - "3001:3000"
    environment:
      - DEFAULT_SEARCH_ENGINE=duckduckgo
      - ENABLE_CORS=true
      - MODE=http
EOF

# 启动服务
docker-compose -f docker-compose-open-websearch.yml up -d
```

#### 2. 配置环境变量

在 `backend/.env` 中添加：

```bash
# open-webSearch MCP 服务器配置
MCP_OPEN_WEBSEARCH_MCP_URL=http://localhost:3001
MCP_OPEN_WEBSEARCH_ENGINES=duckduckgo,bing,baidu,csdn,juejin

# 禁用 Google News（避免重定向链接）
MCP_ENABLE_GOOGLE_NEWS_SOURCE=false

# 可选：配置其他搜索源
# MCP_TAVILY_API_KEY=your_api_key_here
# MCP_SEARXNG_BASE_URL=http://localhost:8080
```

#### 3. 验证配置

**测试 open-webSearch 服务**：
```bash
# 测试搜索功能
curl http://localhost:3001/search?q=量子计算芯片市场&engine=duckduckgo

# 预期返回：包含实际网页 URL 的搜索结果
```

**测试深度研究服务**：
```bash
cd backend && node test-deep-research.js
```

**预期结果**：
- 搜索结果包含实际网页 URL（不是 Google News 重定向）
- 抓取内容 > 100 chars
- 数据质量评估：good 或 limited

#### 4. 优化搜索策略

项目的 mcp-server.js 已经配置了搜索源优先级（backend/mcp-server.js:1803-1820）：

```javascript
const searchAcrossSources = async (query, options = {}) => {
  const sources = [
    // 优先级 1: open-webSearch（如果配置）
    MCP_OPEN_WEBSEARCH_MCP_URL ? { source: 'open_websearch', execute: () => searchOpenWebSearchMcp(query) } : null,

    // 优先级 2: SearXNG（如果配置）
    MCP_SEARXNG_BASE_URL ? { source: 'searxng', execute: () => searchSearxng(query) } : null,

    // 优先级 3: Tavily（如果配置）
    MCP_TAVILY_API_KEY ? { source: 'tavily', execute: () => searchTavilyApi(query, options) } : null,

    // 优先级 4: Google News（如果启用）
    MCP_ENABLE_GOOGLE_NEWS_SOURCE ? { source: 'google_news', execute: () => searchGoogleNewsRss(query, options) } : null,

    // 优先级 5: Crawl4AI（如果配置）
    MCP_CRAWL4AI_MCP_URL ? { source: 'crawl4ai', execute: () => searchCrawl4AiMcp(query) } : null,

    // 备用源
    { source: 'bing_web', execute: () => searchBingRss(query) },
    { source: 'bing_news', execute: () => searchBingNewsRss(query) },
    { source: 'duckduckgo', execute: () => searchDuckDuckGoHtml(query) },
    MCP_ENABLE_WIKIPEDIA_SOURCE ? { source: 'wikipedia', execute: () => searchWikipediaOpenSearch(query) } : null
  ].filter(Boolean);

  // 并发执行所有搜索源
  // ...
};
```

**建议配置**：
1. 启用 open-webSearch（优先级最高）
2. 禁用 Google News（避免重定向链接）
3. 保留 Bing/DuckDuckGo 作为备用

### 预期效果对比

#### 优化前（使用 Google News RSS）
```
Success: true
Search Results: 12
Fetched URLs: 5
Data Quality: insufficient
Total Content Length: 55 chars (所有 URL < 100 chars)
Market Data: 0 entries
Competitors: 0 entries
```

#### 优化后（使用 open-webSearch）
```
Success: true
Search Results: 12
Fetched URLs: 8-10
Data Quality: good
Total Content Length: 5000-10000 chars
Market Data: 5-10 entries
Competitors: 10-20 entries
Sources: 实际网页 URL（不是重定向链接）
```

### 使用示例

#### 1. 启动 open-webSearch 服务

```bash
# 方式 A：使用 npx
DEFAULT_SEARCH_ENGINE=duckduckgo PORT=3001 npx open-websearch@latest &

# 方式 B：使用 Docker
docker-compose -f docker-compose-open-websearch.yml up -d
```

#### 2. 配置环境变量

```bash
# backend/.env
MCP_OPEN_WEBSEARCH_MCP_URL=http://localhost:3001
MCP_OPEN_WEBSEARCH_ENGINES=duckduckgo,bing,baidu
MCP_ENABLE_GOOGLE_NEWS_SOURCE=false
```

#### 3. 重启后端服务

```bash
cd backend
npm run dev
```

#### 4. 测试深度研究

**前端**：
- 访问 http://localhost:3000/deep-research
- 输入研究主题：新能源汽车市场
- 点击"启动研究"

**API**：
```bash
curl -X POST http://localhost:5000/api/research/deep \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer TOKEN" \
  -d '{
    "topic": "新能源汽车市场",
    "maxUrls": 10,
    "async": true
  }'
```

### 故障排查

#### 问题 1：open-webSearch 服务无法启动

**检查**：
```bash
# 检查端口是否被占用
lsof -i :3001

# 查看服务日志
npx open-websearch@latest
```

**解决**：
- 更换端口：`PORT=3002 npx open-websearch@latest`
- 检查 Node.js 版本：需要 Node.js >= 16

#### 问题 2：搜索结果仍然是 Google News 链接

**检查**：
```bash
# 检查环境变量
echo $MCP_OPEN_WEBSEARCH_MCP_URL
echo $MCP_ENABLE_GOOGLE_NEWS_SOURCE
```

**解决**：
- 确保 `MCP_OPEN_WEBSEARCH_MCP_URL` 已配置
- 确保 `MCP_ENABLE_GOOGLE_NEWS_SOURCE=false`
- 重启后端服务

#### 问题 3：抓取内容仍然很少

**检查**：
```bash
# 测试单个 URL 抓取
cd backend && node -e "
const service = require('./src/services/deepResearchService');
(async () => {
  const result = await service.fetchWebPage('https://www.example.com', 2);
  console.log('Content length:', result.contentLength);
})();
"
```

**解决**：
- 检查 fetch_web_page 工具是否正常工作
- 检查目标网站是否有反爬虫机制
- 增加重试次数：`maxRetries: 3`

### 其他搜索源选项

#### Tavily API（推荐，需要 API key）

```bash
# 注册获取 API key: https://tavily.com
MCP_TAVILY_API_KEY=your_api_key_here
MCP_TAVILY_SEARCH_DEPTH=advanced
```

#### SearXNG（需要自建实例）

```bash
# 部署 SearXNG: https://github.com/searxng/searxng
MCP_SEARXNG_BASE_URL=http://localhost:8080
```

### 总结

**立即可用的解决方案**：
1. 启动 open-webSearch 服务（`npx open-websearch@latest`）
2. 配置环境变量（`MCP_OPEN_WEBSEARCH_MCP_URL=http://localhost:3001`）
3. 禁用 Google News（`MCP_ENABLE_GOOGLE_NEWS_SOURCE=false`）
4. 重启后端服务

**预期改进**：
- 数据质量：insufficient → good
- 内容长度：55 chars → 5000-10000 chars
- 市场数据：0 → 5-10 entries
- 竞争对手：0 → 10-20 entries

**文档**：
- open-webSearch GitHub: https://github.com/Aas-ee/open-webSearch
- 项目配置：backend/mcp-server.js:87-96
- 搜索策略：backend/mcp-server.js:1803-1820
