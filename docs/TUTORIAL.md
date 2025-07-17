# CF Clearance Scraper 使用教程

本教程将指导您如何使用 CF Clearance Scraper 绕过 Cloudflare 保护，获取 Turnstile 令牌和 cf_clearance Cookie。

## 🎯 快速开始

### 1. 启动服务

```bash
# 方式一：直接启动（推荐）
npm start

# 方式二：使用一键启动脚本
# Mac: 双击 start-mac.command
# Windows: 双击 start-windows.bat

# 方式三：Docker 启动
docker-compose up -d
```

### 2. 验证服务

```bash
# 健康检查
curl http://localhost:3000/health
# 响应: healthy

# 查看监控面板
open http://localhost:3000/monitor
```

## 🔐 Cloudflare Turnstile 令牌生成

### 基础用法

Turnstile 是 Cloudflare 的新一代验证系统，用于替代传统的验证码。

```javascript
// JavaScript 示例
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
    console.log('✅ 成功获取 Turnstile 令牌:', result.token);
    // 使用 token 进行后续操作
} else {
    console.error('❌ 获取失败:', result.message);
}
```

```python
# Python 示例
import requests

response = requests.post('http://localhost:3000/', json={
    "type": "cftoken",
    "websiteUrl": "https://turnstile.zeroclover.io/",
    "websiteKey": "0x4AAAAAAAEwzhD6pyKkgXC0"
})

result = response.json()
if result['code'] == 200:
    print(f"✅ 成功获取 Turnstile 令牌: {result['token']}")
else:
    print(f"❌ 获取失败: {result['message']}")
```

```bash
# cURL 示例
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "type": "cftoken",
    "websiteUrl": "https://turnstile.zeroclover.io/",
    "websiteKey": "0x4AAAAAAAEwzhD6pyKkgXC0"
  }'
```

### 如何找到 websiteKey

1. **查看网页源码**：搜索 `data-sitekey` 或 `sitekey`
2. **开发者工具**：在 Network 标签中查找 Turnstile 相关请求
3. **常见位置**：通常在表单或验证组件中

```html
<!-- 示例：在 HTML 中查找 -->
<div class="cf-turnstile" data-sitekey="0x4AAAAAAAEwzhD6pyKkgXC0"></div>
```

## 🍪 cf_clearance Cookie 获取

### 基础用法

cf_clearance Cookie 用于绕过 Cloudflare 的"正在检查您的浏览器"页面。

```javascript
// JavaScript 示例
const response = await fetch('http://localhost:3000/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        type: "cfcookie",
        websiteUrl: "https://loyalty.campnetwork.xyz/home"
    })
});

const result = await response.json();
if (result.code === 200) {
    console.log('✅ 成功获取 cf_clearance:', result.cf_clearance);
    console.log('✅ 完整请求头:', result.headers);
    console.log('✅ 所有 Cookies:', result.cookies);
    
    // 使用获取的信息访问网站
    const siteResponse = await fetch(result.url, {
        headers: {
            ...result.headers,
            'Cookie': result.cookies.map(c => `${c.name}=${c.value}`).join('; ')
        }
    });
    
    console.log('网站访问状态:', siteResponse.status);
} else {
    console.error('❌ 获取失败:', result.message);
}
```

```python
# Python 示例
import requests

# 获取 cf_clearance
response = requests.post('http://localhost:3000/', json={
    "type": "cfcookie",
    "websiteUrl": "https://loyalty.campnetwork.xyz/home"
})

result = response.json()
if result['code'] == 200:
    print(f"✅ 成功获取 cf_clearance: {result['cf_clearance'][:50]}...")
    
    # 使用获取的信息访问网站
    headers = result['headers']
    cookies = {cookie['name']: cookie['value'] for cookie in result['cookies']}
    
    site_response = requests.get(result['url'], headers=headers, cookies=cookies)
    print(f"网站访问状态: {site_response.status_code}")
    print(f"响应长度: {len(site_response.text)} 字符")
else:
    print(f"❌ 获取失败: {result['message']}")
```

### 响应数据结构

cfcookie 请求返回完整的浏览器环境信息：

```json
{
  "code": 200,
  "cf_clearance": "E6bpu3iHjpzZYCGB5EBrmRbeBNDOKRRxP8wbTMA9ojU-175274...",
  "headers": {
    "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7)...",
    "Accept": "text/html,application/xhtml+xml,application/xml...",
    "Accept-Language": "en-US,en;q=0.9",
    "Accept-Encoding": "gzip, deflate, br",
    "DNT": "1",
    "Connection": "keep-alive",
    "Upgrade-Insecure-Requests": "1",
    "Sec-Fetch-Dest": "document",
    "Sec-Fetch-Mode": "navigate",
    "Sec-Fetch-Site": "none",
    "Sec-Fetch-User": "?1",
    "Cache-Control": "max-age=0"
  },
  "cookies": [
    {
      "name": "cf_clearance",
      "value": "E6bpu3iHjpzZYCGB5EBrmRbeBNDOKRRxP8wbTMA9ojU-175274...",
      "domain": ".campnetwork.xyz",
      "path": "/",
      "expires": 1737187680.931,
      "httpOnly": true,
      "secure": true,
      "sameSite": "None"
    }
  ],
  "url": "https://loyalty.campnetwork.xyz/home",
  "timestamp": "2025-07-17T09:28:00.931Z"
}
```

## 🔧 高级功能

### 使用代理

```javascript
// 通过代理发送请求
const response = await fetch('http://localhost:3000/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        type: "cfcookie",
        websiteUrl: "https://example.com",
        proxy: {
            host: "proxy.example.com",
            port: 8080,
            username: "user",  // 可选
            password: "pass"   // 可选
        }
    })
});
```

### 认证访问

如果服务设置了认证令牌：

```javascript
const response = await fetch('http://localhost:3000/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        type: "cftoken",
        websiteUrl: "https://example.com",
        websiteKey: "your-site-key",
        authToken: "your-auth-token"
    })
});
```

## 📊 监控和调试

### Web 监控界面

访问 `http://localhost:3000/monitor` 查看：
- 实时服务状态
- 请求统计
- 性能指标
- 内存使用情况

### API 监控

```bash
# 获取基础监控信息
curl http://localhost:3000/api/monitor

# 获取详细性能数据
curl http://localhost:3000/api/performance

# 健康检查
curl http://localhost:3000/health
```

### 调试技巧

1. **查看详细日志**：
   ```bash
   NODE_ENV=development npm start
   ```

2. **监控请求过程**：
   ```bash
   # 实时监控
   ./scripts/performance_monitor.sh --watch
   ```

3. **检查服务状态**：
   ```bash
   curl -s http://localhost:3000/api/monitor | python3 -m json.tool
   ```

## 💡 最佳实践

### 1. 错误处理

```javascript
async function getCfToken(websiteUrl, websiteKey) {
    try {
        const response = await fetch('http://localhost:3000/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: "cftoken",
                websiteUrl,
                websiteKey
            })
        });
        
        const result = await response.json();
        
        if (result.code === 200) {
            return result.token;
        } else {
            throw new Error(`获取令牌失败: ${result.message}`);
        }
    } catch (error) {
        console.error('请求失败:', error.message);
        throw error;
    }
}
```

### 2. 重试机制

```javascript
async function getCfTokenWithRetry(websiteUrl, websiteKey, maxRetries = 3) {
    for (let i = 0; i < maxRetries; i++) {
        try {
            return await getCfToken(websiteUrl, websiteKey);
        } catch (error) {
            console.log(`尝试 ${i + 1}/${maxRetries} 失败:`, error.message);
            if (i === maxRetries - 1) throw error;
            
            // 等待后重试
            await new Promise(resolve => setTimeout(resolve, 2000));
        }
    }
}
```

### 3. 超时处理

```javascript
async function getCfTokenWithTimeout(websiteUrl, websiteKey, timeout = 60000) {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);
    
    try {
        const response = await fetch('http://localhost:3000/', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                type: "cftoken",
                websiteUrl,
                websiteKey
            }),
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        return await response.json();
    } catch (error) {
        clearTimeout(timeoutId);
        if (error.name === 'AbortError') {
            throw new Error('请求超时');
        }
        throw error;
    }
}
```

## 🔗 相关链接

- [API 文档](API.md) - 完整的接口参考
- [配置指南](CONFIGURATION.md) - 服务配置和优化
- [故障排除](TROUBLESHOOTING.md) - 常见问题解决
- [性能优化](PERFORMANCE_OPTIMIZATION.md) - 性能调优指南
