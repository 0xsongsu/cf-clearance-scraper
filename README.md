# CF Clearance Scraper

高性能本地 Cloudflare 验证绕过服务，支持 Turnstile 令牌生成、5秒盾绕过和 Cookie 获取。

## 功能特性

| 功能 | 说明 |
|------|------|
| **Turnstile 令牌** | 自动生成 Cloudflare Turnstile 验证令牌 |
| **5秒盾绕过** | 获取 cf_clearance Cookie |
| **Cookie 获取** | 获取任意网站的完整 Cookie |
| **代理支持** | HTTP/HTTPS 代理，支持认证 |
| **高并发** | 上下文池复用，支持 100+ 并发 |
| **实时监控** | Web 面板监控服务状态和性能 |

## 快速开始

### 安装

```bash
git clone https://github.com/your-repo/cf-clearance-scraper.git
cd cf-clearance-scraper
npm install
```

### 启动服务

```bash
# 标准启动 (8GB 堆内存)
npm start

# 自定义配置启动
node start.js --PORT=3000 --browserLimit=25
```

### 访问监控面板

启动后访问 http://localhost:3000/monitor 查看实时监控。

## API 使用

### 统一端点

```
POST http://localhost:3000/
Content-Type: application/json
```

### 1. 获取 Turnstile 令牌

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "type": "cftoken",
    "websiteUrl": "https://example.com",
    "websiteKey": "0x4AAAAAAAxxxxxx"
  }'
```

**响应：**
```json
{
  "code": 200,
  "token": "0.xxxxxx..."
}
```

### 2. 获取 cf_clearance (5秒盾)

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "type": "cf5s",
    "websiteUrl": "https://example.com"
  }'
```

**响应：**
```json
{
  "code": 200,
  "cf_clearance": "xxxxx",
  "cookies": [...],
  "headers": {...}
}
```

### 3. 获取网站 Cookies

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "type": "cookies",
    "websiteUrl": "https://example.com",
    "waitTime": 15000
  }'
```

**响应：**
```json
{
  "code": 200,
  "cookies": [...],
  "cookiesMap": {"cookie_name": "value", ...},
  "headers": {...}
}
```

### 使用代理

所有请求类型都支持代理配置：

```json
{
  "type": "cftoken",
  "websiteUrl": "https://example.com",
  "websiteKey": "0x4AAAAAAAxxxxxx",
  "proxy": {
    "host": "127.0.0.1",
    "port": 8080,
    "username": "user",
    "password": "pass"
  }
}
```

> **注意**: `proxy.port` 必须是整数类型

## 配置参数

### 环境变量

| 变量 | 默认值 | 说明 |
|------|--------|------|
| `PORT` | 3000 | 服务端口 |
| `BROWSER_LIMIT` | 25 | 最大浏览器实例数 |
| `TIMEOUT` | 60000 | 请求超时(ms) |
| `MAX_MEMORY_USAGE` | 8192 | 最大堆内存(MB) |
| `MAX_CONCURRENT_REQUESTS` | 60 | 最大并发请求数 |
| `CONTEXT_POOL_SIZE` | 20 | 上下文池大小 |
| `AUTH_TOKEN` | - | API 认证令牌 |

### 启动参数

```bash
node start.js --PORT=3000 --browserLimit=25 --maxMemoryUsage=8192
```

## 性能指标

| 指标 | 数值 |
|------|------|
| 单请求延迟 | 2-5 秒 |
| 10 并发吞吐 | ~2 req/s |
| 内存占用 | 500MB-2GB |
| 支持并发数 | 100+ |

## API 端点

| 端点 | 方法 | 说明 |
|------|------|------|
| `/` | POST | 主 API 端点 |
| `/health` | GET | 健康检查 |
| `/api/monitor` | GET | 监控数据 |
| `/monitor` | GET | 监控面板 |

## 状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误 |
| 401 | 认证失败 |
| 429 | 请求过多 |
| 500 | 服务器错误 |
| 503 | 服务不可用 |

## 代码示例

### JavaScript

```javascript
async function solveTurnstile(url, siteKey) {
  const response = await fetch('http://localhost:3000/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      type: 'cftoken',
      websiteUrl: url,
      websiteKey: siteKey
    })
  });

  const result = await response.json();
  if (result.code === 200) {
    return result.token;
  }
  throw new Error(result.message);
}
```

### Python

```python
import requests

def solve_turnstile(url, site_key):
    response = requests.post('http://localhost:3000/', json={
        'type': 'cftoken',
        'websiteUrl': url,
        'websiteKey': site_key
    }, timeout=120)

    result = response.json()
    if result.get('code') == 200:
        return result['token']
    raise Exception(result.get('message'))
```

### cURL

```bash
# Turnstile
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{"type":"cftoken","websiteUrl":"https://example.com","websiteKey":"0x4AAA..."}'

# 5秒盾
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{"type":"cf5s","websiteUrl":"https://example.com"}'
```

## 文档

- [API 详细文档](docs/API.md)
- [配置指南](docs/CONFIGURATION.md)

## 致谢

基于 [ZFC-Digital/cf-clearance-scraper](https://github.com/ZFC-Digital/cf-clearance-scraper) 开发。

## 免责声明

本工具仅用于学习和测试目的。使用者需遵守相关法律法规，对使用本工具产生的任何后果自行承担责任。

## 许可证

ISC License
