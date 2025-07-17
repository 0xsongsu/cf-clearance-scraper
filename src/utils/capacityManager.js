const os = require('os');

class CapacityManager {
    constructor() {
        // 系统信息
        this.systemInfo = this.getSystemInfo();
        this.initializeCapacityLimits();
        
        // 动态调节相关
        this.lastCapacityCheck = Date.now();
        this.performanceHistory = [];
        this.adaptiveThresholds = {
            lowLoad: 0.3,      // CPU使用率低于30%时放宽限制
            mediumLoad: 0.6,   // CPU使用率30-60%时正常限制
            highLoad: 0.8      // CPU使用率高于80%时收紧限制
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
    
    // 计算最优容量限制
    calculateOptimalCapacityLimits() {
        const { cpuCores, totalMemoryGB } = this.systemInfo;
        
        // 基于CPU核心数和内存计算并发请求数
        let optimalConcurrent;
        let optimalContextPool;
        
        if (totalMemoryGB <= 2) {
            // 2GB及以下：保守配置
            optimalConcurrent = Math.max(cpuCores * 3, 10);
            optimalContextPool = Math.max(cpuCores * 2, 8);
        } else if (totalMemoryGB <= 4) {
            // 2-4GB：中等配置
            optimalConcurrent = Math.max(cpuCores * 5, 20);
            optimalContextPool = Math.max(cpuCores * 3, 12);
        } else if (totalMemoryGB <= 8) {
            // 4-8GB：较高配置
            optimalConcurrent = Math.max(cpuCores * 8, 40);
            optimalContextPool = Math.max(cpuCores * 4, 20);
        } else if (totalMemoryGB <= 16) {
            // 8-16GB：高配置
            optimalConcurrent = Math.max(cpuCores * 12, 60);
            optimalContextPool = Math.max(cpuCores * 6, 30);
        } else {
            // 16GB以上：超高配置
            optimalConcurrent = Math.max(cpuCores * 15, 100);
            optimalContextPool = Math.max(cpuCores * 8, 40);
        }
        
        // 应用计算结果
        this.maxConcurrentRequests = Math.min(optimalConcurrent, 200); // 最大200并发
        this.contextPoolSize = Math.min(optimalContextPool, 50); // 最大50个上下文
        
        console.log(`🧠 智能容量管理已启用:`);
        console.log(`   系统配置: ${cpuCores}核CPU, ${totalMemoryGB}GB内存`);
        console.log(`   计算的最优并发: ${this.maxConcurrentRequests}`);
        console.log(`   计算的最优上下文池: ${this.contextPoolSize}`);
        console.log(`   模式: 自动调节`);
        
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
            
            // 根据CPU负载调节
            if (cpuPercent < this.adaptiveThresholds.lowLoad) {
                // CPU负载低，可以增加容量
                this.maxConcurrentRequests = Math.min(
                    Math.floor(originalConcurrent * 1.2), // 最多增加20%
                    200 // 绝对上限
                );
                this.contextPoolSize = Math.min(
                    Math.floor(originalContextPool * 1.2),
                    50
                );
            } else if (cpuPercent > this.adaptiveThresholds.highLoad) {
                // CPU负载高，需要减少容量
                this.maxConcurrentRequests = Math.max(
                    Math.floor(originalConcurrent * 0.8), // 最多减少20%
                    10 // 绝对下限
                );
                this.contextPoolSize = Math.max(
                    Math.floor(originalContextPool * 0.8),
                    5
                );
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
