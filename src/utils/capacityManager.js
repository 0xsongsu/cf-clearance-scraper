const os = require('os');

class CapacityManager {
    constructor() {
        // 系统信息
        this.systemInfo = this.getSystemInfo();
        this.initializeCapacityLimits();
        
        // 动态调节相关 - 极致性能版本
        this.lastCapacityCheck = Date.now();
        this.performanceHistory = [];
        this.adaptiveThresholds = {
            lowLoad: 0.6,      // CPU使用率低于60%时继续增加负载
            mediumLoad: 0.8,   // CPU使用率60-80%时正常限制
            highLoad: 0.95     // CPU使用率高于95%时才收紧限制（接近极限）
        };
        
        // 性能监控
        this.performanceMetrics = {
            avgResponseTime: 0,
            successRate: 100,
            queueWaitTime: 0,
            contextCreationTime: 0
        };
    }
    
    // 获取系统信息
    getSystemInfo() {
        const cpus = os.cpus();
        const totalMemoryGB = Math.round(os.totalmem() / 1024 / 1024 / 1024);
        
        return {
            cpuCores: cpus.length,
            cpuModel: cpus[0].model,
            totalMemoryGB,
            totalMemoryMB: Math.round(os.totalmem() / 1024 / 1024),
            platform: os.platform(),
            arch: os.arch()
        };
    }
    
    // 初始化容量限制 - 智能计算
    initializeCapacityLimits() {
        const manualConcurrent = Number(process.env.MAX_CONCURRENT_REQUESTS);
        const manualContextPool = Number(process.env.CONTEXT_POOL_SIZE);
        
        if (manualConcurrent && manualConcurrent > 0 && manualContextPool && manualContextPool > 0) {
            // 用户手动设置了限制
            this.maxConcurrentRequests = manualConcurrent;
            this.contextPoolSize = manualContextPool;
            this.capacityManagementMode = 'manual';
            console.log(`📊 容量管理模式: 手动设置`);
            console.log(`   并发请求: ${this.maxConcurrentRequests}`);
            console.log(`   上下文池: ${this.contextPoolSize}`);
        } else {
            // 智能计算容量限制
            this.capacityManagementMode = 'auto';
            this.calculateOptimalCapacityLimits();
        }
    }
    
    // 计算最优容量限制 - 极致性能压榨版本
    calculateOptimalCapacityLimits() {
        const { cpuCores, totalMemoryGB } = this.systemInfo;

        console.log(`🔥 极致性能模式：完全压榨机器性能`);
        console.log(`   检测到: ${cpuCores}核CPU, ${totalMemoryGB}GB内存`);

        // 极致性能计算：专用机器，无保留
        let optimalConcurrent;
        let optimalContextPool;

        if (totalMemoryGB <= 2) {
            // 2GB及以下：激进配置
            optimalConcurrent = Math.max(cpuCores * 8, 30);   // 8倍CPU核心数
            optimalContextPool = Math.max(cpuCores * 5, 20);  // 5倍CPU核心数
        } else if (totalMemoryGB <= 4) {
            // 2-4GB：高激进配置
            optimalConcurrent = Math.max(cpuCores * 15, 60);  // 15倍CPU核心数
            optimalContextPool = Math.max(cpuCores * 8, 30);  // 8倍CPU核心数
        } else if (totalMemoryGB <= 8) {
            // 4-8GB：超激进配置
            optimalConcurrent = Math.max(cpuCores * 25, 120); // 25倍CPU核心数
            optimalContextPool = Math.max(cpuCores * 12, 50); // 12倍CPU核心数
        } else if (totalMemoryGB <= 16) {
            // 8-16GB：极致配置
            optimalConcurrent = Math.max(cpuCores * 35, 200); // 35倍CPU核心数
            optimalContextPool = Math.max(cpuCores * 15, 80); // 15倍CPU核心数
        } else if (totalMemoryGB <= 32) {
            // 16-32GB：疯狂配置
            optimalConcurrent = Math.max(cpuCores * 50, 300); // 50倍CPU核心数
            optimalContextPool = Math.max(cpuCores * 20, 120); // 20倍CPU核心数
        } else {
            // 32GB以上：无限制配置
            optimalConcurrent = Math.max(cpuCores * 80, 500); // 80倍CPU核心数
            optimalContextPool = Math.max(cpuCores * 30, 200); // 30倍CPU核心数
        }

        // 应用计算结果 - 移除人为限制，让系统自然达到极限
        this.maxConcurrentRequests = optimalConcurrent; // 移除200的限制
        this.contextPoolSize = optimalContextPool;      // 移除50的限制
        
        console.log(`🔥 极致性能容量管理已启用:`);
        console.log(`   系统配置: ${cpuCores}核CPU, ${totalMemoryGB}GB内存`);
        console.log(`   🚀 极致并发数: ${this.maxConcurrentRequests} (${Math.round(this.maxConcurrentRequests/cpuCores)}x CPU核心)`);
        console.log(`   🚀 极致上下文池: ${this.contextPoolSize} (${Math.round(this.contextPoolSize/cpuCores)}x CPU核心)`);
        console.log(`   ⚡ 模式: 极致性能压榨 - 专用机器优化`);
        console.log(`   ⚠️  警告: 此模式将最大化使用系统资源`);
        
        // 更新全局变量
        global.maxConcurrentRequests = this.maxConcurrentRequests;
        if (global.contextPool) {
            global.contextPool.maxSize = this.contextPoolSize;
        }
    }
    
    // 获取CPU使用率
    async getCpuUsage() {
        return new Promise((resolve) => {
            const startMeasure = this.cpuAverage();
            
            setTimeout(() => {
                const endMeasure = this.cpuAverage();
                const idleDifference = endMeasure.idle - startMeasure.idle;
                const totalDifference = endMeasure.total - startMeasure.total;
                const percentageCPU = 100 - ~~(100 * idleDifference / totalDifference);
                resolve(Math.max(0, Math.min(100, percentageCPU)));
            }, 1000);
        });
    }
    
    // CPU平均值计算辅助函数
    cpuAverage() {
        const cpus = os.cpus();
        let totalIdle = 0;
        let totalTick = 0;
        
        cpus.forEach((cpu) => {
            for (let type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });
        
        return {
            idle: totalIdle / cpus.length,
            total: totalTick / cpus.length
        };
    }
    
    // 动态调节容量限制
    async adjustCapacityBasedOnLoad() {
        if (this.capacityManagementMode !== 'auto') {
            return;
        }
        
        const now = Date.now();
        
        // 每60秒检查一次
        if (now - this.lastCapacityCheck < 60000) {
            return;
        }
        
        this.lastCapacityCheck = now;
        
        try {
            const cpuUsage = await this.getCpuUsage();
            const cpuPercent = cpuUsage / 100;
            
            const originalConcurrent = this.maxConcurrentRequests;
            const originalContextPool = this.contextPoolSize;
            
            // 根据CPU负载调节 - 极致性能版本
            if (cpuPercent < this.adaptiveThresholds.lowLoad) {
                // CPU负载低，激进增加容量
                this.maxConcurrentRequests = Math.floor(originalConcurrent * 1.5); // 增加50%
                this.contextPoolSize = Math.floor(originalContextPool * 1.5);
                console.log(`🚀 CPU负载低(${Math.round(cpuPercent * 100)}%)，激进增加容量50%`);
            } else if (cpuPercent > this.adaptiveThresholds.highLoad) {
                // CPU负载极高，轻微减少容量（仍然激进）
                this.maxConcurrentRequests = Math.max(
                    Math.floor(originalConcurrent * 0.9), // 只减少10%
                    Math.floor(this.systemInfo.cpuCores * 5) // 最低保持5倍CPU核心数
                );
                this.contextPoolSize = Math.max(
                    Math.floor(originalContextPool * 0.9),
                    Math.floor(this.systemInfo.cpuCores * 3) // 最低保持3倍CPU核心数
                );
                console.log(`⚠️  CPU负载极高(${Math.round(cpuPercent * 100)}%)，轻微减少容量10%`);
            } else if (cpuPercent < this.adaptiveThresholds.mediumLoad) {
                // 中等负载，继续小幅增加
                this.maxConcurrentRequests = Math.floor(originalConcurrent * 1.1); // 增加10%
                this.contextPoolSize = Math.floor(originalContextPool * 1.1);
                console.log(`📈 CPU负载中等(${Math.round(cpuPercent * 100)}%)，继续增加容量10%`);
            }
            
            // 更新全局变量
            if (this.maxConcurrentRequests !== originalConcurrent || this.contextPoolSize !== originalContextPool) {
                global.maxConcurrentRequests = this.maxConcurrentRequests;
                if (global.contextPool) {
                    global.contextPool.maxSize = this.contextPoolSize;
                }
                
                console.log(`🔄 动态调节容量限制:`);
                console.log(`   CPU使用率: ${Math.round(cpuPercent * 100)}%`);
                console.log(`   并发请求: ${originalConcurrent} → ${this.maxConcurrentRequests}`);
                console.log(`   上下文池: ${originalContextPool} → ${this.contextPoolSize}`);
            }
            
            // 记录性能历史
            this.performanceHistory.push({
                timestamp: now,
                cpuUsage: cpuPercent,
                concurrentRequests: this.maxConcurrentRequests,
                contextPoolSize: this.contextPoolSize,
                activeRequests: global.monitoringData ? global.monitoringData.activeRequests.size : 0
            });
            
            // 保持最近20次记录
            if (this.performanceHistory.length > 20) {
                this.performanceHistory.shift();
            }
            
        } catch (error) {
            console.error('动态容量调节失败:', error.message);
        }
    }
    
    // 获取负载等级
    getLoadLevel(cpuPercent) {
        if (cpuPercent < this.adaptiveThresholds.lowLoad) {
            return '低负载';
        } else if (cpuPercent < this.adaptiveThresholds.mediumLoad) {
            return '中等负载';
        } else if (cpuPercent < this.adaptiveThresholds.highLoad) {
            return '高负载';
        } else {
            return '极高负载';
        }
    }
    
    // 获取容量状态
    getCapacityStatus() {
        return {
            mode: this.capacityManagementMode,
            systemInfo: this.systemInfo,
            limits: {
                maxConcurrentRequests: this.maxConcurrentRequests,
                contextPoolSize: this.contextPoolSize
            },
            current: {
                activeRequests: global.monitoringData ? global.monitoringData.activeRequests.size : 0,
                contextPoolUsed: global.contextPool ? global.contextPool.used : 0,
                contextPoolAvailable: global.contextPool ? global.contextPool.available.length : 0
            },
            performanceHistory: this.performanceHistory.slice(-10),
            metrics: this.performanceMetrics
        };
    }
    
    // 启动容量监控
    startMonitoring() {
        console.log('🚀 启动智能容量监控...');
        
        // 每分钟检查一次容量调节
        this.monitorInterval = setInterval(() => {
            this.adjustCapacityBasedOnLoad();
        }, 60000);
        
        console.log('✅ 智能容量监控已启动');
    }
    
    // 停止容量监控
    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            console.log('⏹️ 智能容量监控已停止');
        }
    }
}

module.exports = new CapacityManager();
