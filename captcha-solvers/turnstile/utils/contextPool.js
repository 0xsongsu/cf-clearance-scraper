/**
 * Turnstile 专用上下文池
 * 预创建并复用浏览器上下文，减少内存和延迟开销
 *
 * 特点：
 * - 仅用于 Turnstile token 获取（使用 fakePage，不依赖真实页面状态）
 * - 不适用于 cf5s/cookies（需要真实 cookie 隔离）
 * - 支持动态扩缩容
 * - 上下文健康检查和自动回收
 */
const logger = require('../../../src/utils/logger');

class TurnstileContextPool {
    constructor(options = {}) {
        // 池配置
        this.minSize = options.minSize || 3;           // 最小池大小
        this.maxSize = options.maxSize || 20;          // 最大池大小
        this.maxIdleTime = options.maxIdleTime || 60000;  // 空闲上下文最大存活时间 (1分钟)
        this.maxUseCount = options.maxUseCount || 50;  // 单个上下文最大复用次数
        this.healthCheckInterval = options.healthCheckInterval || 30000; // 健康检查间隔

        // 池状态
        this.availableContexts = [];  // 可用上下文 [{context, createdAt, useCount, lastUsedAt}]
        this.busyContexts = new Map(); // 正在使用的上下文 requestId -> contextInfo
        this.isInitialized = false;
        this.isDestroyed = false;

        // 统计
        this.stats = {
            totalCreated: 0,
            totalDestroyed: 0,
            totalReused: 0,
            totalRequests: 0,
            poolHits: 0,      // 从池中获取
            poolMisses: 0,    // 需要新建
            peakSize: 0
        };

        // 等待队列（当池满时）
        this.waitingQueue = [];
        this.maxWaitingQueueSize = 100;
        this.waitTimeout = 30000; // 等待超时 30秒

        logger.poolInit(this.minSize, this.maxSize);
    }

    /**
     * 初始化池 - 预创建最小数量的上下文
     */
    async initialize() {
        if (this.isInitialized || this.isDestroyed) return;
        if (!global.browser) {
            logger.warn('上下文池', '浏览器未就绪，延迟初始化');
            return;
        }

        logger.debug('上下文池', `预创建 ${this.minSize} 个上下文...`);

        const createPromises = [];
        for (let i = 0; i < this.minSize; i++) {
            createPromises.push(this.createContext());
        }

        const results = await Promise.allSettled(createPromises);
        const successCount = results.filter(r => r.status === 'fulfilled' && r.value).length;

        logger.info('上下文池', `初始化完成: ${successCount}/${this.minSize} 个上下文就绪`);

        // 启动健康检查
        this.startHealthCheck();

        this.isInitialized = true;
    }

    /**
     * 创建新上下文
     */
    async createContext() {
        if (this.isDestroyed || !global.browser) return null;

        try {
            const context = await global.browser.createBrowserContext();
            if (!context) return null;

            const contextInfo = {
                context,
                createdAt: Date.now(),
                lastUsedAt: Date.now(),
                useCount: 0,
                id: `ctx_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`
            };

            this.availableContexts.push(contextInfo);
            this.stats.totalCreated++;
            this.updatePeakSize();

            return contextInfo;
        } catch (e) {
            logger.error('上下文池', `创建上下文失败: ${e.message}`);
            return null;
        }
    }

    /**
     * 获取上下文（供 Turnstile 请求使用）
     * @param {string} requestId - 请求ID
     * @returns {Promise<{context, contextInfo}>}
     */
    async acquire(requestId) {
        if (this.isDestroyed) {
            throw new Error('Context pool is destroyed');
        }

        this.stats.totalRequests++;

        // 尝试从池中获取
        let contextInfo = this.getAvailableContext();

        if (contextInfo) {
            // 池命中
            this.stats.poolHits++;
            this.stats.totalReused++;
            contextInfo.useCount++;
            contextInfo.lastUsedAt = Date.now();
            this.busyContexts.set(requestId, contextInfo);
            return { context: contextInfo.context, contextInfo };
        }

        // 池未命中，检查是否可以创建新的
        const totalSize = this.availableContexts.length + this.busyContexts.size;

        if (totalSize < this.maxSize) {
            // 可以创建新的
            this.stats.poolMisses++;
            contextInfo = await this.createContext();

            if (contextInfo) {
                // 从 available 移除（因为 createContext 会加入 available）
                const idx = this.availableContexts.indexOf(contextInfo);
                if (idx > -1) this.availableContexts.splice(idx, 1);

                contextInfo.useCount++;
                contextInfo.lastUsedAt = Date.now();
                this.busyContexts.set(requestId, contextInfo);
                return { context: contextInfo.context, contextInfo };
            }
        }

        // 池已满，加入等待队列
        if (this.waitingQueue.length >= this.maxWaitingQueueSize) {
            throw new Error('Context pool waiting queue is full');
        }

        return new Promise((resolve, reject) => {
            const waitItem = {
                requestId,
                resolve,
                reject,
                timestamp: Date.now()
            };

            // 设置超时
            waitItem.timeoutId = setTimeout(() => {
                const idx = this.waitingQueue.indexOf(waitItem);
                if (idx > -1) {
                    this.waitingQueue.splice(idx, 1);
                    reject(new Error('Context pool acquire timeout'));
                }
            }, this.waitTimeout);

            this.waitingQueue.push(waitItem);
        });
    }

    /**
     * 从可用池中获取上下文
     */
    getAvailableContext() {
        while (this.availableContexts.length > 0) {
            const contextInfo = this.availableContexts.shift();

            // 检查上下文是否健康
            if (this.isContextHealthy(contextInfo)) {
                return contextInfo;
            }

            // 不健康，销毁它
            this.destroyContext(contextInfo);
        }

        return null;
    }

    /**
     * 检查上下文是否健康
     */
    isContextHealthy(contextInfo) {
        if (!contextInfo || !contextInfo.context) return false;

        // 检查使用次数
        if (contextInfo.useCount >= this.maxUseCount) {
            return false;
        }

        // 检查空闲时间
        const idleTime = Date.now() - contextInfo.lastUsedAt;
        if (idleTime > this.maxIdleTime) {
            return false;
        }

        // 检查上下文是否仍然有效
        try {
            // 简单检查：尝试获取 pages
            const pages = contextInfo.context.pages;
            return typeof pages === 'function';
        } catch (e) {
            return false;
        }
    }

    /**
     * 释放上下文（请求完成后调用）
     * @param {string} requestId - 请求ID
     * @param {boolean} success - 请求是否成功
     */
    async release(requestId, success = true) {
        const contextInfo = this.busyContexts.get(requestId);
        if (!contextInfo) return;

        this.busyContexts.delete(requestId);

        // 清理上下文中的页面
        try {
            const pages = await contextInfo.context.pages();
            for (const page of pages) {
                await page.close().catch(() => {});
            }
        } catch (e) {
            // 上下文可能已失效
        }

        // 检查是否应该回收
        const shouldRecycle = success &&
                             this.isContextHealthy(contextInfo) &&
                             !this.isDestroyed;

        if (shouldRecycle) {
            // 放回池中
            contextInfo.lastUsedAt = Date.now();
            this.availableContexts.push(contextInfo);

            // 处理等待队列
            this.processWaitingQueue();
        } else {
            // 销毁上下文
            await this.destroyContext(contextInfo);

            // 如果池太小，补充新的
            if (this.getTotalSize() < this.minSize && !this.isDestroyed) {
                this.createContext().catch(() => {});
            }

            // 处理等待队列
            this.processWaitingQueue();
        }
    }

    /**
     * 处理等待队列
     */
    async processWaitingQueue() {
        while (this.waitingQueue.length > 0 && this.availableContexts.length > 0) {
            const waitItem = this.waitingQueue.shift();
            if (!waitItem) continue;

            clearTimeout(waitItem.timeoutId);

            const contextInfo = this.getAvailableContext();
            if (contextInfo) {
                contextInfo.useCount++;
                contextInfo.lastUsedAt = Date.now();
                this.busyContexts.set(waitItem.requestId, contextInfo);
                this.stats.poolHits++;
                this.stats.totalReused++;
                waitItem.resolve({ context: contextInfo.context, contextInfo });
            } else {
                // 尝试创建新的
                const totalSize = this.getTotalSize();
                if (totalSize < this.maxSize) {
                    const newContextInfo = await this.createContext();
                    if (newContextInfo) {
                        const idx = this.availableContexts.indexOf(newContextInfo);
                        if (idx > -1) this.availableContexts.splice(idx, 1);

                        newContextInfo.useCount++;
                        newContextInfo.lastUsedAt = Date.now();
                        this.busyContexts.set(waitItem.requestId, newContextInfo);
                        this.stats.poolMisses++;
                        waitItem.resolve({ context: newContextInfo.context, contextInfo: newContextInfo });
                        continue;
                    }
                }
                // 无法满足，重新加入队列
                this.waitingQueue.unshift(waitItem);
                break;
            }
        }
    }

    /**
     * 销毁上下文
     */
    async destroyContext(contextInfo) {
        if (!contextInfo) return;

        try {
            await contextInfo.context.close().catch(() => {});
        } catch (e) {}

        this.stats.totalDestroyed++;
    }

    /**
     * 启动健康检查
     */
    startHealthCheck() {
        if (this.healthCheckTimer) return;

        this.healthCheckTimer = setInterval(() => {
            this.performHealthCheck();
        }, this.healthCheckInterval);
    }

    /**
     * 执行健康检查
     */
    async performHealthCheck() {
        if (this.isDestroyed) return;

        const now = Date.now();
        const toRemove = [];

        // 检查空闲上下文
        for (const contextInfo of this.availableContexts) {
            if (!this.isContextHealthy(contextInfo)) {
                toRemove.push(contextInfo);
            }
        }

        // 移除不健康的上下文
        for (const contextInfo of toRemove) {
            const idx = this.availableContexts.indexOf(contextInfo);
            if (idx > -1) {
                this.availableContexts.splice(idx, 1);
                await this.destroyContext(contextInfo);
            }
        }

        // 如果池太小，补充
        const currentSize = this.getTotalSize();
        if (currentSize < this.minSize) {
            const toCreate = this.minSize - currentSize;
            for (let i = 0; i < toCreate; i++) {
                await this.createContext();
            }
        }

        // 如果空闲上下文过多，回收一些
        const maxIdle = Math.max(this.minSize, Math.ceil(this.maxSize * 0.3));
        while (this.availableContexts.length > maxIdle) {
            const contextInfo = this.availableContexts.pop();
            if (contextInfo) {
                await this.destroyContext(contextInfo);
            }
        }
    }

    /**
     * 获取池总大小
     */
    getTotalSize() {
        return this.availableContexts.length + this.busyContexts.size;
    }

    /**
     * 更新峰值大小
     */
    updatePeakSize() {
        const currentSize = this.getTotalSize();
        if (currentSize > this.stats.peakSize) {
            this.stats.peakSize = currentSize;
        }
    }

    /**
     * 获取统计信息
     */
    getStats() {
        const hitRate = this.stats.totalRequests > 0
            ? (this.stats.poolHits / this.stats.totalRequests * 100).toFixed(2)
            : 0;

        return {
            ...this.stats,
            currentSize: this.getTotalSize(),
            availableCount: this.availableContexts.length,
            busyCount: this.busyContexts.size,
            waitingCount: this.waitingQueue.length,
            hitRate: `${hitRate}%`
        };
    }

    /**
     * 销毁池
     */
    async destroy() {
        if (this.isDestroyed) return;
        this.isDestroyed = true;

        logger.info('上下文池', '开始销毁...');

        // 停止健康检查
        if (this.healthCheckTimer) {
            clearInterval(this.healthCheckTimer);
            this.healthCheckTimer = null;
        }

        // 清空等待队列
        for (const waitItem of this.waitingQueue) {
            clearTimeout(waitItem.timeoutId);
            waitItem.reject(new Error('Context pool destroyed'));
        }
        this.waitingQueue = [];

        // 销毁所有上下文
        const allContexts = [
            ...this.availableContexts,
            ...Array.from(this.busyContexts.values())
        ];

        for (const contextInfo of allContexts) {
            await this.destroyContext(contextInfo);
        }

        this.availableContexts = [];
        this.busyContexts.clear();

        logger.info('上下文池', '销毁完成');
    }

    /**
     * 重置池（不销毁，只是清空）
     */
    async reset() {
        // 销毁所有上下文
        for (const contextInfo of this.availableContexts) {
            await this.destroyContext(contextInfo);
        }
        this.availableContexts = [];

        // 重置统计
        this.stats = {
            totalCreated: 0,
            totalDestroyed: 0,
            totalReused: 0,
            totalRequests: 0,
            poolHits: 0,
            poolMisses: 0,
            peakSize: 0
        };

        // 重新初始化
        this.isInitialized = false;
        await this.initialize();
    }
}

// 创建单例
const turnstileContextPool = new TurnstileContextPool({
    minSize: Number(process.env.TURNSTILE_POOL_MIN_SIZE) || 3,
    maxSize: Number(process.env.TURNSTILE_POOL_MAX_SIZE) || 20,
    maxIdleTime: Number(process.env.TURNSTILE_POOL_IDLE_TIME) || 60000,
    maxUseCount: Number(process.env.TURNSTILE_POOL_MAX_USE_COUNT) || 50
});

module.exports = turnstileContextPool;
