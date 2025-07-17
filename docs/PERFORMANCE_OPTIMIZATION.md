# 性能优化指南

## 🚀 智能内存管理

### 自动内存限制调节

系统现在支持根据系统内存自动调节内存限制，无需手动设置：

```bash
# 删除或注释掉手动内存限制
# MAX_MEMORY_USAGE=512

# 系统将自动计算最优内存限制：
# - 1GB及以下：使用30%系统内存
# - 1-2GB：使用35%系统内存
# - 2-4GB：使用40%系统内存
# - 4-8GB：使用45%系统内存
# - 8-16GB：使用50%系统内存
# - 16-32GB：使用50%系统内存（最多16GB）
# - 32GB以上：使用40%系统内存（最多20GB）
```

### 内存压力自适应

系统会根据内存压力动态调节：

- **低压力** (<50%系统内存)：放宽限制，提升性能
- **中等压力** (50-70%系统内存)：正常限制
- **高压力** (70-85%系统内存)：收紧限制
- **极高压力** (>85%系统内存)：严格限制，积极GC

## 🔧 智能容量管理

### 自动容量调节

系统现在支持根据宿主机性能自动调节容量限制，无需手动设置：

```bash
# 删除或注释掉手动容量限制，启用智能管理
# MAX_CONCURRENT_REQUESTS=60
# CONTEXT_POOL_SIZE=20

# 系统将根据CPU核心数和内存自动计算：
# - 2GB及以下：CPU核心数×3并发，×2上下文池
# - 2-4GB：CPU核心数×5并发，×3上下文池
# - 4-8GB：CPU核心数×8并发，×4上下文池
# - 8-16GB：CPU核心数×12并发，×6上下文池
# - 16GB以上：CPU核心数×15并发，×8上下文池
```

### 负载自适应调节

系统会根据CPU负载动态调节容量：

- **低负载** (<30% CPU)：增加容量，提升吞吐量
- **中等负载** (30-60% CPU)：保持正常容量
- **高负载** (60-80% CPU)：正常容量
- **极高负载** (>80% CPU)：减少容量，保证稳定性

### 智能上下文复用

- **智能选择策略**：优先选择使用次数少且创建时间适中的上下文
- **性能监控**：跟踪创建时间、使用次数、复用率
- **自动回收**：基于使用次数(150次)和年龄(2小时)自动回收

### 手动配置（可选）

如果需要手动控制，可以设置：

```bash
# 手动设置并发和上下文池
MAX_CONCURRENT_REQUESTS=60
CONTEXT_POOL_SIZE=20

# 系统将使用手动设置，不进行自动调节
```

## 📊 性能监控

### 监控端点

```bash
# 基础监控
curl http://localhost:3000/api/monitor

# 详细性能数据
curl http://localhost:3000/api/performance

# 浏览器状态
curl http://localhost:3000/browser-status
```

### 关键指标

1. **内存管理模式**：auto(自动) vs manual(手动)
2. **内存压力等级**：低压力/中等压力/高压力/极高压力
3. **上下文复用率**：越高越好，目标>80%
4. **平均上下文创建时间**：越低越好，目标<500ms

## ⚡ 性能优化建议

### 1. 系统级优化

```bash
# 启用垃圾回收暴露
node --expose-gc start.js

# 增加Node.js内存限制（仅在必要时）
node --max-old-space-size=2048 start.js

# 优化系统内存
# Linux: 调整swappiness
echo 10 > /proc/sys/vm/swappiness

# 清理系统缓存
sync && echo 3 > /proc/sys/vm/drop_caches
```

### 2. 应用级优化

```bash
# 启用智能内存管理（默认已启用）
# 删除 MAX_MEMORY_USAGE 环境变量让系统自动计算

# 调整监控频率
MEMORY_CLEANUP_INTERVAL=180000  # 3分钟

# 优化超时设置
TIMEOUT=120000  # 2分钟

# 自动重启设置
AUTO_RESTART_IDLE_HOURS=6  # 6小时无请求后重启
```

### 3. 容器化优化

```dockerfile
# Docker优化
FROM node:18-alpine

# 设置内存限制
ENV NODE_OPTIONS="--max-old-space-size=1024 --expose-gc"

# 优化容器资源
--memory=2g --cpus=1.5
```

## 🔍 故障排除

### 内存问题

```bash
# 检查内存管理模式
curl -s http://localhost:3000/api/performance | jq '.memory.management'

# 查看内存压力历史
curl -s http://localhost:3000/api/performance | jq '.memory.pressureHistory'

# 强制内存清理
curl -X POST http://localhost:3000/api/service/restart
```

### 性能问题

```bash
# 检查上下文池状态
curl -s http://localhost:3000/api/performance | jq '.contextPool'

# 查看复用率
curl -s http://localhost:3000/api/performance | jq '.contextPool.performance.reuseRate'

# 监控创建时间
curl -s http://localhost:3000/api/performance | jq '.contextPool.performance.avgCreationTime'
```

## 📈 性能基准

### 目标指标

- **内存使用率**: <80%配置限制
- **上下文复用率**: >80%
- **平均响应时间**: <5秒
- **成功率**: >95%
- **系统内存压力**: 保持在"中等压力"以下

### 监控脚本

```bash
#!/bin/bash
# performance_monitor.sh

while true; do
    echo "=== $(date) ==="
    
    # 内存状态
    echo "内存管理:"
    curl -s http://localhost:3000/api/performance | jq -r '.memory.management | "模式: \(.mode), 压力: \(.pressureLevel), 限制: \(.currentLimitMB)MB"'
    
    # 上下文池状态  
    echo "上下文池:"
    curl -s http://localhost:3000/api/performance | jq -r '.contextPool | "可用: \(.available), 使用: \(.used), 复用率: \(.performance.reuseRate)%"'
    
    # 请求状态
    echo "请求状态:"
    curl -s http://localhost:3000/api/performance | jq -r '.requests | "活跃: \(.active), 成功率: \(.successRate)"'
    
    echo ""
    sleep 60
done
```

## 🎯 最佳实践

1. **让系统自动管理内存**：删除手动内存限制，使用智能管理
2. **监控关键指标**：定期检查复用率和内存压力
3. **合理设置并发**：根据服务器配置调整并发数
4. **定期重启**：利用自动重启功能保持系统健康
5. **容器化部署**：使用Docker限制资源使用

通过这些优化，系统性能将显著提升，内存使用更加高效，响应时间更短。
