# API 文档

## 概述

统一 API 端点：`POST http://localhost:3000/`

支持三种服务类型：
- `cftoken` - Cloudflare Turnstile 令牌
- `cf5s` - Cloudflare 5秒盾绕过
- `cookies` - 网站 Cookie 获取

## 请求参数

| 参数 | cftoken | cf5s | cookies | 类型 | 说明 |
|------|:-------:|:----:|:-------:|------|------|
| type | 必需 | 必需 | 必需 | string | 服务类型 |
| websiteUrl | 必需 | 必需 | 必需 | string | 目标网站 URL |
| websiteKey | 必需 | - | - | string | Turnstile 站点密钥 |
| waitTime | - | - | 可选 | number | 等待时间(ms)，默认 10000 |
| proxy | 可选 | 可选 | 可选 | object | 代理配置 |
| authToken | 可选 | 可选 | 可选 | string | 认证令牌 |

## Turnstile 令牌 (cftoken)

获取 Cloudflare Turnstile 验证令牌。

### 请求

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "type": "cftoken",
    "websiteUrl": "https://example.com",
    "websiteKey": "0x4AAAAAAAxxxxxx"
  }'
```

### 响应

```json
{
  "code": 200,
  "token": "0.xxxxxx..."
}
```

### 说明

- `websiteKey` 可在目标网站的 Turnstile 组件中找到
- 通常耗时 2-10 秒
- Token 有效期约 5 分钟

## 5秒盾绕过 (cf5s)

获取 Cloudflare 5秒盾防护的 cf_clearance Cookie。

### 请求

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "type": "cf5s",
    "websiteUrl": "https://example.com"
  }'
```

### 响应

```json
{
  "code": 200,
  "cf_clearance": "xxxxx...",
  "cookies": [
    {
      "name": "cf_clearance",
      "value": "xxxxx...",
      "domain": ".example.com",
      "path": "/",
      "expires": 1234567890,
      "httpOnly": true,
      "secure": true
    }
  ],
  "headers": {
    "User-Agent": "Mozilla/5.0...",
    "Accept": "text/html..."
  },
  "url": "https://example.com",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 使用示例

```javascript
// 使用获取的 cf_clearance 访问目标网站
const response = await fetch('https://example.com/api/data', {
  headers: {
    'Cookie': `cf_clearance=${result.cf_clearance}`,
    'User-Agent': result.headers['User-Agent']
  }
});
```

## Cookie 获取 (cookies)

获取任意网站的所有 Cookie。

### 请求

```bash
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "type": "cookies",
    "websiteUrl": "https://example.com",
    "waitTime": 15000
  }'
```

### 响应

```json
{
  "code": 200,
  "cookies": [
    {
      "name": "session_id",
      "value": "abc123",
      "domain": ".example.com",
      "path": "/",
      "expires": -1,
      "httpOnly": true,
      "secure": true,
      "sameSite": "Lax"
    }
  ],
  "cookiesMap": {
    "session_id": "abc123",
    "_ga": "GA1.1.123456789"
  },
  "headers": {
    "User-Agent": "Mozilla/5.0..."
  },
  "url": "https://example.com",
  "timestamp": "2024-01-01T00:00:00.000Z"
}
```

### 参数说明

- `waitTime`: 页面加载等待时间，用于确保 JS 生成的 Cookie 完成设置

## 代理配置

所有请求类型都支持代理：

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

**重要**：`port` 必须是整数类型，不能是字符串。

### 代理格式

| 字段 | 类型 | 必需 | 说明 |
|------|------|:----:|------|
| host | string | 是 | 代理服务器地址 |
| port | number | 是 | 代理端口（整数） |
| username | string | 否 | 认证用户名 |
| password | string | 否 | 认证密码 |

## 认证

如果服务配置了 `AUTH_TOKEN`，需要在请求中包含：

```json
{
  "type": "cftoken",
  "websiteUrl": "https://example.com",
  "websiteKey": "0x4AAAAAAAxxxxxx",
  "authToken": "your-auth-token"
}
```

## 响应状态码

| 状态码 | 说明 |
|--------|------|
| 200 | 成功 |
| 400 | 请求参数错误（检查必需字段和类型） |
| 401 | 认证失败（authToken 无效） |
| 429 | 请求过多（超过并发限制） |
| 500 | 服务器内部错误 |
| 503 | 服务不可用（系统压力过高） |

## 错误响应

```json
{
  "code": 400,
  "message": "Missing required parameter: websiteKey",
  "schema": [...]
}
```

## 辅助端点

### 健康检查

```bash
curl http://localhost:3000/health
```

```json
{
  "status": "ok",
  "uptime": 3600,
  "memory": {...}
}
```

### 监控数据

```bash
curl http://localhost:3000/api/monitor
```

```json
{
  "uptime": 3600,
  "requests": {
    "total": 1000,
    "success": 950,
    "failed": 50,
    "active": 5,
    "successRate": 95
  },
  "memory": {...},
  "browser": {...}
}
```

### 监控面板

浏览器访问：`http://localhost:3000/monitor`

## 代码示例

### JavaScript

```javascript
async function solveTurnstile(url, siteKey, proxy = null) {
  const body = {
    type: 'cftoken',
    websiteUrl: url,
    websiteKey: siteKey
  };

  if (proxy) {
    body.proxy = {
      host: proxy.host,
      port: Number(proxy.port),  // 确保是整数
      username: proxy.username,
      password: proxy.password
    };
  }

  const response = await fetch('http://localhost:3000/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  const result = await response.json();
  if (result.code === 200) {
    return result.token;
  }
  throw new Error(result.message);
}

// 使用示例
const token = await solveTurnstile(
  'https://example.com',
  '0x4AAAAAAAxxxxxx'
);
```

### Python

```python
import requests

def solve_turnstile(url, site_key, proxy=None):
    body = {
        'type': 'cftoken',
        'websiteUrl': url,
        'websiteKey': site_key
    }

    if proxy:
        body['proxy'] = {
            'host': proxy['host'],
            'port': int(proxy['port']),  # 确保是整数
            'username': proxy.get('username'),
            'password': proxy.get('password')
        }

    response = requests.post(
        'http://localhost:3000/',
        json=body,
        timeout=120
    )

    result = response.json()
    if result.get('code') == 200:
        return result['token']
    raise Exception(result.get('message'))

# 使用示例
token = solve_turnstile(
    'https://example.com',
    '0x4AAAAAAAxxxxxx'
)
```

### 批量处理

```javascript
async function batchSolve(tasks) {
  const results = await Promise.all(
    tasks.map(task =>
      fetch('http://localhost:3000/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(task)
      }).then(r => r.json())
    )
  );

  return results.map((result, i) => ({
    task: tasks[i],
    success: result.code === 200,
    data: result.token || result.cf_clearance || result.cookiesMap,
    error: result.code !== 200 ? result.message : null
  }));
}

// 使用示例
const results = await batchSolve([
  { type: 'cftoken', websiteUrl: 'https://site1.com', websiteKey: 'key1' },
  { type: 'cftoken', websiteUrl: 'https://site2.com', websiteKey: 'key2' },
  { type: 'cf5s', websiteUrl: 'https://site3.com' }
]);
```

### 错误重试

```javascript
async function solveWithRetry(params, maxRetries = 3, delay = 5000) {
  for (let i = 0; i < maxRetries; i++) {
    try {
      const response = await fetch('http://localhost:3000/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params)
      });

      const result = await response.json();
      if (result.code === 200) {
        return result;
      }

      console.log(`尝试 ${i + 1} 失败: ${result.message}`);
    } catch (error) {
      console.log(`尝试 ${i + 1} 错误: ${error.message}`);
    }

    if (i < maxRetries - 1) {
      await new Promise(r => setTimeout(r, delay));
    }
  }

  throw new Error('所有重试均失败');
}
```

## 性能建议

1. **合理设置超时**：Turnstile 通常 2-10 秒，建议客户端超时 120 秒
2. **控制并发**：根据服务器性能，建议并发 10-50
3. **使用代理轮换**：高频请求建议使用代理池
4. **监控成功率**：通过 `/api/monitor` 监控服务状态

## 限制说明

| 限制项 | 默认值 | 配置项 |
|--------|--------|--------|
| 最大并发请求 | 60 | MAX_CONCURRENT_REQUESTS |
| 单站点并发 | 20 | PER_SITE_CONCURRENCY |
| 请求超时 | 60秒 | TIMEOUT |
| 队列超时 | 2分钟 | - |
