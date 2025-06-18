# CF Clearance Scraper Docker 部署指南

本文档提供了使用 Docker 部署和使用 CF Clearance Scraper 的详细说明。

## 目录

- [快速开始](#快速开始)
- [Docker 部署](#docker-部署)
- [配置说明](#配置说明)
- [功能使用](#功能使用)
- [监控面板](#监控面板)
- [常见问题](#常见问题)

## 快速开始

### 使用 Docker Compose 启动服务

1. 确保已安装 Docker 和 Docker Compose
2. 在项目根目录下运行：

```bash
docker-compose up -d
```

服务将在后台启动，默认端口为 3030。

### 验证服务状态

访问监控面板确认服务是否正常运行：
```bash
http://localhost:3030/monitor
```

## Docker 部署

### 环境要求

- Docker 20.10.0+
- Docker Compose 2.0.0+
- 至少 2GB 可用内存
- 支持的操作系统：Linux、macOS、Windows

### 目录结构

```
.
├── Dockerfile          # Docker 镜像构建文件
├── docker-compose.yml  # Docker Compose 配置文件
├── src/               # 源代码目录
└── ...
```

### 自定义配置

可以通过修改 `docker-compose.yml` 文件来自定义配置：

```yaml
services:
  cf-clearance-scraper:
    environment:
      - PORT=3030               # 服务端口
      - browserLimit=25         # 最大并发浏览器数
      - timeOut=60000          # 请求超时时间(毫秒)
      - memoryCleanupInterval=300000  # 内存清理间隔
      - maxMemoryUsage=512     # 最大内存使用(MB)
```

## 功能使用

### 1. 获取页面源码

获取受 Cloudflare WAF 保护的网站页面源码：

```bash
curl -X POST http://localhost:3030/cf-clearance-scraper \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "mode": "source"
  }'
```

### 2. 生成 Turnstile 令牌（轻量级）

```bash
curl -X POST http://localhost:3030/cf-clearance-scraper \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://turnstile.zeroclover.io/",
    "siteKey": "0x4AAAAAAAEwzhD6pyKkgXC0",
    "mode": "turnstile-min"
  }'
```

### 3. 生成 Turnstile 令牌（完整页面）

```bash
curl -X POST http://localhost:3030/cf-clearance-scraper \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://turnstile.zeroclover.io/",
    "mode": "turnstile-max"
  }'
```

### 4. 创建 WAF 会话

```bash
curl -X POST http://localhost:3030/cf-clearance-scraper \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://nopecha.com/demo/cloudflare",
    "mode": "waf-session"
  }'
```

### 5. 使用代理

所有请求都支持配置代理：

```bash
curl -X POST http://localhost:3030/cf-clearance-scraper \
  -H "Content-Type: application/json" \
  -d '{
    "url": "https://example.com",
    "mode": "source",
    "proxy": {
      "host": "127.0.0.1",
      "port": 8080,
      "username": "user",
      "password": "pass"
    }
  }'
```

## 监控面板

### 访问监控页面

监控面板提供了服务的实时状态信息：
```
http://localhost:3030/monitor
```

### 监控内容

- 服务状态总览
- 实时性能图表
- 请求统计
- 内存使用情况
- 活跃请求列表

### 监控 API

获取监控数据：
```bash
curl http://localhost:3030/api/monitor
```

重置监控统计：
```bash
curl -X POST http://localhost:3030/api/monitor/reset
```

## 常见问题

### 1. 服务无法启动

检查以下几点：
- Docker 服务是否正常运行
- 端口 3030 是否被占用
- 系统内存是否充足

### 2. 请求超时

可能的解决方案：
- 增加 `timeOut` 参数值
- 检查网络连接
- 使用代理服务器

### 3. 内存使用过高

建议措施：
- 减少 `browserLimit` 值
- 增加 `memoryCleanupInterval` 频率
- 调整 `maxMemoryUsage` 限制

### 4. 代理配置无效

确认：
- 代理服务器是否正常运行
- 代理服务器是否支持 HTTPS
- 代理配置格式是否正确

## 注意事项

1. **安全性**：
   - 建议在生产环境中启用 API 认证
   - 避免将服务暴露在公网
   - 定期更新 Docker 镜像

2. **性能优化**：
   - 根据实际需求调整并发数
   - 合理设置内存清理间隔
   - 监控系统资源使用情况

3. **最佳实践**：
   - 使用负载均衡处理大量请求
   - 实施请求重试机制
   - 定期清理未使用的容器和镜像
