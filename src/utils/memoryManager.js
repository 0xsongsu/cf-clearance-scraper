const os = require('os');

class MemoryManager {
    constructor() {
        // 智能内存管理 - 根据系统内存自动调节
        this.systemTotalMemoryMB = Math.round(os.totalmem() / 1024 / 1024);
        this.initializeMemoryLimits();

        this.gcThreshold = 0.85; // 85% of max heap - 极致内存使用
        this.forceGcThreshold = 0.95; // 95% of max heap - 接近极限才强制GC
        this.monitoringInterval = 10000; // 10 seconds - 更频繁的监控
        this.monitoring = false;

        // CPU监控相关 - 系统级监控
        this.cpuUsageHistory = [];
        this.maxCpuHistory = 20;
        this.lastSystemCpuTotal = null;
        this.lastSystemCpuIdle = null;

        // 动态调节相关 - 极致性能版本
        this.lastMemoryCheck = Date.now();
        this.memoryPressureHistory = [];
        this.adaptiveThresholds = {
            lowMemory: 0.7,    // 系统内存使用率低于70%时继续增加
            mediumMemory: 0.85, // 系统内存使用率70-85%时正常限制
            highMemory: 0.95   // 系统内存使用率高于95%时才严格限制
        };
    }

    // 初始化内存限制 - 智能计算
    initializeMemoryLimits() {
        const manualLimit = Number(process.env.maxMemoryUsage) || Number(process.env.MAX_MEMORY_USAGE);

        if (manualLimit && manualLimit > 0) {
            // 用户手动设置了限制，使用用户设置
            this.maxHeapUsage = manualLimit;
            this.memoryManagementMode = 'manual';
            console.log(`📊 内存管理模式: 手动设置 (${this.maxHeapUsage}MB)`);
        } else {
            // 智能计算内存限制
            this.memoryManagementMode = 'auto';
            this.calculateOptimalMemoryLimit();
        }
    }

    // 计算最优内存限制 - 极致性能压榨版本
    calculateOptimalMemoryLimit() {
        const totalMemoryMB = this.systemTotalMemoryMB;
        let optimalLimit;

        console.log(`🔥 极致内存管理：专用机器，最大化内存使用`);
        console.log(`   系统总内存: ${Math.round(totalMemoryMB / 1024 * 100) / 100}GB`);

        if (totalMemoryMB <= 1024) {
            // 1GB及以下：使用70%（激进）
            optimalLimit = Math.floor(totalMemoryMB * 0.7);
        } else if (totalMemoryMB <= 2048) {
            // 1-2GB：使用75%（激进）
            optimalLimit = Math.floor(totalMemoryMB * 0.75);
        } else if (totalMemoryMB <= 4096) {
            // 2-4GB：使用80%（激进）
            optimalLimit = Math.floor(totalMemoryMB * 0.8);
        } else if (totalMemoryMB <= 8192) {
            // 4-8GB：使用85%（激进）
            optimalLimit = Math.floor(totalMemoryMB * 0.85);
        } else if (totalMemoryMB <= 16384) {
            // 8-16GB：使用85%（激进）
            optimalLimit = Math.floor(totalMemoryMB * 0.85);
        } else if (totalMemoryMB <= 32768) {
            // 16-32GB：使用80%（移除16GB限制）
            optimalLimit = Math.floor(totalMemoryMB * 0.8);
        } else {
            // 32GB以上：使用75%（移除20GB限制）
            optimalLimit = Math.floor(totalMemoryMB * 0.75);
        }

        // 确保最小限制为256MB
        this.maxHeapUsage = Math.max(optimalLimit, 256);

        console.log(`🔥 极致内存管理已启用:`);
        console.log(`   系统总内存: ${totalMemoryMB}MB (${Math.round(totalMemoryMB / 1024 * 100) / 100}GB)`);
        console.log(`   🚀 极致内存限制: ${this.maxHeapUsage}MB (${Math.round(this.maxHeapUsage / totalMemoryMB * 100)}%)`);
        console.log(`   ⚡ 模式: 极致性能压榨 - 专用机器优化`);
        console.log(`   ⚠️  警告: 此模式将最大化使用系统内存`);
    }

    startMonitoring() {
        if (this.monitoring) return;
        
        this.monitoring = true;
        this.monitorInterval = setInterval(() => {
            this.checkMemoryUsage();
        }, this.monitoringInterval);

        console.log('Memory monitoring started');
    }

    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitoring = false;
            console.log('Memory monitoring stopped');
        }
    }

    checkMemoryUsage() {
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
        const rssMB = Math.round(memUsage.rss / 1024 / 1024);
        const systemFreeMB = Math.round(os.freemem() / 1024 / 1024);
        const systemTotalMB = this.systemTotalMemoryMB;

        // 计算系统内存使用率
        const systemUsedMB = systemTotalMB - systemFreeMB;
        const systemUsagePercent = systemUsedMB / systemTotalMB;

        // 动态调节内存限制（仅在自动模式下）
        if (this.memoryManagementMode === 'auto') {
            this.adjustMemoryLimitsBasedOnSystemPressure(systemUsagePercent);
        }

        // 使用当前的最大值来计算使用率
        const maxHeapMB = this.maxHeapUsage;
        const heapUsagePercent = maxHeapMB > 0 ? heapUsedMB / maxHeapMB : 0;

        // 记录内存压力历史
        this.memoryPressureHistory.push({
            timestamp: Date.now(),
            heapUsagePercent,
            systemUsagePercent,
            heapUsedMB,
            systemUsedMB
        });

        // 保持最近20次记录
        if (this.memoryPressureHistory.length > 20) {
            this.memoryPressureHistory.shift();
        }

        // 智能日志记录 - 根据内存压力调整日志级别
        const shouldLog = this.shouldLogMemoryUsage(heapUsagePercent, systemUsagePercent);
        if (shouldLog) {
            const pressureLevel = this.getMemoryPressureLevel(systemUsagePercent);
            console.log(`📊 内存监控 [${pressureLevel}]: 进程 ${heapUsedMB}MB/${maxHeapMB}MB (${Math.round(heapUsagePercent * 100)}%)`);
            console.log(`   系统: ${systemUsedMB}MB/${systemTotalMB}MB (${Math.round(systemUsagePercent * 100)}%), RSS: ${rssMB}MB`);

            if (this.memoryManagementMode === 'auto') {
                console.log(`   自动调节: 当前限制 ${maxHeapMB}MB`);
            }
        }

        // 执行垃圾回收 - 使用动态阈值
        const dynamicGcThreshold = this.getDynamicGcThreshold(systemUsagePercent);
        const dynamicForceGcThreshold = this.getDynamicForceGcThreshold(systemUsagePercent);

        if (heapUsagePercent > dynamicForceGcThreshold) {
            this.forceGarbageCollection();
            this.cleanupBrowserContexts();
        } else if (heapUsagePercent > dynamicGcThreshold) {
            this.softGarbageCollection();
        }

        return {
            heapUsedMB,
            heapTotalMB,
            rssMB,
            systemFreeMB,
            systemUsedMB,
            systemTotalMB,
            heapUsagePercent,
            systemUsagePercent,
            maxHeapMB,
            memoryManagementMode: this.memoryManagementMode,
            pressureLevel: this.getMemoryPressureLevel(systemUsagePercent)
        };
    }

    // 根据系统内存压力动态调节内存限制
    adjustMemoryLimitsBasedOnSystemPressure(systemUsagePercent) {
        const now = Date.now();

        // 每30秒检查一次是否需要调节
        if (now - this.lastMemoryCheck < 30000) {
            return;
        }

        this.lastMemoryCheck = now;
        const originalLimit = this.maxHeapUsage;

        if (systemUsagePercent < this.adaptiveThresholds.lowMemory) {
            // 系统内存压力低，激进增加限制
            const newLimit = Math.floor(this.systemTotalMemoryMB * 0.9); // 最多使用90%系统内存
            this.maxHeapUsage = Math.max(newLimit, Math.floor(originalLimit * 1.5)); // 最多增加50%
            console.log(`🚀 内存压力低(${Math.round(systemUsagePercent * 100)}%)，激进增加内存限制到${this.maxHeapUsage}MB`);

        } else if (systemUsagePercent > this.adaptiveThresholds.highMemory) {
            // 系统内存压力高，需要收紧限制
            const newLimit = Math.max(
                Math.floor(this.systemTotalMemoryMB * 0.2), // 最少使用20%系统内存
                originalLimit * 0.8 // 最多减少20%
            );
            this.maxHeapUsage = Math.min(newLimit, originalLimit);
        }

        if (this.maxHeapUsage !== originalLimit) {
            console.log(`🔄 动态调节内存限制: ${originalLimit}MB → ${this.maxHeapUsage}MB (系统使用率: ${Math.round(systemUsagePercent * 100)}%)`);
        }
    }

    // 获取内存压力等级
    getMemoryPressureLevel(systemUsagePercent) {
        if (systemUsagePercent < this.adaptiveThresholds.lowMemory) {
            return '低压力';
        } else if (systemUsagePercent < this.adaptiveThresholds.mediumMemory) {
            return '中等压力';
        } else if (systemUsagePercent < this.adaptiveThresholds.highMemory) {
            return '高压力';
        } else {
            return '极高压力';
        }
    }

    // 智能决定是否记录日志
    shouldLogMemoryUsage(heapUsagePercent, systemUsagePercent) {
        // 高内存使用时总是记录
        if (heapUsagePercent > 0.7 || systemUsagePercent > 0.8) {
            return true;
        }

        // 每5分钟记录一次正常状态
        const lastLog = this.memoryPressureHistory.slice(-1)[0];
        if (!lastLog || Date.now() - lastLog.timestamp > 300000) {
            return true;
        }

        return false;
    }

    // 获取动态GC阈值
    getDynamicGcThreshold(systemUsagePercent) {
        if (systemUsagePercent > this.adaptiveThresholds.highMemory) {
            return 0.5; // 系统内存紧张时更积极的GC
        } else if (systemUsagePercent > this.adaptiveThresholds.mediumMemory) {
            return 0.6; // 正常GC阈值
        } else {
            return 0.7; // 系统内存充足时放宽GC
        }
    }

    // 获取动态强制GC阈值
    getDynamicForceGcThreshold(systemUsagePercent) {
        if (systemUsagePercent > this.adaptiveThresholds.highMemory) {
            return 0.7; // 系统内存紧张时更积极的强制GC
        } else if (systemUsagePercent > this.adaptiveThresholds.mediumMemory) {
            return 0.8; // 正常强制GC阈值
        } else {
            return 0.85; // 系统内存充足时放宽强制GC
        }
    }

    forceGarbageCollection() {
        console.log('🔄 Forcing garbage collection due to high memory usage');
        if (global.gc) {
            try {
                global.gc();
                console.log('✅ Forced GC completed');
            } catch (e) {
                console.error('❌ Failed to force GC:', e.message);
            }
        } else {
            console.warn('⚠️  global.gc() not available. Start with --expose-gc flag');
        }
    }

    softGarbageCollection() {
        // 在高并发情况下，更积极的GC策略
        if (global.gc && Math.random() < 0.5) { // 50% chance
            setImmediate(() => {
                try {
                    global.gc();
                } catch (e) {}
            });
        }
    }

    cleanupBrowserContexts() {
        if (global.browserContexts && global.browserContexts.size > 0) {
            console.log(`🧹 Cleaning up ${global.browserContexts.size} browser contexts`);
            
            const contextsToClean = Array.from(global.browserContexts);
            let cleaned = 0;
            
            contextsToClean.forEach(async (context) => {
                try {
                    await context.close().catch(() => {});
                    global.browserContexts.delete(context);
                    cleaned++;
                } catch (e) {
                    console.error('Error closing context:', e.message);
                }
            });
            
            if (cleaned > 0) {
                console.log(`✅ Cleaned up ${cleaned} browser contexts`);
            }
        }
    }

    forceCleanup() {
        console.log('🔧 执行强制内存清理...');
        
        // 强制垃圾回收
        this.forceGarbageCollection();
        
        // 清理浏览器上下文
        this.cleanupBrowserContexts();
        
        // 额外的清理步骤
        if (global.gc) {
            // 多次调用GC确保彻底清理
            setTimeout(() => {
                try {
                    global.gc();
                    console.log('✅ 延迟GC完成');
                } catch (e) {}
            }, 1000);
        }
        
        console.log('✅ 强制内存清理完成');
    }

    getCpuUsage() {
        const cpus = os.cpus();
        const numCpus = cpus.length;
        
        // 获取系统CPU使用率
        let totalIdle = 0;
        let totalTick = 0;
        
        cpus.forEach((cpu) => {
            for (let type in cpu.times) {
                totalTick += cpu.times[type];
            }
            totalIdle += cpu.times.idle;
        });
        
        const idle = totalIdle / numCpus;
        const total = totalTick / numCpus;
        
        // 计算当前时刻的系统CPU使用率
        if (this.lastSystemCpuTotal && this.lastSystemCpuIdle) {
            const totalDiff = total - this.lastSystemCpuTotal;
            const idleDiff = idle - this.lastSystemCpuIdle;
            const cpuPercent = 100 - ~~(100 * idleDiff / totalDiff);
            
            // 更新历史记录
            this.cpuUsageHistory.push(cpuPercent);
            if (this.cpuUsageHistory.length > this.maxCpuHistory) {
                this.cpuUsageHistory.shift();
            }
            
            // 更新上次记录
            this.lastSystemCpuTotal = total;
            this.lastSystemCpuIdle = idle;
            
            // 计算平均CPU使用率
            const avgCpuUsage = this.cpuUsageHistory.length > 0 
                ? this.cpuUsageHistory.reduce((sum, val) => sum + val, 0) / this.cpuUsageHistory.length
                : 0;
            
            return {
                current: Math.min(Math.max(cpuPercent, 0), 100),
                average: Math.min(Math.max(avgCpuUsage, 0), 100),
                history: this.cpuUsageHistory.slice(-10)
            };
        } else {
            // 首次调用，初始化基准值
            this.lastSystemCpuTotal = total;
            this.lastSystemCpuIdle = idle;
            
            return {
                current: 0,
                average: 0,
                history: []
            };
        }
    }

    getMemoryStats() {
        const memUsage = process.memoryUsage();
        const systemMem = {
            free: os.freemem(),
            total: os.totalmem()
        };

        const cpuStats = this.getCpuUsage();

        // 计算更准确的内存使用情况
        // 在 macOS/Linux 中，可用内存应该包括缓存和缓冲区
        const actualUsed = this.getActualMemoryUsage();
        const usedMemoryMB = actualUsed ? Math.round(actualUsed / 1024 / 1024) : 
                           Math.round((systemMem.total - systemMem.free) / 1024 / 1024);

        // 计算堆内存使用率
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
        const heapUsagePercent = heapTotalMB > 0 ? (heapUsedMB / heapTotalMB) * 100 : 0;

        return {
            process: {
                heapUsed: `${heapUsedMB}MB`,
                heapTotal: heapTotalMB,
                heapUsagePercent: Math.round(heapUsagePercent * 10) / 10, // 保留一位小数
                rss: `${Math.round(memUsage.rss / 1024 / 1024)}MB`,
                external: Math.round(memUsage.external / 1024 / 1024)
            },
            system: {
                free: Math.round(systemMem.free / 1024 / 1024),
                total: Math.round(systemMem.total / 1024 / 1024),
                used: usedMemoryMB,
                // 添加实际可用内存（包括可回收的缓存）
                available: Math.round(systemMem.total / 1024 / 1024) - usedMemoryMB
            },
            cpu: cpuStats,
            browserContexts: global.browserContexts ? global.browserContexts.size : 0,
            activeBrowsers: global.browserLength || 0
        };
    }

    // 获取更准确的内存使用情况
    getActualMemoryUsage() {
        const platform = process.platform;
        
        if (platform === 'darwin') {
            // macOS: 使用 vm_stat 获取内存压力信息
            try {
                const { execSync } = require('child_process');
                const vmstat = execSync('vm_stat', { encoding: 'utf8' });
                
                // 从vm_stat输出中提取页面大小
                let pageSize = 16384; // 默认值，可能是16KB或4KB
                if (vmstat.includes('page size of ')) {
                    const match = vmstat.match(/page size of (\d+) bytes/);
                    if (match) {
                        pageSize = parseInt(match[1]);
                    }
                }
                
                const lines = vmstat.split('\n');
                let activePages = 0;
                let wiredPages = 0;
                let compressedPages = 0;
                let freePages = 0;
                let speculativePages = 0;
                
                for (const line of lines) {
                    const trimmedLine = line.trim();
                    if (trimmedLine.includes('Pages free:')) {
                        freePages = parseInt(trimmedLine.split(':')[1].trim().replace('.', ''));
                    } else if (trimmedLine.includes('Pages active:')) {
                        activePages = parseInt(trimmedLine.split(':')[1].trim().replace('.', ''));
                    } else if (trimmedLine.includes('Pages wired down:')) {
                        wiredPages = parseInt(trimmedLine.split(':')[1].trim().replace('.', ''));
                    } else if (trimmedLine.includes('Pages occupied by compressor:')) {
                        compressedPages = parseInt(trimmedLine.split(':')[1].trim().replace('.', ''));
                    } else if (trimmedLine.includes('Pages speculative:')) {
                        speculativePages = parseInt(trimmedLine.split(':')[1].trim().replace('.', ''));
                    }
                }
                
                // 计算内存压力：类似Activity Monitor的内存压力算法
                // App内存 = active + wired + compressed
                // 不包括free和speculative（这些是可用的）
                const memoryPressurePages = activePages + wiredPages + compressedPages;
                return memoryPressurePages * pageSize;
            } catch (error) {
                // 如果获取失败，返回 null 使用默认计算
                return null;
            }
        } else if (platform === 'linux') {
            // Linux: 尝试读取 /proc/meminfo
            try {
                const fs = require('fs');
                const meminfo = fs.readFileSync('/proc/meminfo', 'utf8');
                const lines = meminfo.split('\n');
                
                let memTotal = 0;
                let memAvailable = 0;
                
                for (const line of lines) {
                    if (line.startsWith('MemTotal:')) {
                        memTotal = parseInt(line.split(/\s+/)[1]) * 1024; // 转换为字节
                    } else if (line.startsWith('MemAvailable:')) {
                        memAvailable = parseInt(line.split(/\s+/)[1]) * 1024; // 转换为字节
                    }
                }
                
                if (memTotal && memAvailable) {
                    return memTotal - memAvailable;
                }
            } catch (error) {
                // 如果获取失败，返回 null 使用默认计算
                return null;
            }
        }
        
        // 其他平台或获取失败时返回 null
        return null;
    }
}

module.exports = new MemoryManager();