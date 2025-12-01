/**
 * 站点队列管理器
 * 为每个站点维护独立的请求队列，避免不同站点之间的干扰
 */
const logger = require('../../../src/utils/logger');

class SiteQueueManager {
    constructor() {
        this.queues = new Map(); // 站点 -> 队列
        this.processing = new Map(); // 站点 -> 正在处理的数量
        // 默认每站点最大并发数提升到20，可通过环境变量 PER_SITE_CONCURRENCY 配置
        this.maxConcurrentPerSite = Number(process.env.PER_SITE_CONCURRENCY) || 20;
        this.stats = new Map(); // 站点统计信息
    }

    /**
     * 获取站点标识符
     */
    getSiteKey(url, siteKey) {
        try {
            const urlObj = new URL(url);
            const host = urlObj.hostname || 'unknown';
            // 支持无 siteKey 的场景（如 cf5s/cfcookie），仅用 hostname 作为队列键
            if (!siteKey) return host;
            return `${host}_${String(siteKey).substring(0, 10)}`;
        } catch {
            if (!siteKey) return 'unknown';
            return `unknown_${String(siteKey).substring(0, 10)}`;
        }
    }

    /**
     * 添加请求到队列
     */
    async queueRequest(url, siteKey, requestId) {
        const site = this.getSiteKey(url, siteKey);
        
        // 初始化站点队列
        if (!this.queues.has(site)) {
            this.queues.set(site, []);
            this.processing.set(site, 0);
            this.stats.set(site, {
                total: 0,
                success: 0,
                failed: 0,
                avgTime: 0
            });
        }

        const queue = this.queues.get(site);
        const processing = this.processing.get(site);
        
        // 记录统计
        const stats = this.stats.get(site);
        stats.total++;

        // 如果当前站点处理数未达上限，立即处理
        if (processing < this.maxConcurrentPerSite) {
            this.processing.set(site, processing + 1);
            logger.debug('队列', `立即处理`, { id: requestId, detail: `站点:${site}, 并发:${processing + 1}/${this.maxConcurrentPerSite}` });
            return {
                shouldWait: false,
                site,
                position: 0
            };
        }

        // 否则加入队列等待
        return new Promise((resolve) => {
            const queueItem = {
                requestId,
                resolve,
                timestamp: Date.now()
            };
            
            queue.push(queueItem);
            const position = queue.length;

            logger.requestQueued(requestId, position, site);

            // 设置超时
            setTimeout(() => {
                const index = queue.findIndex(item => item.requestId === requestId);
                if (index !== -1) {
                    queue.splice(index, 1);
                    logger.requestTimeout(requestId, 120000);
                    resolve({
                        shouldWait: false,
                        timeout: true,
                        site,
                        position: -1
                    });
                }
            }, 120000); // 2分钟超时
        });
    }

    /**
     * 释放处理槽位
     */
    releaseSlot(url, siteKey, requestId, success = true, duration = 0) {
        const site = this.getSiteKey(url, siteKey);
        
        if (!this.processing.has(site)) {
            return;
        }

        const processing = this.processing.get(site);
        this.processing.set(site, Math.max(0, processing - 1));

        // 更新统计
        const stats = this.stats.get(site);
        if (stats) {
            if (success) {
                stats.success++;
            } else {
                stats.failed++;
            }
            
            // 计算平均时间
            if (duration > 0 && success) {
                stats.avgTime = stats.avgTime === 0 
                    ? duration 
                    : (stats.avgTime * (stats.success - 1) + duration) / stats.success;
            }
        }

        logger.debug('队列', `释放槽位`, { id: requestId, detail: `站点:${site}, 并发:${this.processing.get(site)}/${this.maxConcurrentPerSite}` });

        // 处理队列中的下一个请求
        const queue = this.queues.get(site);
        if (queue && queue.length > 0) {
            const next = queue.shift();
            const waitTime = Date.now() - next.timestamp;

            this.processing.set(site, this.processing.get(site) + 1);
            logger.requestDequeued(next.requestId, waitTime, site);

            next.resolve({
                shouldWait: false,
                site,
                waitTime,
                position: 0
            });
        }
    }

    /**
     * 获取所有站点的统计信息
     */
    getStats() {
        const result = {};
        for (const [site, stats] of this.stats.entries()) {
            result[site] = {
                ...stats,
                processing: this.processing.get(site) || 0,
                queued: (this.queues.get(site) || []).length,
                successRate: stats.total > 0 ? (stats.success / stats.total * 100).toFixed(2) + '%' : '0%',
                avgTime: Math.round(stats.avgTime) + 'ms'
            };
        }
        return result;
    }

    /**
     * 清理空闲的队列
     */
    cleanup() {
        for (const [site, queue] of this.queues.entries()) {
            if (queue.length === 0 && this.processing.get(site) === 0) {
                this.queues.delete(site);
                this.processing.delete(site);
                // 保留统计信息
            }
        }
    }
}

// 创建全局实例
const siteQueueManager = new SiteQueueManager();

module.exports = siteQueueManager;
