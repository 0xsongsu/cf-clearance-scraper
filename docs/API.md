# API 使用指南

## API 端点

**统一API端点**: `POST /solve`

支持的服务类型：
- `cftoken` - Cloudflare Turnstile 令牌生成
- `cfcookie` - 获取 cf_clearance Cookie

**标准响应格式**: `{code: 200, message: "success", token/cf_clearance: "xxx"}`

## Cloudflare 功能

### 1. 生成 Turnstile 令牌

生成 Cloudflare Turnstile 验证令牌：

```javascript
const response = await fetch('http://localhost:3000/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        type: "cftoken",
        websiteUrl: "https://turnstile.zeroclover.io/",
        websiteKey: "0x4AAAAAAAEwzhD6pyKkgXC0"
    })
});

const result = await response.json();
if (result.code === 200) {
    console.log('Turnstile token:', result.token);
} else {
    console.error('Error:', result.message);
}
```

### 2. 获取 cf_clearance Cookie

获取 Cloudflare 防护页面的 cf_clearance cookie：

```javascript
const response = await fetch('http://localhost:3000/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        type: "cfcookie",
        websiteUrl: "https://example.com"
    })
});

const result = await response.json();
if (result.code === 200) {
    console.log('cf_clearance:', result.cf_clearance);
    // 使用 cookie 进行后续请求
    const cookieHeader = `cf_clearance=${result.cf_clearance}`;
} else {
    console.error('Error:', result.message);
}
```


## 代理支持

所有服务类型都支持代理配置：

```javascript
{
    type: "cftoken", // 或 "cfcookie"
    websiteUrl: "https://example.com",
    websiteKey: "your-site-key", // cftoken 需要
    proxy: {
        host: "127.0.0.1",
        port: 8080,
        username: "user", // 可选
        password: "pass"  // 可选
    }
}
```

## 认证

如果服务设置了认证令牌，需要在请求中包含：

```javascript
{
    type: "cftoken", // 或 "cfcookie"
    websiteUrl: "https://example.com",
    websiteKey: "your-site-key", // cftoken 需要
    authToken: "your-auth-token"
}
```

## 响应格式

### 成功响应

```json
{
    "code": 200,
    "token": "turnstile_token...",      // cftoken/hcaptcha 类型
    "cf_clearance": "cookie_value...", // cfcookie 类型
    "message": "success"               // 可选成功消息
}
```

### 错误响应

```json
{
    "code": 500,
    "message": "错误描述",
    "token": null
}
```

### 状态码说明

- `200` - 请求成功
- `400` - 请求参数错误
- `401` - 认证失败 (当设置了 authToken)
- `429` - 请求过多 (超过并发限制)
- `500` - 服务器内部错误

## Python 示例

```python
import requests
import json

def solve_hcaptcha(website_url, website_key):
    url = "http://localhost:3000/"
    
    payload = {
        "type": "hcaptcha",
        "websiteUrl": website_url,
        "websiteKey": website_key
    }
    
    headers = {
        "Content-Type": "application/json"
    }
    
    response = requests.post(url, json=payload, headers=headers, timeout=300)
    result = response.json()
    
    if result.get("code") == 200:
        print(f"✅ hCaptcha solved successfully!")
        print(f"Token: {result['token'][:50]}...")
        return result["token"]
    else:
        print(f"❌ Failed: {result.get('message')}")
        return None

# 使用示例
token = solve_hcaptcha(
    "https://accounts.hcaptcha.com/demo", 
    "338af34c-7bcb-4c7c-900b-acbec73d7d43"
)
```

## 性能优化

### 并发请求

```javascript
// 并发处理多个请求
const requests = [
    solve_captcha("https://site1.com", "key1"),
    solve_captcha("https://site2.com", "key2"),
    solve_captcha("https://site3.com", "key3")
];

const results = await Promise.all(requests);
```

### 错误重试

```javascript
async function solve_with_retry(websiteUrl, websiteKey, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            const response = await fetch('http://localhost:3000/', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: "hcaptcha",
                    websiteUrl,
                    websiteKey
                })
            });
            
            const result = await response.json();
            if (result.code === 200) {
                return result.token;
            }
            
            console.log(`Attempt ${i + 1} failed: ${result.message}`);
        } catch (error) {
            console.log(`Attempt ${i + 1} error: ${error.message}`);
        }
        
        // 等待重试
        if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    
    throw new Error('All retry attempts failed');
}
```

## 完整示例

### 获取 cf_clearance 并使用

```javascript
async function getCfClearanceAndUse(targetUrl) {
    // 1. 获取 cf_clearance cookie
    const response = await fetch('http://localhost:3000/', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            type: "cfcookie",
            websiteUrl: targetUrl
        })
    });
    
    const result = await response.json();
    if (result.code !== 200) {
        throw new Error(`Failed to get cf_clearance: ${result.message}`);
    }
    
    // 2. 使用 cf_clearance 访问目标网站
    const siteResponse = await fetch(targetUrl, {
        headers: {
            'Cookie': `cf_clearance=${result.cf_clearance}`,
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
        }
    });
    
    return await siteResponse.text();
}

// 使用示例
getCfClearanceAndUse('https://example.com')
    .then(html => console.log('页面内容获取成功'))
    .catch(err => console.error('获取失败:', err));
```

### 批量处理多个站点

```javascript
async function solveBatchCaptchas(sites) {
    const requests = sites.map(site => 
        fetch('http://localhost:3000/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: site.type, // "cftoken", "hcaptcha", "cfcookie"
                websiteUrl: site.url,
                websiteKey: site.key // 如果需要
            })
        }).then(res => res.json())
    );
    
    const results = await Promise.all(requests);
    return results.map((result, index) => ({
        site: sites[index].url,
        success: result.code === 200,
        data: result.token || result.cf_clearance || null,
        error: result.message
    }));
}

// 使用示例
const sites = [
    { type: "cftoken", url: "https://site1.com", key: "key1" },
    { type: "hcaptcha", url: "https://site2.com", key: "key2" },
    { type: "cfcookie", url: "https://site3.com" }
];

solveBatchCaptchas(sites)
    .then(results => console.log('批量处理结果:', results));
```

### 错误重试机制

```javascript
async function solveWithRetry(params, maxRetries = 3) {
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
            
            console.log(`Attempt ${i + 1} failed: ${result.message}`);
        } catch (error) {
            console.log(`Attempt ${i + 1} error: ${error.message}`);
        }
        
        // 等待重试
        if (i < maxRetries - 1) {
            await new Promise(resolve => setTimeout(resolve, 5000));
        }
    }
    
    throw new Error('All retry attempts failed');
}

// 使用示例
solveWithRetry({
    type: "cftoken",
    websiteUrl: "https://example.com",
    websiteKey: "your-site-key"
}, 3).then(result => {
    console.log('成功获取token:', result.token);
}).catch(err => {
    console.error('重试失败:', err);
});
```

## 健康检查

```bash
# 检查服务状态
curl http://localhost:3000/health

# 获取监控数据
curl http://localhost:3000/api/monitor
```

## 限制说明

### 并发限制
- 默认最大并发请求数：100
- 可通过 `MAX_CONCURRENT_REQUESTS` 配置调整

### 超时限制
- 默认请求超时：5分钟 (300秒)
- hCaptcha 解决通常需要 20-60 秒
- 可通过 `TIMEOUT` 配置调整

### 内存限制
- 默认最大内存使用：512MB
- 可通过 `MAX_MEMORY_USAGE` 配置调整
- 自动内存清理机制