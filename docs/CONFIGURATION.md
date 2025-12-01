# 配置指南

## 配置方式

支持三种配置方式（优先级从高到低）：

1. **环境变量** - 临时覆盖
2. **命令行参数** - 启动时指定
3. **.env 文件** - 持久化配置

## 核心配置

### 服务配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| PORT | 3000 | 服务端口 |
| AUTH_TOKEN | - | API 认证令牌 |
| TIMEOUT | 60000 | 请求超时(ms) |

### 性能配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| MAX_MEMORY_USAGE | 8192 | Node.js 堆内存限制(MB) |
| BROWSER_LIMIT | 25 | 最大浏览器实例数 |
| MAX_CONCURRENT_REQUESTS | 60 | 最大并发请求数 |
| CONTEXT_POOL_SIZE | 20 | 浏览器上下文池大小 |
| PER_SITE_CONCURRENCY | 20 | 单站点最大并发数 |

### 内存管理

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| MEMORY_CLEANUP_INTERVAL | 300000 | 内存清理间隔(ms) |
| ENABLE_MEMORY_THROTTLE | false | 启用内存压力限流 |

## .env 配置示例

```bash
# 服务配置
PORT=3000
AUTH_TOKEN=your_secret_token

# 性能配置
BROWSER_LIMIT=25
MAX_CONCURRENT_REQUESTS=60
TIMEOUT=60000

# 内存配置
MAX_MEMORY_USAGE=8192
CONTEXT_POOL_SIZE=20
MEMORY_CLEANUP_INTERVAL=300000
```

## 启动方式

### 标准启动

```bash
npm start
```

### 命令行参数

```bash
node start.js --PORT=3000 --browserLimit=25 --maxMemoryUsage=8192
```

### 环境变量覆盖

```bash
PORT=8080 BROWSER_LIMIT=10 npm start
```

## 预设配置

### 开发环境

```bash
# .env.development
PORT=3000
BROWSER_LIMIT=10
MAX_CONCURRENT_REQUESTS=20
TIMEOUT=120000
```

### 生产环境

```bash
# .env.production
PORT=3000
BROWSER_LIMIT=25
MAX_CONCURRENT_REQUESTS=60
MAX_MEMORY_USAGE=8192
TIMEOUT=60000
```

### 轻量环境

```bash
# .env.light
PORT=3000
BROWSER_LIMIT=5
MAX_CONCURRENT_REQUESTS=10
MAX_MEMORY_USAGE=2048
CONTEXT_POOL_SIZE=5
```

## 配置说明

### 内存配置

```
MAX_MEMORY_USAGE=8192  # 8GB 堆内存
```

- 控制 Node.js `--max-old-space-size` 参数
- 建议根据服务器内存设置：
  - 4GB 服务器：设置 2048-3072
  - 8GB 服务器：设置 4096-6144
  - 16GB+ 服务器：设置 8192

### 并发配置

```
MAX_CONCURRENT_REQUESTS=60  # 最大并发
BROWSER_LIMIT=25            # 浏览器实例
CONTEXT_POOL_SIZE=20        # 上下文池
```

- `BROWSER_LIMIT` 控制 Puppeteer 浏览器实例数
- `CONTEXT_POOL_SIZE` 控制复用的浏览器上下文数
- 建议 `CONTEXT_POOL_SIZE` <= `BROWSER_LIMIT`

### 超时配置

```
TIMEOUT=60000  # 60秒
```

- Turnstile 通常 2-10 秒完成
- 网络较慢时建议增加到 120000 (2分钟)

## 代理配置

### 全局代理

```bash
# .env
HTTP_PROXY=http://proxy.example.com:8080
HTTPS_PROXY=https://proxy.example.com:8080
NO_PROXY=localhost,127.0.0.1
```

### 请求级代理

通过 API 请求参数传递：

```json
{
  "type": "cftoken",
  "websiteUrl": "https://example.com",
  "websiteKey": "xxx",
  "proxy": {
    "host": "127.0.0.1",
    "port": 8080,
    "username": "user",
    "password": "pass"
  }
}
```

**注意**：`port` 必须是整数类型。

## 监控配置

| 配置项 | 默认值 | 说明 |
|--------|--------|------|
| MAX_RECENT_TOKENS | 50 | 保留的最近 Token 数 |
| MAX_REQUEST_HISTORY | 100 | 保留的请求历史数 |
| MEMORY_MONITOR_INTERVAL | 30000 | 内存监控间隔(ms) |

### 监控端点

| 端点 | 说明 |
|------|------|
| GET /health | 健康检查 |
| GET /api/monitor | 监控数据 |
| GET /monitor | 监控面板 |

## 端口配置

### 修改端口

```bash
# 方式1: .env 文件
PORT=8080

# 方式2: 环境变量
PORT=8080 npm start

# 方式3: 命令行参数
node start.js --PORT=8080
```

### 端口冲突

```bash
# 查看端口占用
lsof -i :3000          # Mac/Linux
netstat -ano | findstr :3000  # Windows

# 终止进程
kill -9 <PID>          # Mac/Linux
taskkill /PID <PID> /F # Windows
```

### 防火墙

```bash
# Ubuntu
sudo ufw allow 3000

# CentOS
sudo firewall-cmd --add-port=3000/tcp --permanent
sudo firewall-cmd --reload
```

## 故障排除

### 内存不足

```bash
# 降低并发和内存使用
BROWSER_LIMIT=10
MAX_CONCURRENT_REQUESTS=20
MAX_MEMORY_USAGE=4096
CONTEXT_POOL_SIZE=10
```

### 请求超时

```bash
# 增加超时时间
TIMEOUT=120000
```

### 并发限制

```bash
# 增加并发数（需要足够内存）
MAX_CONCURRENT_REQUESTS=100
BROWSER_LIMIT=50
```

### 代理失败

检查：
1. 代理服务器是否可达
2. `port` 是否为整数类型
3. 认证信息是否正确

## 完整配置参考

```bash
# ===== 服务配置 =====
PORT=3000
AUTH_TOKEN=

# ===== 性能配置 =====
BROWSER_LIMIT=25
MAX_CONCURRENT_REQUESTS=60
CONTEXT_POOL_SIZE=20
PER_SITE_CONCURRENCY=20
TIMEOUT=60000

# ===== 内存配置 =====
MAX_MEMORY_USAGE=8192
MEMORY_CLEANUP_INTERVAL=300000
ENABLE_MEMORY_THROTTLE=false

# ===== 浏览器配置 =====
HEADLESS=true
VIEWPORT_WIDTH=520
VIEWPORT_HEIGHT=240
BROWSER_CONNECT_TIMEOUT=120000

# ===== 监控配置 =====
MAX_RECENT_TOKENS=50
MAX_REQUEST_HISTORY=100
MEMORY_MONITOR_INTERVAL=30000

# ===== 代理配置 =====
# HTTP_PROXY=http://proxy:8080
# HTTPS_PROXY=https://proxy:8080
# NO_PROXY=localhost,127.0.0.1
```
