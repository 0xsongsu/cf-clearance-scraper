# CF Clearance Scraper 配置指南

CF Clearance Scraper 支持智能配置管理，大部分情况下无需手动配置即可获得最佳性能。

## 🚀 零配置启动

系统支持零配置启动，会自动检测系统资源并设置最优参数：

```bash
# 直接启动，使用智能配置
npm start

# 或使用 Docker
docker run -p 3000:3000 cf-clearance-scraper
```

## ⚙️ 基础配置

如需自定义配置，可在根目录创建 `.env` 文件：

```bash
# 服务端口
PORT=3000

# 认证令牌 (可选，用于API访问控制)
AUTH_TOKEN=your_secret_token

# 请求超时时间 (毫秒，默认120秒)
TIMEOUT=120000
```

## 🧠 智能管理系统

### 智能内存管理

系统会根据可用内存自动设置最优限制：

```bash
# 手动设置内存限制 (MB) - 不推荐，会禁用智能管理
# MAX_MEMORY_USAGE=2048

# 智能管理会根据系统内存自动计算：
# - 1GB及以下：使用30%系统内存
# - 1-2GB：使用35%系统内存
# - 2-4GB：使用40%系统内存
# - 4-8GB：使用45%系统内存
# - 8-16GB：使用50%系统内存
# - 16-32GB：使用50%系统内存（最多16GB）
# - 32GB以上：使用40%系统内存（最多20GB）
```

### 智能容量管理

系统会根据CPU核心数和内存自动设置并发数和上下文池大小：

```bash
# 手动设置并发数 - 不推荐，会禁用智能管理
# MAX_CONCURRENT_REQUESTS=60
# CONTEXT_POOL_SIZE=20

# 智能管理会根据系统配置自动计算：
# - 2GB及以下：CPU核心数×3并发，×2上下文池
# - 2-4GB：CPU核心数×5并发，×3上下文池
# - 4-8GB：CPU核心数×8并发，×4上下文池
# - 8-16GB：CPU核心数×12并发，×6上下文池
# - 16GB以上：CPU核心数×15并发，×8上下文池
```

## 🔧 高级配置

### 浏览器配置

```bash
# 浏览器设置
HEADLESS=true                    # 无头模式
VIEWPORT_WIDTH=1920             # 视窗宽度
VIEWPORT_HEIGHT=1080            # 视窗高度
BROWSER_CONNECT_TIMEOUT=120000  # 浏览器连接超时

# 跳过浏览器启动 (用于测试)
SKIP_LAUNCH=false
```

### 监控配置

```bash
# 监控数据保留
MAX_REQUEST_HISTORY=100         # 请求历史记录数量
MEMORY_CLEANUP_INTERVAL=180000  # 内存清理间隔 (3分钟)

# 自动重启配置
AUTO_RESTART_IDLE_HOURS=6       # 空闲6小时后自动重启
```

### 日志配置

```bash
# 日志级别
NODE_ENV=production             # 生产环境
LOG_LEVEL=INFO                  # 日志级别
VERBOSE_ERRORS=false            # 详细错误信息
```

## 📋 配置模板

### 开发环境
```bash
# .env 文件
PORT=3000
NODE_ENV=development
LOG_LEVEL=INFO
VERBOSE_ERRORS=true
TIMEOUT=120000
```

### 生产环境 (推荐使用智能管理)
```bash
# .env 文件
PORT=3000
NODE_ENV=production
LOG_LEVEL=WARN
AUTH_TOKEN=your_secure_token_here
TIMEOUT=120000
```

### 手动配置模式 (不推荐)
```bash
# .env 文件 - 禁用智能管理
PORT=3000
MAX_MEMORY_USAGE=2048
MAX_CONCURRENT_REQUESTS=60
CONTEXT_POOL_SIZE=20
TIMEOUT=120000
```

## 📊 监控和管理

### Web 监控界面

访问 `http://localhost:3000/monitor` 查看：
- 实时服务状态
- 内存使用情况
- 请求统计
- 性能指标
- 上下文池状态

### API 监控端点

```bash
# 基础监控信息
curl http://localhost:3000/api/monitor

# 详细性能数据
curl http://localhost:3000/api/performance

# 健康检查
curl http://localhost:3000/health

# 服务重启
curl -X POST http://localhost:3000/api/service/restart
```

## 🔒 安全配置

### 认证设置

```bash
# 设置API认证令牌
AUTH_TOKEN=your_secure_random_token

# 使用认证的请求示例
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "type": "cftoken",
    "websiteUrl": "https://example.com",
    "websiteKey": "your-key",
    "authToken": "your_secure_random_token"
  }'
```

### 生产环境安全建议

1. **设置强认证令牌**：使用随机生成的长令牌
2. **限制网络访问**：仅允许必要的IP访问
3. **使用HTTPS代理**：在生产环境中使用反向代理
4. **监控日志**：定期检查访问日志
5. **定期更新**：保持服务和依赖项最新

## 💡 最佳实践

### 性能优化建议

1. **使用智能管理**：删除手动配置，让系统自动优化
2. **监控资源使用**：定期检查内存和CPU使用率
3. **合理设置超时**：根据网络环境调整TIMEOUT值
4. **定期重启**：利用自动重启功能保持系统健康

### 故障排除

1. **检查系统资源**：确保有足够的内存和CPU
2. **查看监控数据**：通过Web界面或API检查状态
3. **检查日志输出**：查看控制台输出的错误信息
4. **重启服务**：使用API重启或手动重启

## 🔗 相关链接

- [API 文档](API.md) - 完整的接口使用说明
- [性能优化](PERFORMANCE_OPTIMIZATION.md) - 详细的性能优化指南
- [故障排除](TROUBLESHOOTING.md) - 常见问题解决方案