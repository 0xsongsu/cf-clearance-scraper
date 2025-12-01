/**
 * 全局请求管理器
 * 支持动态并发控制 - 根据系统压力自动调整
 */
const logger = require('./logger');

class GlobalRequestManager {
    constructor(options = {}) {
        // 基础配置
        this.baseProcessingLimit = options.maxProcessingLimit || 100;
        this.maxProcessingLimit = this.baseProcessingLimit;
        this.minProcessingLimit = Math.max(10, Math.floor(this.baseProcessingLimit * 0.2)); // 最低20%
        this.maxWaitingPoolSize = options.maxWaitingPoolSize || 300;
        this.waitingPoolTimeout = options.waitingPoolTimeout || 300000; // 5分钟（减少）

        // 数据结构
        this.processingRequests = new Set();
        this.waitingPool = [];
        this.requestInfo = new Map();

        // 动态调整相关
        this.adjustmentInterval = 10000; // 10秒检查一次
        this.lastAdjustmentTime = Date.now();
        this.recentProcessingTimes = []; // 最近的处理时间
        this.maxRecentSamples = 50;

        // 统计数据
        this.stats = {
            totalProcessed: 0,
            totalQueued: 0,
            totalRejected: 0,
            totalTimeout: 0,
            peakProcessing: 0,
            peakWaiting: 0,
            adjustmentCount: 0
        };

        // 启动动态调整
        this.startDynamicAdjustment();

        logger.info('并发', `全局请求管理器初始化: 基础限制${this.baseProcessingLimit}, 动态范围[${this.minProcessingLimit}-${this.baseProcessingLimit}]`);
    }

    /**
     * 启动动态并发调整
     */
    startDynamicAdjustment() {
        this.adjustmentTimer = setInterval(() => {
            this.adjustConcurrencyLimit();
        }, this.adjustmentInterval);
    }

    /**
     * 根据系统压力动态调整并发限制
     * 使用更宽松的策略，避免频繁降低并发
     */
    adjustConcurrencyLimit() {
        // 获取内存管理器的压力等级
        let pressureLevel = 'normal';
        try {
            const memoryManager = require('./memoryManager');
            pressureLevel = memoryManager.getPressureLevel();
        } catch (e) {}

        const oldLimit = this.maxProcessingLimit;
        let newLimit = this.baseProcessingLimit;

        // 更宽松的调整策略：只在极端情况下降低并发
        switch (pressureLevel) {
            case 'critical':
                newLimit = Math.floor(this.baseProcessingLimit * 0.6); // 降到60%（而非最低）
                break;
            case 'high':
                newLimit = Math.floor(this.baseProcessingLimit * 0.8); // 降到80%
                break;
            case 'moderate':
                newLimit = Math.floor(this.baseProcessingLimit * 0.9); // 降到90%
                break;
            default:
                newLimit = this.baseProcessingLimit; // 100%
        }

        // 确保在合理范围内
        newLimit = Math.max(this.minProcessingLimit, Math.min(this.baseProcessingLimit, newLimit));

        if (newLimit !== oldLimit) {
            this.maxProcessingLimit = newLimit;
            this.stats.adjustmentCount++;
            logger.concurrencyAdjusted(oldLimit, newLimit, `压力等级: ${pressureLevel}`);
        }

        this.lastAdjustmentTime = Date.now();
    }

    /**
     * 记录处理时间（用于性能分析）
     */
    recordProcessingTime(requestId, duration) {
        this.recentProcessingTimes.push(duration);
        if (this.recentProcessingTimes.length > this.maxRecentSamples) {
            this.recentProcessingTimes.shift();
        }
    }

    /**
     * 获取平均处理时间
     */
    getAverageProcessingTime() {
        if (this.recentProcessingTimes.length === 0) return 0;
        return this.recentProcessingTimes.reduce((a, b) => a + b, 0) / this.recentProcessingTimes.length;
    }

    /**
     * 请求处理权限
     * @param {string} requestId - 请求ID
     * @param {Object} requestData - 请求数据 {url, mode, clientIP}
     * @returns {Object} - { allowed: boolean, queued: boolean, position: number, reason: string }
     */
    async requestProcessing(requestId, requestData) {
        // 检查是否可以立即处理
        if (this.processingRequests.size < this.maxProcessingLimit) {
            this.processingRequests.add(requestId);
            this.requestInfo.set(requestId, {
                ...requestData,
                startTime: Date.now(),
                status: 'processing'
            });
            
            this.stats.totalProcessed++;
            this.stats.peakProcessing = Math.max(this.stats.peakProcessing, this.processingRequests.size);

            logger.debug('并发', `立即处理`, { id: requestId, detail: `${this.processingRequests.size}/${this.maxProcessingLimit}` });
            
            return {
                allowed: true,
                queued: false,
                position: 0,
                processingCount: this.processingRequests.size,
                waitingCount: this.waitingPool.length,
                reason: 'Processing immediately'
            };
        }

        // 检查等待池是否已满
        if (this.waitingPool.length >= this.maxWaitingPoolSize) {
            this.stats.totalRejected++;
            logger.rateLimited(requestId, `等待池已满 (${this.waitingPool.length}/${this.maxWaitingPoolSize})`);
            
            return {
                allowed: false,
                queued: false,
                position: -1,
                processingCount: this.processingRequests.size,
                waitingCount: this.waitingPool.length,
                reason: `Waiting pool full (${this.waitingPool.length}/${this.maxWaitingPoolSize})`
            };
        }

        // 加入等待池
        return new Promise((resolve) => {
            const waitingItem = {
                requestId,
                requestData,
                resolve,
                queueTime: Date.now(),
                timeoutId: null
            };

            // 设置等待池超时
            waitingItem.timeoutId = setTimeout(() => {
                this.removeFromWaitingPool(requestId);
                this.stats.totalTimeout++;

                logger.requestTimeout(requestId, this.waitingPoolTimeout);
                
                resolve({
                    allowed: false,
                    queued: true,
                    position: -1,
                    processingCount: this.processingRequests.size,
                    waitingCount: this.waitingPool.length,
                    reason: 'Waiting pool timeout'
                });
            }, this.waitingPoolTimeout);

            this.waitingPool.push(waitingItem);
            this.requestInfo.set(requestId, {
                ...requestData,
                queueTime: Date.now(),
                status: 'waiting'
            });
            
            this.stats.totalQueued++;
            this.stats.peakWaiting = Math.max(this.stats.peakWaiting, this.waitingPool.length);

            const position = this.waitingPool.length;
            logger.requestQueued(requestId, position, '全局');
        });
    }

    /**
     * 释放处理权限，并处理等待池
     * @param {string} requestId - 请求ID
     */
    releaseProcessing(requestId) {
        if (!this.processingRequests.has(requestId)) {
            logger.debug('并发', `尝试释放不存在的请求`, { id: requestId });
            return;
        }

        // 从处理集合中移除
        this.processingRequests.delete(requestId);
        this.requestInfo.delete(requestId);

        logger.debug('并发', `释放请求`, { id: requestId, detail: `处理:${this.processingRequests.size}, 等待:${this.waitingPool.length}` });

        // 处理等待池
        this.processWaitingPool();
    }

    /**
     * 处理等待池，将等待的请求移入处理队列
     */
    processWaitingPool() {
        if (this.waitingPool.length === 0) return;
        if (this.processingRequests.size >= this.maxProcessingLimit) return;

        // 计算可以处理的请求数
        const availableSlots = this.maxProcessingLimit - this.processingRequests.size;
        const toProcess = Math.min(availableSlots, this.waitingPool.length);

        for (let i = 0; i < toProcess; i++) {
            const waitingItem = this.waitingPool.shift();
            if (!waitingItem) break;

            // 清除超时定时器
            if (waitingItem.timeoutId) {
                clearTimeout(waitingItem.timeoutId);
            }

            // 添加到处理集合
            this.processingRequests.add(waitingItem.requestId);
            this.requestInfo.set(waitingItem.requestId, {
                ...waitingItem.requestData,
                startTime: Date.now(),
                waitTime: Date.now() - waitingItem.queueTime,
                status: 'processing'
            });
            
            this.stats.totalProcessed++;

            // 通知请求可以继续处理
            const waitTime = Date.now() - waitingItem.queueTime;
            waitingItem.resolve({
                allowed: true,
                queued: true,
                position: 0,
                processingCount: this.processingRequests.size,
                waitingCount: this.waitingPool.length,
                waitTime: waitTime,
                reason: 'Released from waiting pool'
            });

            logger.requestDequeued(waitingItem.requestId, waitTime, '全局');
        }
    }

    /**
     * 从等待池中移除请求
     * @param {string} requestId - 请求ID
     */
    removeFromWaitingPool(requestId) {
        const index = this.waitingPool.findIndex(item => item.requestId === requestId);
        if (index !== -1) {
            const removed = this.waitingPool.splice(index, 1)[0];
            if (removed.timeoutId) {
                clearTimeout(removed.timeoutId);
            }
            this.requestInfo.delete(requestId);
            logger.debug('并发', `从等待池移除`, { id: requestId });
        }
    }

    /**
     * 获取当前状态
     */
    getStatus() {
        return {
            processing: {
                count: this.processingRequests.size,
                limit: this.maxProcessingLimit,
                available: this.maxProcessingLimit - this.processingRequests.size
            },
            waiting: {
                count: this.waitingPool.length,
                limit: this.maxWaitingPoolSize,
                available: this.maxWaitingPoolSize - this.waitingPool.length
            },
            stats: this.stats
        };
    }

    /**
     * 获取详细统计信息
     */
    getDetailedStats() {
        const status = this.getStatus();
        
        // 获取等待时间统计
        const waitingTimes = this.waitingPool.map(item => Date.now() - item.queueTime);
        const avgWaitingTime = waitingTimes.length > 0 ? 
            waitingTimes.reduce((sum, time) => sum + time, 0) / waitingTimes.length : 0;
        
        // 获取处理时间统计
        const processingTimes = [];
        for (const [requestId, info] of this.requestInfo.entries()) {
            if (info.status === 'processing' && info.startTime) {
                processingTimes.push(Date.now() - info.startTime);
            }
        }
        const avgProcessingTime = processingTimes.length > 0 ? 
            processingTimes.reduce((sum, time) => sum + time, 0) / processingTimes.length : 0;

        return {
            ...status,
            timing: {
                avgWaitingTime: Math.round(avgWaitingTime),
                avgProcessingTime: Math.round(avgProcessingTime),
                maxWaitingTime: waitingTimes.length > 0 ? Math.max(...waitingTimes) : 0
            },
            requests: {
                processingList: Array.from(this.processingRequests),
                waitingList: this.waitingPool.map(item => ({
                    requestId: item.requestId,
                    waitTime: Date.now() - item.queueTime,
                    url: item.requestData.url,
                    clientIP: item.requestData.clientIP
                }))
            }
        };
    }

    /**
     * 清理过期的等待请求
     */
    cleanup() {
        const now = Date.now();
        let removedCount = 0;
        
        // 清理超时的等待请求
        for (let i = this.waitingPool.length - 1; i >= 0; i--) {
            const item = this.waitingPool[i];
            if (now - item.queueTime > this.waitingPoolTimeout) {
                this.waitingPool.splice(i, 1);
                if (item.timeoutId) {
                    clearTimeout(item.timeoutId);
                }
                this.requestInfo.delete(item.requestId);
                removedCount++;
            }
        }
        
        if (removedCount > 0) {
            logger.debug('并发', `清理了 ${removedCount} 个过期等待请求`);
        }
    }

    /**
     * 重置所有数据
     */
    reset() {
        // 清除所有超时定时器
        for (const item of this.waitingPool) {
            if (item.timeoutId) {
                clearTimeout(item.timeoutId);
            }
        }

        this.processingRequests.clear();
        this.waitingPool.length = 0;
        this.requestInfo.clear();
        this.recentProcessingTimes = [];

        // 重置并发限制到基础值
        this.maxProcessingLimit = this.baseProcessingLimit;

        this.stats = {
            totalProcessed: 0,
            totalQueued: 0,
            totalRejected: 0,
            totalTimeout: 0,
            peakProcessing: 0,
            peakWaiting: 0,
            adjustmentCount: 0
        };

        logger.info('并发', '全局请求管理器已重置');
    }

    /**
     * 销毁管理器
     */
    destroy() {
        if (this.adjustmentTimer) {
            clearInterval(this.adjustmentTimer);
            this.adjustmentTimer = null;
        }
        this.reset();
    }

    /**
     * 获取当前动态限制信息
     */
    getDynamicLimitInfo() {
        return {
            baseLimit: this.baseProcessingLimit,
            currentLimit: this.maxProcessingLimit,
            minLimit: this.minProcessingLimit,
            utilizationPercent: Math.round((this.processingRequests.size / this.maxProcessingLimit) * 100),
            avgProcessingTime: Math.round(this.getAverageProcessingTime()),
            adjustmentCount: this.stats.adjustmentCount
        };
    }
}

// 创建单例实例
const globalRequestManager = new GlobalRequestManager({
    maxProcessingLimit: Number(process.env.MAX_PROCESSING_LIMIT) || 100,
    maxWaitingPoolSize: Number(process.env.MAX_WAITING_POOL_SIZE) || 300,
    waitingPoolTimeout: Number(process.env.WAITING_POOL_TIMEOUT) || 300000
});

module.exports = globalRequestManager;