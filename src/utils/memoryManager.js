const os = require('os');
const logger = require('./logger');

class MemoryManager {
    constructor() {
        // 大幅提高内存阈值，适应高并发场景
        this.maxHeapUsage = Number(process.env.MAX_MEMORY_USAGE) || 4096; // MB - 默认4GB
        this.gcThreshold = 0.6; // 60% - 软GC阈值
        this.forceGcThreshold = 0.8; // 80% - 强制GC阈值
        this.criticalThreshold = 0.95; // 95% - 紧急模式（几乎不触发）
        this.monitoringInterval = 10000; // 10秒 - 减少监控频率降低开销
        this.monitoring = false;

        // 是否启用请求限流（默认关闭，压力测试时不限流）
        this.enableRequestThrottling = process.env.ENABLE_MEMORY_THROTTLE === 'true';

        // CPU监控相关
        this.cpuUsageHistory = [];
        this.maxCpuHistory = 20;
        this.lastSystemCpuTotal = null;
        this.lastSystemCpuIdle = null;

        // 压力状态追踪
        this.pressureLevel = 'normal'; // 'normal', 'moderate', 'high', 'critical'
        this.lastGcTime = 0;
        this.gcCooldown = 5000; // GC冷却时间5秒，避免频繁GC影响性能
        this.consecutiveHighPressure = 0; // 连续高压次数

        // 性能计数器
        this.gcCount = 0;
        this.contextCleanupCount = 0;
    }

    /**
     * 获取当前压力等级
     */
    getPressureLevel() {
        return this.pressureLevel;
    }

    /**
     * 检查是否应该接受新请求（基于压力等级）
     * 默认关闭限流，除非显式启用 ENABLE_MEMORY_THROTTLE=true
     */
    shouldAcceptRequest() {
        // 默认不限流，让请求正常处理
        if (!this.enableRequestThrottling) {
            return { accept: true };
        }

        // 仅在显式启用限流时才执行压力检查
        if (this.pressureLevel === 'critical') {
            return { accept: false, reason: 'System under critical pressure' };
        }
        if (this.pressureLevel === 'high' && Math.random() > 0.7) {
            return { accept: false, reason: 'System under high pressure, request throttled' };
        }
        return { accept: true };
    }

    /**
     * 更新压力等级
     * 使用更宽松的阈值，避免频繁触发压力状态
     */
    updatePressureLevel(heapUsagePercent, cpuUsage) {
        const prevLevel = this.pressureLevel;

        // 更宽松的阈值：只有在极端情况下才升级压力等级
        if (heapUsagePercent > this.criticalThreshold && cpuUsage > 95) {
            // 同时满足内存和CPU极高才进入critical
            this.pressureLevel = 'critical';
            this.consecutiveHighPressure++;
        } else if (heapUsagePercent > this.forceGcThreshold && cpuUsage > 85) {
            this.pressureLevel = 'high';
            this.consecutiveHighPressure++;
        } else if (heapUsagePercent > this.gcThreshold && cpuUsage > 70) {
            this.pressureLevel = 'moderate';
            this.consecutiveHighPressure = 0;
        } else {
            this.pressureLevel = 'normal';
            this.consecutiveHighPressure = 0;
        }

        if (prevLevel !== this.pressureLevel) {
            logger.pressureChanged(prevLevel, this.pressureLevel);
        }

        return this.pressureLevel;
    }

    startMonitoring() {
        if (this.monitoring) return;
        
        this.monitoring = true;
        this.monitorInterval = setInterval(() => {
            this.checkMemoryUsage();
        }, this.monitoringInterval);

        logger.debug('内存', '监控已启动');
    }

    stopMonitoring() {
        if (this.monitorInterval) {
            clearInterval(this.monitorInterval);
            this.monitoring = false;
            logger.debug('内存', '监控已停止');
        }
    }

    checkMemoryUsage() {
        const memUsage = process.memoryUsage();
        const heapUsedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
        const heapTotalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
        const rssMB = Math.round(memUsage.rss / 1024 / 1024);
        const systemFreeMB = Math.round(os.freemem() / 1024 / 1024);
        const systemTotalMB = Math.round(os.totalmem() / 1024 / 1024);

        // 使用配置的最大值来计算使用率
        const maxHeapMB = this.maxHeapUsage;
        const heapUsagePercent = maxHeapMB > 0 ? heapUsedMB / maxHeapMB : 0;

        // 获取CPU使用率
        const cpuStats = this.getCpuUsage();
        const cpuUsage = cpuStats.current || 0;

        // 更新压力等级
        this.updatePressureLevel(heapUsagePercent, cpuUsage);

        // 获取活跃请求数（如果有全局计数器）
        const activeRequests = global.activeRequestCount || 0;
        const browserContexts = global.browserContexts ? global.browserContexts.size : 0;

        // 根据压力等级执行不同策略
        const now = Date.now();
        const canGc = (now - this.lastGcTime) > this.gcCooldown;

        if (this.pressureLevel === 'critical') {
            logger.memoryWarning('critical', heapUsedMB, maxHeapMB, Math.round(heapUsagePercent * 100));
            if (canGc) {
                this.emergencyCleanup();
                this.lastGcTime = now;
            }
        } else if (this.pressureLevel === 'high') {
            logger.memoryWarning('high', heapUsedMB, maxHeapMB, Math.round(heapUsagePercent * 100));
            if (canGc) {
                this.forceGarbageCollection();
                this.cleanupBrowserContexts();
                this.lastGcTime = now;
            }
        } else if (this.pressureLevel === 'moderate') {
            if (canGc) {
                this.softGarbageCollection();
                this.lastGcTime = now;
            }
        }

        // 如果连续高压超过5次，触发紧急清理
        if (this.consecutiveHighPressure >= 5) {
            logger.warn('内存', `连续${this.consecutiveHighPressure}次高压，触发紧急清理`);
            this.emergencyCleanup();
            this.consecutiveHighPressure = 0;
        }

        return {
            heapUsedMB,
            heapTotalMB,
            rssMB,
            systemFreeMB,
            heapUsagePercent,
            pressureLevel: this.pressureLevel,
            cpuUsage,
            browserContexts,
            activeRequests
        };
    }

    /**
     * 紧急清理 - 在系统压力极高时执行
     */
    emergencyCleanup() {
        logger.info('内存', '执行紧急清理...');

        // 1. 强制GC
        this.forceGarbageCollection();

        // 2. 清理所有空闲的浏览器上下文
        this.cleanupBrowserContexts(true); // 强制模式

        // 3. 清理全局缓存
        this.clearGlobalCaches();

        // 4. 延迟再次GC
        setTimeout(() => {
            if (global.gc) {
                try {
                    global.gc();
                    this.gcCount++;
                    logger.gcExecuted('force');
                } catch (e) {}
            }
        }, 500);

        logger.info('内存', '紧急清理完成');
    }

    /**
     * 清理全局缓存
     */
    clearGlobalCaches() {
        // 清理监控数据中的历史记录（保留最少量）
        if (global.monitoringData) {
            if (global.monitoringData.recentTokens && global.monitoringData.recentTokens.length > 10) {
                global.monitoringData.recentTokens = global.monitoringData.recentTokens.slice(0, 10);
            }
            if (global.monitoringData.requestHistory && global.monitoringData.requestHistory.length > 20) {
                global.monitoringData.requestHistory = global.monitoringData.requestHistory.slice(0, 20);
            }
        }
    }

    forceGarbageCollection() {
        if (global.gc) {
            try {
                global.gc();
                this.gcCount++;
                logger.gcExecuted('force');
            } catch (e) {
                logger.error('GC', `执行失败: ${e.message}`);
            }
        }
    }

    softGarbageCollection() {
        // 软GC - 使用setImmediate延迟执行，不阻塞主线程
        if (global.gc) {
            setImmediate(() => {
                try {
                    global.gc();
                    this.gcCount++;
                } catch (e) {}
            });
        }
    }

    /**
     * 清理浏览器上下文
     * @param {boolean} force - 是否强制清理（不考虑是否正在使用）
     */
    cleanupBrowserContexts(force = false) {
        if (!global.browserContexts || global.browserContexts.size === 0) {
            return 0;
        }

        const contextCount = global.browserContexts.size;
        logger.debug('上下文', `开始清理 (当前: ${contextCount}, 强制: ${force})`);

        let cleaned = 0;
        const contextsToClean = Array.from(global.browserContexts);

        // 并行清理上下文
        const cleanupPromises = contextsToClean.map(async (context) => {
            try {
                // 检查上下文是否有活跃页面
                let pages = [];
                try {
                    pages = await context.pages();
                } catch (e) {
                    // 上下文可能已经无效
                }

                // 如果强制模式或没有活跃页面，则清理
                if (force || pages.length === 0) {
                    await context.close().catch(() => {});
                    global.browserContexts.delete(context);
                    cleaned++;
                    this.contextCleanupCount++;
                }
            } catch (e) {
                // 清理出错时直接从集合中移除
                global.browserContexts.delete(context);
            }
        });

        // 不等待所有清理完成（异步执行）
        Promise.all(cleanupPromises).then(() => {
            if (cleaned > 0) {
                logger.contextClosed(global.browserContexts ? global.browserContexts.size : 0);
            }
        });

        return cleaned;
    }

    forceCleanup() {
        logger.info('内存', '执行强制清理...');

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
                    logger.gcExecuted('soft');
                } catch (e) {}
            }, 1000);
        }

        logger.info('内存', '强制清理完成');
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