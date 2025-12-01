// 加载根目录的统一配置文件
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const express = require('express')
const app = express()
const port = process.env.PORT || 3001
const bodyParser = require('body-parser')
const authToken = process.env.AUTH_TOKEN || process.env.authToken || null // 兼容旧格式
const cors = require('cors')
const { v4: uuidv4 } = require('uuid')
const reqValidate = require('../captcha-solvers/turnstile/module/reqValidate')
const memoryManager = require('./utils/memoryManager')
const StatsManager = require('./utils/statsManager')
const globalRequestManager = require('./utils/globalRequestManager')
const logger = require('./utils/logger')

// 延迟加载上下文池（避免循环依赖）
let turnstileContextPool = null;
function getContextPool() {
    if (!turnstileContextPool) {
        try {
            turnstileContextPool = require('../captcha-solvers/turnstile/utils/contextPool');
        } catch (e) {}
    }
    return turnstileContextPool;
}

// 请求计数器（替代浏览器实例计数）
global.activeRequestCount = 0
global.maxConcurrentRequests = Number(process.env.MAX_CONCURRENT_REQUESTS) || 60
global.timeOut = Number(process.env.TIMEOUT || process.env.timeOut || 300000) // 兼容旧格式
global.memoryCleanupInterval = Number(process.env.MEMORY_CLEANUP_INTERVAL || process.env.memoryCleanupInterval) || 300000
global.maxMemoryUsage = Number(process.env.MAX_MEMORY_USAGE || process.env.maxMemoryUsage) || 4096 // MB

// 监控数据
global.monitoringData = {
    // 基础统计
    startTime: new Date(),
    totalRequests: 0,
    successfulRequests: 0,
    failedRequests: 0,
    activeRequests: new Map(), // 存储当前活跃请求
    recentTokens: [], // 最近生成的token
    requestHistory: [], // 请求历史
    activeRequestsByService: { // 按服务类型分组的活跃请求
        cloudflare: 0
    },
    lastRequestTime: new Date(), // 最后一次请求时间
    
    // 新增统计字段
    dailyStats: {
        date: new Date().toDateString(),
        requests: 0,
        successful: 0,
        failed: 0,
        billing: 0
    },
    
    // URL统计 - 使用Map存储 url -> { count, lastRequest }
    urlStats: new Map(),
    
    // IP统计 - 使用Map存储 ip -> { count, lastRequest }
    ipStats: new Map(),
    
    // 历史数据（用于持久化）
    historicalData: {
        totalBilling: 0,
        urlHistory: {},
        ipHistory: {}
    }
}

// 自动重启检查配置
global.autoRestartConfig = {
    enabled: true,
    idleTimeThreshold: 6 * 60 * 60 * 1000, // 6小时（毫秒）
    checkInterval: 30 * 60 * 1000, // 每30分钟检查一次
    lastCheckTime: new Date()
}

app.use(bodyParser.json({}))
app.use(bodyParser.urlencoded({ extended: true }))
app.use(cors())

// 静态文件服务（用于监控页面）
app.use('/monitor', require('express').static(__dirname + '/../monitor'))
if (process.env.NODE_ENV !== 'development') {
    let server = app.listen(port, '0.0.0.0', () => {
        logger.serverStarted(port)
    })
    try {
        server.timeout = global.timeOut
    } catch (e) { }
}
if (process.env.SKIP_LAUNCH != 'true') require('../captcha-solvers/turnstile/module/createBrowser')

// 启动内存监控（仅在非测试环境）
if (process.env.NODE_ENV !== 'test') {
    memoryManager.startMonitoring()
}

// 初始化统计管理器
global.statsManager = new StatsManager()

// 启动定期数据清理（仅在非测试环境）
if (process.env.NODE_ENV !== 'test') {
    global.cleanupTimer = setInterval(() => {
        global.statsManager.cleanupOldData()
    }, 60 * 60 * 1000) // 每小时清理一次
}

// 启动自动重启检查（仅在非测试环境）
if (process.env.NODE_ENV !== 'test' && global.autoRestartConfig.enabled) {
    startAutoRestartCheck()
}

const solveTurnstileMin = require('../captcha-solvers/turnstile/endpoints/solveTurnstile.min')
const getCfClearance = require('../captcha-solvers/turnstile/endpoints/cfcookieService')
const getCookies = require('../captcha-solvers/turnstile/endpoints/getCookies')


// 统一验证码处理接口 - 根路径
app.post('/', async (req, res) => {
    try {
        const { type } = req.body;

        if (!type) {
            return res.status(400).json({
                code: 400,
                message: 'Missing required parameter: type. Supported types: cftoken, cf5s, cookies',
                token: null
            });
        }

        switch (type.toLowerCase()) {
            case 'cftoken':
                return await handleCftokenRequest(req, res);
            
            case 'cf5s':
                return await handleCf5sRequest(req, res);
            
            case 'cookies':
                return await handleCookiesRequest(req, res);
            
            default:
                return res.status(400).json({
                    code: 400,
                    message: `Unsupported type: ${type}. Supported types: cftoken, cf5s, cookies`,
                    token: null
                });
        }
    } catch (error) {
        logger.error('请求', `统一处理器错误: ${error.message}`);
        return res.status(500).json({
            code: 500,
            message: `Internal server error: ${error.message}`,
            token: null
        });
    }
})


// 处理 cftoken 请求
async function handleCftokenRequest(req, res) {
    const data = req.body;

    // 参数验证
    if (!data.websiteUrl) {
        return res.status(400).json({ 
            code: 400, 
            message: 'websiteUrl is required',
            token: null 
        });
    }

    if (!data.websiteKey) {
        return res.status(400).json({ 
            code: 400, 
            message: 'websiteKey is required',
            token: null 
        });
    }

    // 转换为内部格式
    const internalData = {
        url: data.websiteUrl,
        siteKey: data.websiteKey,
        mode: 'turnstile-min',
        authToken: data.authToken,
        proxy: data.proxy
    };

    // 处理请求
    return handleClearanceRequest(req, res, internalData);
}

// 处理 cf5s 请求 (5秒盾)
async function handleCf5sRequest(req, res) {
    const data = req.body;

    // 参数验证
    if (!data.websiteUrl) {
        return res.status(400).json({ 
            code: 400, 
            message: 'websiteUrl is required',
            cf_clearance: null 
        });
    }

    // 转换为内部格式
    const internalData = {
        url: data.websiteUrl,
        mode: 'cf5s',
        authToken: data.authToken,
        proxy: data.proxy
    };

    // 处理请求
    return handleClearanceRequest(req, res, internalData);
}

// 处理 cookies 请求（获取网站所有cookies）
async function handleCookiesRequest(req, res) {
    const data = req.body;

    // 参数验证
    if (!data.websiteUrl) {
        return res.status(400).json({ 
            code: 400, 
            message: 'websiteUrl is required',
            cookies: null 
        });
    }

    // 转换为内部格式
    const internalData = {
        url: data.websiteUrl,
        mode: 'cookies',
        authToken: data.authToken,
        proxy: data.proxy,
        waitTime: data.waitTime || 10000  // 默认等待10秒
    };

    // 处理请求
    return handleClearanceRequest(req, res, internalData);
}



// 统一的请求处理函数
async function handleClearanceRequest(req, res, data) {
    const check = reqValidate(data)

    if (check !== true) return res.status(400).json({ code: 400, message: 'Bad Request', schema: check })

    if (authToken && data.authToken !== authToken) return res.status(401).json({ code: 401, message: 'Unauthorized' })

    if (process.env.SKIP_LAUNCH != 'true' && !global.browser) return res.status(500).json({ code: 500, message: 'The scanner is not ready yet. Please try again a little later.' })

    // 检查系统压力 - 在高压时拒绝新请求
    const pressureCheck = memoryManager.shouldAcceptRequest()
    if (!pressureCheck.accept) {
        logger.rateLimited(null, pressureCheck.reason)
        return res.status(503).json({
            code: 503,
            message: pressureCheck.reason,
            pressureLevel: memoryManager.getPressureLevel()
        })
    }

    // 生成唯一请求ID
    const requestId = uuidv4()

    // 获取真实IP地址
    const clientIP = req.headers['x-real-ip'] ||
                     req.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
                     req.ip ||
                     req.socket.remoteAddress ||
                     '127.0.0.1'

    // 全局处理限制检查（动态并发控制）
    const globalCheck = await globalRequestManager.requestProcessing(requestId, {
        url: data.url,
        mode: data.mode,
        clientIP: clientIP
    })
    
    if (!globalCheck.allowed) {
        logger.rateLimited(requestId, globalCheck.reason)
        return res.status(429).json({ 
            code: 429, 
            message: `Global rate limit: ${globalCheck.reason}`,
            processing: globalCheck.processingCount,
            waiting: globalCheck.waitingCount
        })
    }
    
    // 如果请求从全局等待池释放，记录信息
    if (globalCheck.queued) {
        logger.requestDequeued(requestId, globalCheck.waitTime, '全局')
    }

    var result = { code: 500 }

    global.activeRequestCount++
    global.monitoringData.totalRequests++
    
    // 更新最后请求时间
    global.monitoringData.lastRequestTime = new Date()
    
    // 使用统计管理器更新请求开始统计
    global.statsManager.updateRequestStart(data.url, clientIP)
    
    // 记录活跃请求
    global.monitoringData.activeRequests.set(requestId, {
        id: requestId,
        url: data.url,
        mode: data.mode,
        startTime: new Date(),
        clientIP: clientIP
    })
    
    // 更新按服务分组的活跃请求计数
    global.monitoringData.activeRequestsByService.cloudflare++;
    
    // 设置请求超时清理
    const requestTimeout = setTimeout(() => {
        global.activeRequestCount--
        const request = global.monitoringData.activeRequests.get(requestId)
        if (request) {
            global.monitoringData.activeRequestsByService.cloudflare--;
        }
        global.monitoringData.activeRequests.delete(requestId)
        globalRequestManager.releaseProcessing(requestId)
        logger.requestTimeout(requestId, global.timeOut)
    }, global.timeOut + 5000)

    // 为下游打码请求添加请求ID（用于站点队列追踪与日志）
    const dataWithRequestId = { ...data, requestId };
    
    switch (data.mode) {
        case "turnstile-min":
            result = await solveTurnstileMin(dataWithRequestId).then(res => { return { token: res, code: 200 } }).catch(err => { return { code: 500, message: err.message } })
            break;
        case "cf5s":
            result = await getCfClearance(dataWithRequestId).then(res => { 
                // 如果是 cf5s 模式，返回完整信息
                if (typeof res === 'object' && res.cf_clearance) {
                    return res;
                }
                // 兼容旧格式
                return { cf_clearance: res, code: 200 } 
            }).catch(err => { return { code: 500, message: err.message } })
            break;
        case "cookies":
            result = await getCookies(dataWithRequestId).then(res => {
                return res;  // getCookies已经返回完整格式
            }).catch(err => { return { code: 500, message: err.message } })
            break;
        default:
            result = { code: 400, message: `Unsupported mode: ${data.mode}` }
            break;
    }

    global.activeRequestCount--
    clearTimeout(requestTimeout)

    // 更新监控数据 - 先获取请求信息，再删除
    const request = global.monitoringData.activeRequests.get(requestId)
    const requestStartTime = request?.startTime
    
    if (request) {
        global.monitoringData.activeRequestsByService.cloudflare--;
    }
    global.monitoringData.activeRequests.delete(requestId)
    
    const isSuccess = result.code === 200
    
    if (isSuccess) {
        global.monitoringData.successfulRequests++
        
        // 记录token或cf_clearance（如果有）
        if (result.token || result.cf_clearance) {
            const tokenRecord = {
                url: data.url,
                mode: data.mode,
                timestamp: new Date(),
                requestId: requestId
            }
            
            // 根据不同模式存储不同的值
            if (result.token) {
                tokenRecord.token = result.token
            }
            if (result.cf_clearance) {
                tokenRecord.cfcookie = result.cf_clearance
                tokenRecord.cookie = result.cf_clearance  // 兼容性
            }
            if (result.cookies) {
                tokenRecord.cookies = result.cookies
            }
            
            global.monitoringData.recentTokens.unshift(tokenRecord)
            
            // 只保留最近50个token
            if (global.monitoringData.recentTokens.length > 50) {
                global.monitoringData.recentTokens = global.monitoringData.recentTokens.slice(0, 50)
            }
        }
    } else {
        global.monitoringData.failedRequests++
    }
    
    // 使用统计管理器更新请求结果
    global.statsManager.updateRequestResult(isSuccess)
    
    // 记录请求历史 - 使用之前获取的开始时间
    // 同时存储token值以避免后续查找问题
    const historyRecord = {
        requestId: requestId,
        url: data.url,
        mode: data.mode,
        success: result.code === 200,
        timestamp: new Date(),
        responseTime: requestStartTime ? Date.now() - requestStartTime.getTime() : 0
    }
    
    // 如果成功且有token，直接存储在历史记录中
    if (result.code === 200) {
        if (result.token) {
            historyRecord.token = result.token
        } else if (result.cf_clearance) {
            historyRecord.cfcookie = result.cf_clearance
        }
    }
    
    global.monitoringData.requestHistory.unshift(historyRecord)
    
    // 只保留最近100条历史
    if (global.monitoringData.requestHistory.length > 100) {
        global.monitoringData.requestHistory = global.monitoringData.requestHistory.slice(0, 100)
    }
    
    // 检查内存使用情况
    const memStats = memoryManager.checkMemoryUsage()
    if (memStats.heapUsagePercent > 0.8) {
        logger.memoryWarning('high', Math.round(memStats.heapUsed / 1024 / 1024), Math.round(memStats.heapTotal / 1024 / 1024), Math.round(memStats.heapUsagePercent * 100))
    }

    // 释放全局管理器资源
    globalRequestManager.releaseProcessing(requestId)

    res.status(result.code ?? 500).send(result)
}

// 监控API端点  
app.get('/api/monitor', (_, res) => {
    try {
        const memStats = memoryManager.getMemoryStats()
        const uptime = Date.now() - global.monitoringData.startTime.getTime()
        
        const monitorData = {
            // 基本状态
            status: 'running',
            uptime: uptime,
            startTime: global.monitoringData.startTime,
            
            // 实例信息（基于请求计数）
            instances: {
                total: global.maxConcurrentRequests,
                active: global.activeRequestCount,
                available: global.maxConcurrentRequests - global.activeRequestCount
            },
            
            // 请求统计
            requests: {
                total: global.monitoringData.totalRequests,
                successful: global.monitoringData.successfulRequests,
                failed: global.monitoringData.failedRequests,
                active: global.monitoringData.activeRequests.size,
                successRate: global.monitoringData.totalRequests > 0 ? 
                    (global.monitoringData.successfulRequests / global.monitoringData.totalRequests * 100).toFixed(2) : 0
            },
            
            // 新增：今日统计
            todayStats: global.statsManager ? global.statsManager.getTodayStats() : null,
            
            // 新增：计费信息
            billing: global.statsManager ? global.statsManager.calculateBilling() : null,
            
            // 新增：URL统计（前10）
            urlStats: global.statsManager ? global.statsManager.getTopUrlStats(10) : [],
            
            // 新增：IP统计（前10）
            ipStats: global.statsManager ? global.statsManager.getTopIpStats(10) : [],
            
            // 全局队列统计
            globalQueue: globalRequestManager.getDetailedStats(),

            // 动态并发限制信息
            dynamicLimit: globalRequestManager.getDynamicLimitInfo(),

            // 系统压力等级
            pressureLevel: memoryManager.getPressureLevel(),
            
            // 活跃请求详情
            activeRequests: Array.from(global.monitoringData.activeRequests.values()).map(req => ({
                id: req.id,
                url: req.url,
                mode: req.mode,
                startTime: req.startTime,
                duration: Date.now() - req.startTime.getTime(),
                clientIP: req.clientIP
            })),
            
            // 最近的token
            recentTokens: global.monitoringData.recentTokens.slice(0, 30),
            
            // 请求历史
            requestHistory: global.monitoringData.requestHistory.slice(0, 20),
            
            // 内存信息
            memory: memStats,
            
            // 浏览器上下文信息
            browserContexts: global.browserContexts ? global.browserContexts.size : 0,

            // Turnstile上下文池统计
            contextPool: (() => {
                const pool = getContextPool();
                return pool ? pool.getStats() : null;
            })(),

            // 按服务分组的活跃请求
            activeRequestsByService: global.monitoringData.activeRequestsByService,
            
            // 时间戳
            timestamp: new Date()
        }
        
        res.json(monitorData)
    } catch (error) {
        logger.error('API', `监控接口错误: ${error.message}`)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// 计费统计API端点
app.get('/api/billing', (_, res) => {
    try {
        const billingData = global.statsManager.calculateBilling()
        
        // 添加详细的计费统计信息
        const detailedBilling = {
            ...billingData,
            // 计费规则说明
            billingRule: {
                rate: 0.6,
                unit: 'per 1000 requests',
                currency: 'USD',
                includesFailedRequests: true
            },
            // 今日详细统计
            todayDetails: {
                date: global.monitoringData.dailyStats.date,
                totalRequests: global.monitoringData.dailyStats.requests,
                successfulRequests: global.monitoringData.dailyStats.successful,
                failedRequests: global.monitoringData.dailyStats.failed,
                billing: global.monitoringData.dailyStats.billing
            },
            // 历史统计
            historicalData: {
                totalBilling: global.monitoringData.historicalData.totalBilling,
                allTimeRequests: global.monitoringData.totalRequests
            },
            // 时间戳
            timestamp: new Date()
        }
        
        res.json(detailedBilling)
    } catch (error) {
        logger.error('API', `计费接口错误: ${error.message}`)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// 重置监控数据
app.post('/api/monitor/reset', (_, res) => {
    // 销毁旧的统计管理器
    if (global.statsManager) {
        global.statsManager.destroy()
    }
    
    // 重置监控数据
    global.monitoringData = {
        // 基础统计
        startTime: new Date(),
        totalRequests: 0,
        successfulRequests: 0,
        failedRequests: 0,
        activeRequests: new Map(),
        recentTokens: [],
        requestHistory: [],
        activeRequestsByService: {
            cloudflare: 0
        },
        lastRequestTime: new Date(),
        
        // 新增统计字段
        dailyStats: {
            date: new Date().toDateString(),
            requests: 0,
            successful: 0,
            failed: 0,
            billing: 0
        },
        
        // URL统计
        urlStats: new Map(),
        
        // IP统计
        ipStats: new Map(),
        
        // 历史数据
        historicalData: {
            totalBilling: 0,
            urlHistory: {},
            ipHistory: {}
        }
    }
    
    // 重新初始化统计管理器
    global.statsManager = new StatsManager()
    
    res.json({ message: 'Monitor data reset successfully' })
})

// 服务重启端点
app.post('/api/service/restart', async (_, res) => {
    try {
        logger.serverRestarting('手动触发')
        
        // 清理浏览器实例和上下文
        await cleanupBrowserInstances()
        
        // 销毁旧的统计管理器
        if (global.statsManager) {
            global.statsManager.destroy()
        }
        
        // 重置监控数据
        global.monitoringData = {
            // 基础统计
            startTime: new Date(),
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            activeRequests: new Map(),
            recentTokens: [],
            requestHistory: [],
            activeRequestsByService: {
                cloudflare: 0
            },
            lastRequestTime: new Date(),
            
            // 新增统计字段
            dailyStats: {
                date: new Date().toDateString(),
                requests: 0,
                successful: 0,
                failed: 0,
                billing: 0
            },
            
            // URL统计
            urlStats: new Map(),
            
            // IP统计
            ipStats: new Map(),
            
            // 历史数据
            historicalData: {
                totalBilling: 0,
                urlHistory: {},
                ipHistory: {}
            }
        }
        
        // 重新初始化统计管理器
        global.statsManager = new StatsManager()
        
        // 重置活跃请求计数
        global.activeRequestCount = 0
        
        // 触发内存清理
        memoryManager.forceCleanup()
        
        // 重新初始化浏览器（延迟执行避免阻塞响应）
        setTimeout(async () => {
            try {
                logger.debug('系统', '等待系统稳定后重新初始化...')

                // 等待更长时间确保所有清理完成
                await new Promise(resolve => setTimeout(resolve, 3000))

                // 重置重启标志
                global.restarting = false

                if (process.env.SKIP_LAUNCH != 'true') {
                    logger.debug('系统', '开始重新初始化浏览器...')
                    await require('../captcha-solvers/turnstile/module/createBrowser')()
                }
                logger.info('系统', '服务重启完成')
            } catch (error) {
                logger.error('系统', `重新初始化浏览器失败: ${error.message}`)
                // 确保即使失败也重置标志
                global.restarting = false
            }
        }, 1000)
        
        res.json({ 
            message: 'Service restart initiated successfully',
            timestamp: new Date(),
            status: 'restarting'
        })
        
    } catch (error) {
        logger.error('系统', `服务重启失败: ${error.message}`)
        res.status(500).json({
            message: 'Service restart failed: ' + error.message
        })
    }
})

// 清理浏览器实例的函数
async function cleanupBrowserInstances() {
    try {
        logger.info('浏览器', '开始清理实例和上下文...')

        // 设置标志阻止自动重连
        global.restarting = true

        // 清理浏览器上下文池
        if (global.contextPool && typeof global.contextPool.cleanup === 'function') {
            await global.contextPool.cleanup()
        }

        // 清理全局浏览器上下文
        if (global.browserContexts) {
            for (const context of global.browserContexts.values()) {
                try {
                    await context.close()
                } catch (e) {
                    logger.debug('上下文', `关闭时出现警告: ${e.message}`)
                }
            }
            global.browserContexts.clear()
        }

        // 清理全局浏览器实例
        if (global.browser) {
            try {
                // 移除事件监听器避免重连
                global.browser.removeAllListeners('disconnected')
                await global.browser.close()
                global.browser = null
            } catch (e) {
                logger.debug('浏览器', `关闭时出现警告: ${e.message}`)
            }
        }

        logger.info('浏览器', '实例清理完成')

    } catch (error) {
        logger.error('浏览器', `清理实例失败: ${error.message}`)
        throw error
    }
}

// 启动自动重启检查
function startAutoRestartCheck() {
    logger.info('系统', `启动自动重启检查 (${global.autoRestartConfig.idleTimeThreshold / (60 * 60 * 1000)}小时无请求后重启)`)

    global.autoRestartTimer = setInterval(async () => {
        try {
            const now = new Date()
            const timeSinceLastRequest = now.getTime() - global.monitoringData.lastRequestTime.getTime()

            // 更新检查时间
            global.autoRestartConfig.lastCheckTime = now

            // 检查是否有活跃请求
            const hasActiveRequests = global.monitoringData.activeRequests.size > 0

            // 如果有活跃请求，跳过重启检查
            if (hasActiveRequests) {
                logger.debug('系统', '跳过自动重启检查: 有活跃请求')
                return
            }

            // 检查是否超过空闲时间阈值
            if (timeSinceLastRequest >= global.autoRestartConfig.idleTimeThreshold) {
                const idleHours = Math.round(timeSinceLastRequest / (60 * 60 * 1000) * 10) / 10
                logger.info('系统', `服务空闲超过 ${idleHours} 小时，开始自动重启...`)

                // 执行自动重启
                await performAutoRestart()

            } else {
                const hoursUntilRestart = Math.round((global.autoRestartConfig.idleTimeThreshold - timeSinceLastRequest) / (60 * 60 * 1000) * 10) / 10
                logger.debug('系统', `自动重启检查: 服务正常，距离自动重启还有 ${hoursUntilRestart} 小时`)
            }

        } catch (error) {
            logger.error('系统', `自动重启检查失败: ${error.message}`)
        }
    }, global.autoRestartConfig.checkInterval)

    logger.debug('系统', `自动重启检查已启动，每 ${global.autoRestartConfig.checkInterval / (60 * 1000)} 分钟检查一次`)
}

// 执行自动重启
async function performAutoRestart() {
    try {
        logger.serverRestarting('自动触发（空闲超时）')
        
        // 清理浏览器实例和上下文
        await cleanupBrowserInstances()
        
        // 销毁旧的统计管理器
        if (global.statsManager) {
            global.statsManager.destroy()
        }
        
        // 重置监控数据
        global.monitoringData = {
            // 基础统计
            startTime: new Date(),
            totalRequests: 0,
            successfulRequests: 0,
            failedRequests: 0,
            activeRequests: new Map(),
            recentTokens: [],
            requestHistory: [],
            activeRequestsByService: {
                cloudflare: 0
            },
            lastRequestTime: new Date(),
            
            // 新增统计字段
            dailyStats: {
                date: new Date().toDateString(),
                requests: 0,
                successful: 0,
                failed: 0,
                billing: 0
            },
            
            // URL统计
            urlStats: new Map(),
            
            // IP统计
            ipStats: new Map(),
            
            // 历史数据
            historicalData: {
                totalBilling: 0,
                urlHistory: {},
                ipHistory: {}
            }
        }
        
        // 重新初始化统计管理器
        global.statsManager = new StatsManager()
        
        // 重置活跃请求计数
        global.activeRequestCount = 0
        
        // 触发内存清理
        memoryManager.forceCleanup()
        
        // 重新初始化浏览器
        setTimeout(async () => {
            try {
                logger.debug('系统', '自动重启等待系统稳定后重新初始化...')

                // 等待更长时间确保所有清理完成
                await new Promise(resolve => setTimeout(resolve, 3000))

                // 重置重启标志
                global.restarting = false

                if (process.env.SKIP_LAUNCH != 'true') {
                    logger.debug('系统', '自动重启开始重新初始化浏览器...')
                    await require('../captcha-solvers/turnstile/module/createBrowser')()
                }
                logger.info('系统', '自动重启完成')
            } catch (error) {
                logger.error('系统', `自动重启重新初始化浏览器失败: ${error.message}`)
                // 确保即使失败也重置标志
                global.restarting = false
            }
        }, 1000)

    } catch (error) {
        logger.error('系统', `自动重启失败: ${error.message}`)
    }
}

// 队列状态API端点
app.get('/api/queue-status', (_, res) => {
    try {
        // 获取站点队列统计
        const siteQueueManager = require('../captcha-solvers/turnstile/utils/siteQueueManager');
        
        const queueStatus = {
            global: globalRequestManager.getDetailedStats(),
            sites: siteQueueManager.getStats(),
            timestamp: new Date()
        }
        
        res.json(queueStatus)
    } catch (error) {
        res.status(500).json({ error: error.message })
    }
})

// 健康检查端点
app.get('/health', (_, res) => {
    res.status(200).send('healthy\n')
})

app.use((_, res) => { res.status(404).json({ code: 404, message: 'Not Found' }) })

process.on('uncaughtException', (err) => {
  logger.error('系统', `未捕获异常: ${err.message}`);
});

process.on('unhandledRejection', (reason, promise) => {
  logger.error('系统', `未处理的Promise拒绝: ${reason}`);
});

app.use((err, _, res, __) => {
  logger.error('Express', `请求处理错误: ${err.message}`);
  res.status(500).json({
    code: 500,
    message: 'Internal Server Error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined
  });
});

// 清理函数用于测试
function cleanup() {
    memoryManager.stopMonitoring()
    if (global.cleanupTimer) {
        clearInterval(global.cleanupTimer)
    }
    if (global.autoRestartTimer) {
        clearInterval(global.autoRestartTimer)
    }
    if (global.statsManager) {
        global.statsManager.destroy()
    }
}

if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    module.exports = { app, cleanup }
} else {
    module.exports = app
}
