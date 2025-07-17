# CF Clearance Scraper API 文档

专业的 Cloudflare 保护绕过 API，支持 Turnstile 令牌生成和 cf_clearance Cookie 获取。

## 🚀 快速开始

**基础端点**: `POST http://localhost:3000/`

**支持的服务类型**:
- `cftoken` - Cloudflare Turnstile 令牌生成
- `cf5s` - 绕过 Cloudflare 5秒盾，获取 cf_clearance Cookie 和完整请求头

> **📝 向后兼容性**: 旧的 `cfcookie` 类型仍然支持，会自动映射到 `cf5s` 功能

**标准响应格式**: 
```json
{
  "code": 200,
  "message": "success", 
  "token": "xxx"  // 或其他数据字段
}
```

## 🔐 Cloudflare 功能

### 1. Turnstile 令牌生成

自动解决 Cloudflare Turnstile 验证并生成令牌：

**请求示例**:
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
    console.log('✅ Turnstile token:', result.token);
    // 使用 token 进行表单提交
} else {
    console.error('❌ Error:', result.message);
}
```

**响应格式**:
```json
{
  "code": 200,
  "message": "Turnstile solved successfully",
  "token": "0.Af8GoLvQGCd3-S8CSCdNJg4R1vLZLNhXvOkiV..."
}
```

### 2. Cloudflare 5秒盾绕过 (cf5s)

绕过 Cloudflare 5秒盾保护页面，获取完整的浏览器环境信息：

**请求示例**:
```javascript
const response = await fetch('http://localhost:3000/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        type: "cf5s",
        websiteUrl: "https://loyalty.campnetwork.xyz/home"
    })
});

const result = await response.json();
if (result.code === 200) {
    console.log('✅ cf_clearance:', result.cf_clearance);
    console.log('✅ Headers:', result.headers);
    console.log('✅ All cookies:', result.cookies);
    
    // 使用完整信息访问网站
    const siteResponse = await fetch(result.url, {
        headers: {
            ...result.headers,
            'Cookie': result.cookies.map(c => `${c.name}=${c.value}`).join('; ')
        }
    });
} else {
    console.error('❌ Error:', result.message);
}
```

**响应格式**:
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

## 📊 监控和管理 API

### 1. 服务状态监控

获取服务的实时状态信息：

**请求**: `GET /api/monitor`

**响应示例**:
```json
{
  "status": "running",
  "uptime": {
    "hours": 2,
    "minutes": 45,
    "seconds": 30
  },
  "requests": {
    "total": 120,
    "successful": 118,
    "failed": 2,
    "successRate": "98.33%"
  },
  "memory": {
    "used": "256 MB",
    "max": "3686 MB",
    "percent": "6.94%",
    "management": {
      "mode": "auto",
      "pressureLevel": "低压力",
      "maxHeapUsage": 3686
    }
  },
  "performance": {
    "contextPool": {
      "available": 8,
      "used": 2,
      "total": 10,
      "maxSize": 50,
      "performance": {
        "totalCreated": 15,
        "totalReused": 105,
        "totalRecycled": 5,
        "reuseRate": 87
      }
    },
    "capacity": {
      "mode": "auto",
      "systemInfo": {
        "cpuCores": 11,
        "totalMemoryGB": 18
      },
      "limits": {
        "maxConcurrentRequests": 165,
        "contextPoolSize": 50
      }
    }
  }
}
```

### 2. 性能详情

获取详细的性能统计信息：

**请求**: `GET /api/performance`

**响应包含**:
- 内存使用详情
- CPU使用率
- 上下文池状态
- 容量管理配置
- 请求统计
- 性能历史数据

### 3. 服务管理

#### 重启服务

**请求**: `POST /api/service/restart`

**响应示例**:
```json
{
  "success": true,
  "message": "Service restarted successfully"
}
```

#### 健康检查

**请求**: `GET /health`

**响应**: `healthy`

## 🔧 高级功能

### 代理支持

所有API都支持通过代理发送请求，支持多种代理格式：

#### 1. 对象格式（推荐）

```javascript
const response = await fetch('http://localhost:3000/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        type: "cf5s",
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

#### 2. URL格式（新增支持）

```javascript
// 支持多种URL格式
const proxyFormats = [
    "http://username:password@proxy.example.com:8080",
    "https://user:pass@secure-proxy.com:8443",
    "socks5://user:pass@socks.proxy.com:1080",
    "http://proxy.example.com:8080",  // 无认证
    "proxy.example.com:8080",         // 简化格式
    "username:password@proxy.example.com:8080"
];

const response = await fetch('http://localhost:3000/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        type: "cf5s",
        websiteUrl: "https://example.com",
        proxy: "http://username:password@proxy.example.com:8080"
    })
});
```

#### 3. URL编码支持

代理URL支持URL编码的用户名和密码：

```javascript
// 特殊字符会自动解码
const response = await fetch('http://localhost:3000/', {
    method: 'POST',
    headers: {
        'Content-Type': 'application/json'
    },
    body: JSON.stringify({
        type: "cf5s",
        websiteUrl: "https://example.com",
        proxy: "http://user%40domain.com:pass%23123@proxy.example.com:8080"
        // 解码后: user@domain.com:pass#123
    })
});
```

### 认证支持

如果服务设置了认证令牌，需要在请求中包含：

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

## 📈 性能特性

### 智能内存管理
- 自动检测系统内存并设置最优限制
- 根据内存压力动态调节
- 支持手动配置覆盖

### 智能容量管理
- 根据CPU核心数和内存自动计算并发数
- 根据CPU负载动态调节
- 智能上下文池复用

### 实时监控
- Web监控界面：`http://localhost:3000/monitor`
- 性能统计API
- 请求历史追踪

## 🚨 错误处理

### 常见错误码

| 错误码 | 说明 | 解决方案 |
|--------|------|----------|
| 400 | 请求参数错误 | 检查必需参数 |
| 401 | 认证失败 | 检查authToken |
| 429 | 请求过多 | 降低请求频率 |
| 500 | 服务器错误 | 查看服务日志 |
| 503 | 服务不可用 | 等待服务恢复 |

### 错误响应格式

```json
{
  "code": 400,
  "message": "websiteUrl is required",
  "token": null
}
```

## 💡 最佳实践

1. **合理设置超时时间**：cf5s请求可能需要60-120秒
2. **处理失败重试**：网络问题可能导致偶发失败
3. **监控服务状态**：定期检查`/api/monitor`端点
4. **使用完整cookie信息**：cf5s返回的所有cookies都可能有用
5. **保持User-Agent一致**：使用返回的headers中的User-Agent

## 🔗 相关链接

- [配置指南](CONFIGURATION.md)
- [性能优化](PERFORMANCE_OPTIMIZATION.md)
- [故障排除](TROUBLESHOOTING.md)
- [Web监控界面](http://localhost:3000/monitor)
