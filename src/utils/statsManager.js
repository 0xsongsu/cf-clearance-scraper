/**
 * 统计数据管理器
 * 处理监控数据的收集、计算和管理
 */
class StatsManager {
    constructor() {
        this.dailyResetTimer = null;
        this.persistenceTimer = null;
        this.initializeDailyStats();
        this.setupDailyReset();
    }

    /**
     * 初始化今日统计数据
     */
    initializeDailyStats() {
        const today = new Date().toDateString();
        
        // 如果没有今日统计或日期不匹配，则初始化
        if (!global.monitoringData.dailyStats || global.monitoringData.dailyStats.date !== today) {
            this.resetDailyStats();
        }
    }

    /**
     * 重置今日统计数据
     */
    resetDailyStats() {
        const today = new Date().toDateString();
        console.log(`📅 重置今日统计数据: ${today}`);
        
        global.monitoringData.dailyStats = {
            date: today,
            requests: 0,
            successful: 0,
            failed: 0,
            billing: 0
        };
    }

    /**
     * 设置午夜自动重置机制
     */
    setupDailyReset() {
        // 清除现有定时器
        if (this.dailyResetTimer) {
            clearTimeout(this.dailyResetTimer);
        }

        // 计算到下一个午夜的毫秒数
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const msUntilMidnight = tomorrow.getTime() - now.getTime();

        // 设置午夜重置定时器
        this.dailyResetTimer = setTimeout(() => {
            this.resetDailyStats();
            // 设置每24小时重复执行
            this.dailyResetTimer = setInterval(() => {
                this.resetDailyStats();
            }, 24 * 60 * 60 * 1000);
        }, msUntilMidnight);

        console.log(`⏰ 今日统计将在 ${Math.round(msUntilMidnight / (60 * 1000))} 分钟后自动重置`);
    }

    /**
     * 更新请求统计（在请求开始时调用）
     * @param {string} url - 请求的URL
     * @param {string} ip - 客户端IP
     */
    updateRequestStart(url, ip) {
        // 更新今日统计
        global.monitoringData.dailyStats.requests++;
        
        // 更新URL统计
        this.updateUrlStats(url);
        
        // 更新IP统计
        this.updateIpStats(ip);
    }

    /**
     * 更新请求结果（在请求完成时调用）
     * @param {boolean} success - 请求是否成功
     */
    updateRequestResult(success) {
        if (success) {
            global.monitoringData.dailyStats.successful++;
        } else {
            global.monitoringData.dailyStats.failed++;
        }
        
        // 更新计费统计 - 无论成功还是失败都计费
        this.updateBilling();
    }

    /**
     * 更新URL统计
     * @param {string} url - 请求的URL
     */
    updateUrlStats(url) {
        const urlStats = global.monitoringData.urlStats;
        
        if (urlStats.has(url)) {
            const stats = urlStats.get(url);
            stats.count++;
            stats.lastRequest = new Date();
        } else {
            urlStats.set(url, {
                count: 1,
                lastRequest: new Date()
            });
        }
    }

    /**
     * 更新IP统计
     * @param {string} ip - 客户端IP
     */
    updateIpStats(ip) {
        const ipStats = global.monitoringData.ipStats;
        
        if (ipStats.has(ip)) {
            const stats = ipStats.get(ip);
            stats.count++;
            stats.lastRequest = new Date();
        } else {
            ipStats.set(ip, {
                count: 1,
                lastRequest: new Date()
            });
        }
    }

    /**
     * 更新计费统计
     * 计费包括成功和失败的请求
     */
    updateBilling() {
        const rate = 0.6 / 1000; // $0.6 per 1000 requests
        
        // 今日计费 = 今日总请求数 * 费率（包括成功和失败的请求）
        global.monitoringData.dailyStats.billing = global.monitoringData.dailyStats.requests * rate;
        
        // 更新历史总计费
        const totalBilling = global.monitoringData.totalRequests * rate;
        global.monitoringData.historicalData.totalBilling = totalBilling;
    }

    /**
     * 计算计费信息
     * 包括成功和失败的请求，按照0.6美元/1000次请求计费
     * @returns {Object} 计费统计对象
     */
    calculateBilling() {
        const rate = 0.6 / 1000; // $0.6 per 1000 requests
        
        // 今日计费 = 今日总请求数 * 费率（包括成功和失败的请求）
        const todayBilling = global.monitoringData.dailyStats.requests * rate;
        
        // 总计费 = 总请求数 * 费率（包括成功和失败的请求）
        const totalBilling = global.monitoringData.totalRequests * rate;
        
        return {
            todayAmount: Math.round(todayBilling * 10000) / 10000, // 保留四位小数用于精确计算
            totalAmount: Math.round(totalBilling * 10000) / 10000, // 保留四位小数用于精确计算
            ratePerThousand: 0.6, // 每1000次请求的费率
            todayRequests: global.monitoringData.dailyStats.requests, // 今日请求数
            totalRequests: global.monitoringData.totalRequests, // 总请求数
            // 格式化的美元显示（显示时保留两位小数）
            todayAmountFormatted: `$${(Math.round(todayBilling * 100) / 100).toFixed(2)}`,
            totalAmountFormatted: `$${(Math.round(totalBilling * 100) / 100).toFixed(2)}`
        };
    }

    /**
     * 获取排序后的URL统计（前N个）
     * @param {number} limit - 返回的数量限制
     * @returns {Array} URL统计数组
     */
    getTopUrlStats(limit = 10) {
        const urlStats = global.monitoringData.urlStats;
        const totalRequests = global.monitoringData.totalRequests || 1;
        
        return Array.from(urlStats.entries())
            .map(([url, stats]) => ({
                url,
                count: stats.count,
                percentage: Math.round((stats.count / totalRequests) * 1000) / 10,
                lastRequest: stats.lastRequest
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    /**
     * 获取排序后的IP统计（前N个）
     * @param {number} limit - 返回的数量限制
     * @returns {Array} IP统计数组
     */
    getTopIpStats(limit = 10) {
        const ipStats = global.monitoringData.ipStats;
        const totalRequests = global.monitoringData.totalRequests || 1;
        
        return Array.from(ipStats.entries())
            .map(([ip, stats]) => ({
                ip,
                count: stats.count,
                percentage: Math.round((stats.count / totalRequests) * 1000) / 10,
                lastRequest: stats.lastRequest
            }))
            .sort((a, b) => b.count - a.count)
            .slice(0, limit);
    }

    /**
     * 获取今日统计数据
     * @returns {Object} 今日统计对象
     */
    getTodayStats() {
        const dailyStats = global.monitoringData.dailyStats;
        const successRate = dailyStats.requests > 0 ? 
            Math.round((dailyStats.successful / dailyStats.requests) * 1000) / 10 : 0;
        
        return {
            date: dailyStats.date,
            requests: dailyStats.requests,
            successful: dailyStats.successful,
            failed: dailyStats.failed,
            successRate: successRate
        };
    }

    /**
     * 清理过期数据（防止内存泄漏）
     */
    cleanupOldData() {
        const maxEntries = 1000;
        
        // 清理URL统计（保留访问量最高的）
        if (global.monitoringData.urlStats.size > maxEntries) {
            const sortedUrls = this.getTopUrlStats(maxEntries);
            const newUrlStats = new Map();
            
            sortedUrls.forEach(item => {
                const originalStats = global.monitoringData.urlStats.get(item.url);
                if (originalStats) {
                    newUrlStats.set(item.url, originalStats);
                }
            });
            
            global.monitoringData.urlStats = newUrlStats;
            console.log(`🧹 清理URL统计数据，保留前 ${maxEntries} 个`);
        }
        
        // 清理IP统计（保留访问量最高的）
        if (global.monitoringData.ipStats.size > maxEntries) {
            const sortedIps = this.getTopIpStats(maxEntries);
            const newIpStats = new Map();
            
            sortedIps.forEach(item => {
                const originalStats = global.monitoringData.ipStats.get(item.ip);
                if (originalStats) {
                    newIpStats.set(item.ip, originalStats);
                }
            });
            
            global.monitoringData.ipStats = newIpStats;
            console.log(`🧹 清理IP统计数据，保留前 ${maxEntries} 个`);
        }
    }

    /**
     * 销毁管理器，清理定时器
     */
    destroy() {
        if (this.dailyResetTimer) {
            clearTimeout(this.dailyResetTimer);
            clearInterval(this.dailyResetTimer);
            this.dailyResetTimer = null;
        }
        
        if (this.persistenceTimer) {
            clearInterval(this.persistenceTimer);
            this.persistenceTimer = null;
        }
    }
}

module.exports = StatsManager;