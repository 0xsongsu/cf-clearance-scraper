/**
 * 统一日志管理器
 * 提供结构化、中文化、简洁的日志输出
 */

const chalk = require('chalk');

// 日志级别
const LOG_LEVELS = {
    DEBUG: 0,
    INFO: 1,
    WARN: 2,
    ERROR: 3,
    NONE: 4
};

// 当前日志级别（可通过环境变量配置）
const currentLevel = LOG_LEVELS[process.env.LOG_LEVEL?.toUpperCase()] ?? LOG_LEVELS.INFO;

// 是否启用颜色（可通过环境变量禁用）
const enableColor = process.env.LOG_COLOR !== 'false';

// 是否显示时间戳
const showTimestamp = process.env.LOG_TIMESTAMP !== 'false';

// 格式化时间
function formatTime() {
    const now = new Date();
    return now.toLocaleTimeString('zh-CN', { hour12: false });
}

// 格式化持续时间
function formatDuration(ms) {
    if (ms < 1000) return `${ms}ms`;
    if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
    return `${(ms / 60000).toFixed(1)}min`;
}

// 截断URL显示
function shortUrl(url, maxLen = 40) {
    if (!url) return '-';
    try {
        const u = new URL(url);
        const short = u.hostname + u.pathname;
        return short.length > maxLen ? short.substring(0, maxLen - 3) + '...' : short;
    } catch {
        return url.length > maxLen ? url.substring(0, maxLen - 3) + '...' : url;
    }
}

// 格式化请求ID（只显示前8位）
function shortId(id) {
    if (!id) return '--------';
    return id.substring(0, 8);
}

// 日志输出
function log(level, icon, category, message, extra = {}) {
    if (LOG_LEVELS[level] < currentLevel) return;

    const parts = [];

    // 时间戳
    if (showTimestamp) {
        parts.push(chalk.gray(formatTime()));
    }

    // 图标和分类
    parts.push(icon);
    parts.push(chalk.cyan(`[${category}]`));

    // 主消息
    parts.push(message);

    // 额外信息
    const extraParts = [];
    if (extra.id) extraParts.push(`ID:${shortId(extra.id)}`);
    if (extra.url) extraParts.push(`URL:${shortUrl(extra.url)}`);
    if (extra.duration !== undefined) extraParts.push(`耗时:${formatDuration(extra.duration)}`);
    if (extra.count !== undefined) extraParts.push(`数量:${extra.count}`);
    if (extra.size !== undefined) extraParts.push(`大小:${extra.size}`);
    if (extra.rate !== undefined) extraParts.push(`命中率:${extra.rate}`);
    if (extra.detail) extraParts.push(extra.detail);

    if (extraParts.length > 0) {
        parts.push(chalk.gray(`(${extraParts.join(', ')})`));
    }

    console.log(parts.join(' '));
}

// 日志方法
const logger = {
    // ========== 请求生命周期 ==========

    /** 请求开始 */
    requestStart(mode, requestId, url) {
        log('INFO', '📥', '请求', `开始处理 ${chalk.yellow(mode)}`, { id: requestId, url });
    },

    /** 请求成功 */
    requestSuccess(mode, requestId, duration) {
        log('INFO', '✅', '请求', `${chalk.green(mode)} 成功`, { id: requestId, duration });
    },

    /** 请求失败 */
    requestFail(mode, requestId, reason, duration) {
        log('WARN', '❌', '请求', `${chalk.red(mode)} 失败: ${reason}`, { id: requestId, duration });
    },

    /** 请求超时 */
    requestTimeout(requestId, duration) {
        log('WARN', '⏱️', '请求', chalk.yellow('超时'), { id: requestId, duration });
    },

    /** 请求排队 */
    requestQueued(requestId, position, queueName = '全局') {
        log('DEBUG', '⏳', '队列', `加入${queueName}队列`, { id: requestId, detail: `位置:${position}` });
    },

    /** 请求出队 */
    requestDequeued(requestId, waitTime, queueName = '全局') {
        log('DEBUG', '🚀', '队列', `从${queueName}队列释放`, { id: requestId, duration: waitTime });
    },

    // ========== Turnstile ==========

    /** Token获取成功 */
    tokenSuccess(requestId, tokenLength, attempt) {
        log('INFO', '🎫', 'Token', chalk.green(`获取成功`), {
            id: requestId,
            detail: `长度:${tokenLength}, 尝试:${attempt}次`
        });
    },

    /** Token验证失败 */
    tokenInvalid(requestId, reason) {
        log('WARN', '🎫', 'Token', chalk.yellow(`验证失败: ${reason}`), { id: requestId });
    },

    // ========== Cookie ==========

    /** Cookie获取成功 */
    cookieSuccess(requestId, cookieName = 'cf_clearance') {
        log('INFO', '🍪', 'Cookie', chalk.green(`${cookieName} 获取成功`), { id: requestId });
    },

    /** Cookie等待中 */
    cookieWaiting(requestId, elapsed, total) {
        log('DEBUG', '🍪', 'Cookie', `等待中...`, { id: requestId, detail: `${elapsed}/${total}s` });
    },

    // ========== 上下文池 ==========

    /** 从池获取上下文 */
    poolAcquire(requestId, poolSize, available) {
        log('DEBUG', '🏊', '上下文池', `获取上下文`, { id: requestId, detail: `可用:${available}/${poolSize}` });
    },

    /** 释放上下文到池 */
    poolRelease(requestId, reused) {
        log('DEBUG', '🏊', '上下文池', reused ? '回收复用' : '销毁', { id: requestId });
    },

    /** 池统计 */
    poolStats(stats) {
        log('INFO', '🏊', '上下文池', `统计`, {
            size: stats.currentSize,
            rate: stats.hitRate,
            detail: `复用:${stats.totalReused}次`
        });
    },

    /** 池初始化 */
    poolInit(minSize, maxSize) {
        log('INFO', '🏊', '上下文池', chalk.green(`初始化完成`), { detail: `容量:${minSize}-${maxSize}` });
    },

    // ========== 浏览器 ==========

    /** 浏览器启动 */
    browserLaunched() {
        log('INFO', '🌐', '浏览器', chalk.green('启动成功'));
    },

    /** 浏览器断开 */
    browserDisconnected() {
        log('WARN', '🌐', '浏览器', chalk.yellow('连接断开，正在重连...'));
    },

    /** 浏览器重连成功 */
    browserReconnected() {
        log('INFO', '🌐', '浏览器', chalk.green('重连成功'));
    },

    /** 上下文创建 */
    contextCreated(total) {
        log('DEBUG', '📦', '上下文', `创建成功`, { count: total });
    },

    /** 上下文关闭 */
    contextClosed(remaining) {
        log('DEBUG', '📦', '上下文', `已关闭`, { count: remaining });
    },

    // ========== 系统状态 ==========

    /** 内存警告 */
    memoryWarning(level, heapMB, maxMB, percent) {
        const levelText = {
            'moderate': chalk.yellow('中等'),
            'high': chalk.hex('#FFA500')('较高'),
            'critical': chalk.red('危险')
        }[level] || level;
        log('WARN', '💾', '内存', `压力${levelText}`, { detail: `${heapMB}MB/${maxMB}MB (${percent}%)` });
    },

    /** GC执行 */
    gcExecuted(type, freedMB) {
        log('DEBUG', '🧹', 'GC', `${type === 'force' ? '强制' : '软'}回收完成`, {
            detail: freedMB ? `释放:${freedMB}MB` : undefined
        });
    },

    /** 压力等级变化 */
    pressureChanged(from, to) {
        const levelText = {
            'normal': chalk.green('正常'),
            'moderate': chalk.yellow('中等'),
            'high': chalk.hex('#FFA500')('较高'),
            'critical': chalk.red('危险')
        };
        log('INFO', '📊', '系统', `压力等级: ${levelText[from] || from} → ${levelText[to] || to}`);
    },

    /** 并发限制调整 */
    concurrencyAdjusted(from, to, reason) {
        log('INFO', '⚡', '并发', `限制调整: ${from} → ${to}`, { detail: reason });
    },

    // ========== 服务状态 ==========

    /** 服务启动 */
    serverStarted(port) {
        log('INFO', '🚀', '服务', chalk.green(`启动成功`), { detail: `端口:${port}` });
    },

    /** 服务重启 */
    serverRestarting(reason) {
        log('INFO', '🔄', '服务', chalk.yellow(`正在重启...`), { detail: reason });
    },

    /** 限流拒绝 */
    rateLimited(requestId, reason) {
        log('WARN', '🚫', '限流', chalk.yellow(reason), { id: requestId });
    },

    // ========== 通用方法 ==========

    debug(category, message, extra = {}) {
        log('DEBUG', '🔍', category, message, extra);
    },

    info(category, message, extra = {}) {
        log('INFO', 'ℹ️', category, message, extra);
    },

    warn(category, message, extra = {}) {
        log('WARN', '⚠️', category, message, extra);
    },

    error(category, message, extra = {}) {
        log('ERROR', '❌', category, chalk.red(message), extra);
    },

    // ========== 辅助方法 ==========

    formatDuration,
    shortUrl,
    shortId
};

module.exports = logger;
