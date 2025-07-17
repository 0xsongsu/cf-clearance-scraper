#!/bin/bash

# CF Clearance Scraper 性能监控脚本
# 实时显示智能内存管理和容量管理的状态

echo "🚀 CF Clearance Scraper 性能监控"
echo "=================================="
echo ""

# 检查服务是否运行
if ! curl -s http://localhost:3000/health > /dev/null; then
    echo "❌ 服务未运行，请先启动服务"
    exit 1
fi

echo "✅ 服务运行正常"
echo ""

# 获取系统信息
echo "📊 系统信息:"
curl -s http://localhost:3000/api/performance | python3 -c "
import sys, json
data = json.load(sys.stdin)
capacity = data['capacity']
memory = data['memory']

print(f\"   CPU: {capacity['systemInfo']['cpuCores']}核 {capacity['systemInfo']['cpuModel'][:50]}...\")
print(f\"   内存: {capacity['systemInfo']['totalMemoryGB']}GB ({capacity['systemInfo']['totalMemoryMB']}MB)\")
print(f\"   平台: {capacity['systemInfo']['platform']} {capacity['systemInfo']['arch']}\")
"

echo ""

# 智能管理状态
echo "🧠 智能管理状态:"
curl -s http://localhost:3000/api/performance | python3 -c "
import sys, json
data = json.load(sys.stdin)
capacity = data['capacity']
memory = data['memory']

print(f\"   内存管理: {memory['management']['mode']} - 当前限制 {memory['management']['currentLimitMB']}MB\")
print(f\"   容量管理: {capacity['mode']} - 并发 {capacity['limits']['maxConcurrentRequests']}, 上下文池 {capacity['limits']['contextPoolSize']}\")
print(f\"   内存压力: {memory['management']['pressureLevel']}\")
"

echo ""

# 当前状态
echo "📈 当前状态:"
curl -s http://localhost:3000/api/monitor | python3 -c "
import sys, json
data = json.load(sys.stdin)

print(f\"   服务状态: {data['status']}\")
print(f\"   运行时间: {data['uptime']['hours']}小时 {data['uptime']['minutes']}分钟\")
print(f\"   活跃请求: {len(data.get('activeRequests', []))}\")
print(f\"   请求统计: 总计{data['requests']['total']} / 成功{data['requests']['successful']} / 失败{data['requests']['failed']}\")
print(f\"   成功率: {data['requests']['successRate']}\")
"

echo ""

# 性能指标
echo "⚡ 性能指标:"
curl -s http://localhost:3000/api/performance | python3 -c "
import sys, json
data = json.load(sys.stdin)
pool = data['contextPool']
memory = data['memory']

print(f\"   上下文池: 可用{pool['available']} / 使用{pool['used']} / 总计{pool['total']} / 最大{pool['maxSize']}\")
print(f\"   复用率: {pool['performance']['reuseRate']}%\")
print(f\"   平均创建时间: {round(pool['performance']['avgCreationTime'])}ms\")
print(f\"   内存使用: {memory['process']['heapUsed']} / {memory['system']['total']}MB系统内存\")
print(f\"   CPU使用: {memory['cpu']['current']}% (平均 {memory['cpu']['average']}%)\")
"

echo ""

# 实时监控模式
if [ "$1" = "--watch" ] || [ "$1" = "-w" ]; then
    echo "🔄 进入实时监控模式 (按 Ctrl+C 退出)"
    echo "=================================="
    
    while true; do
        sleep 5
        clear
        echo "🚀 CF Clearance Scraper 实时性能监控 - $(date '+%Y-%m-%d %H:%M:%S')"
        echo "================================================================"
        echo ""
        
        # 快速状态
        curl -s http://localhost:3000/api/monitor | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    print(f\"📊 快速状态: {data['status']} | 活跃请求: {len(data.get('activeRequests', []))} | 成功率: {data['requests']['successRate']}\")
except:
    print('❌ 无法获取监控数据')
"
        
        # 内存和容量状态
        curl -s http://localhost:3000/api/performance | python3 -c "
import sys, json
try:
    data = json.load(sys.stdin)
    memory = data['memory']
    capacity = data['capacity']
    pool = data['contextPool']
    
    print(f\"🧠 内存: {memory['management']['mode']} {memory['management']['currentLimitMB']}MB | 压力: {memory['management']['pressureLevel']}\")
    print(f\"⚡ 容量: {capacity['mode']} 并发{capacity['limits']['maxConcurrentRequests']} 池{capacity['limits']['contextPoolSize']}\")
    print(f\"🔄 上下文: 可用{pool['available']} 使用{pool['used']} 复用率{pool['performance']['reuseRate']}%\")
    print(f\"💾 系统内存: {memory['system']['used']}MB/{memory['system']['total']}MB ({round(memory['system']['used']/memory['system']['total']*100)}%)\")
    
    if memory['cpu']['current'] > 0:
        print(f\"🖥️  CPU: {memory['cpu']['current']}% (平均 {memory['cpu']['average']}%)\")
    
except Exception as e:
    print(f'❌ 无法获取性能数据: {e}')
"
        
        echo ""
        echo "按 Ctrl+C 退出实时监控"
    done
fi

echo "✅ 监控完成"
echo ""
echo "💡 提示:"
echo "   - 使用 '$0 --watch' 进入实时监控模式"
echo "   - 访问 http://localhost:3000/monitor 查看Web监控界面"
echo "   - 访问 http://localhost:3000/api/performance 获取详细性能数据"
