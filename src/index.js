// 加载根目录的统一配置文件
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const express = require('express')
const app = express()
const port = process.env.PORT || 3000
const bodyParser = require('body-parser')
const authToken = process.env.AUTH_TOKEN || process.env.authToken || null // 兼容旧格式
const cors = require('cors')
const reqValidate = require('../captcha-solvers/turnstile/module/reqValidate')
const memoryManager = require('./utils/memoryManager')
const capacityManager = require('./utils/capacityManager')

// 请求计数器（替代浏览器实例计数）
global.activeRequestCount = 0
global.maxConcurrentRequests = Number(process.env.MAX_CONCURRENT_REQUESTS) || 60
global.timeOut = Number(process.env.TIMEOUT || process.env.timeOut || 300000) // 兼容旧格式
global.memoryCleanupInterval = Number(process.env.MEMORY_CLEANUP_INTERVAL || process.env.memoryCleanupInterval) || 300000
global.maxMemoryUsage = Number(process.env.MAX_MEMORY_USAGE || process.env.maxMemoryUsage) || 512 // MB

// 监控数据
global.monitoringData = {
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
    lastRequestTime: new Date() // 最后一次请求时间
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

// 测试页面
app.get('/test', (req, res) => {
    res.sendFile(require('path').join(__dirname, '../test_monitor.html'));
})
// 统一启动服务器，不区分环境
let server = app.listen(port, '0.0.0.0', () => {
    console.log(`Server running on port ${port}`)
    console.log(`Local access: http://localhost:${port}`)
    console.log(`Network access: http://0.0.0.0:${port}`)
})
try {
    server.timeout = global.timeOut
} catch (e) { }
if (process.env.SKIP_LAUNCH != 'true') require('../captcha-solvers/turnstile/module/createBrowser')

// 启动内存监控和容量管理（仅在非测试环境）
if (process.env.NODE_ENV !== 'test') {
    memoryManager.startMonitoring()
    capacityManager.startMonitoring()
}

const getSource = require('../captcha-solvers/turnstile/endpoints/getSource')
const solveTurnstileMin = require('../captcha-solvers/turnstile/endpoints/solveTurnstile.min')
const solveTurnstileMax = require('../captcha-solvers/turnstile/endpoints/solveTurnstile.max')
const wafSession = require('../captcha-solvers/turnstile/endpoints/wafSession')
const getCfClearance = require('../captcha-solvers/turnstile/endpoints/cfcookieService')

// 统一验证码处理接口 - 根路径
app.post('/', async (req, res) => {
    try {
        const { type } = req.body;

        if (!type) {
            return res.status(400).json({
                code: 400,
                message: 'Missing required parameter: type. Supported types: cftoken, cfcookie',
                token: null
            });
        }

        switch (type.toLowerCase()) {
            case 'cftoken':
                return await handleCftokenRequest(req, res);
            
            case 'cfcookie':
                return await handleCfcookieRequest(req, res);
            
            default:
                return res.status(400).json({
                    code: 400,
                    message: `Unsupported type: ${type}. Supported types: cftoken, cfcookie`,
                    token: null
                });
        }
    } catch (error) {
        console.error('Error in unified captcha handler:', error);
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
        authToken: data.authToken
    };

    // 处理请求
    return handleClearanceRequest(req, res, internalData);
}

// 处理 cfcookie 请求
async function handleCfcookieRequest(req, res) {
    const data = req.body;

    // 参数验证
    if (!data.websiteUrl) {
        return res.status(400).json({ 
            code: 400, 
            message: 'websiteUrl is required',
            token: null 
        });
    }

    // 转换为内部格式
    const internalData = {
        url: data.websiteUrl,
        mode: 'cfcookie',
        proxy: data.proxy,
        authToken: data.authToken
    };

    // 处理请求
    return handleClearanceRequest(req, res, internalData);
}

// 通用请求处理函数
async function handleClearanceRequest(req, res, data) {
    // 验证 authToken
    if (authToken && data.authToken !== authToken) {
        return res.status(401).json({ code: 401, message: 'Unauthorized: Invalid auth token' })
    }

    // 检查并发请求数
    if (global.activeRequestCount >= global.maxConcurrentRequests) {
        return res.status(429).json({ code: 429, message: 'Too many concurrent requests' })
    }

    // 增加活跃请求计数
    global.activeRequestCount++
    
    // 更新监控数据
    global.monitoringData.totalRequests++
    
    // 更新最后请求时间
    global.monitoringData.lastRequestTime = new Date()
    
    // 生成请求ID
    const requestId = Date.now() + '_' + Math.random().toString(36).substring(2, 11)
    
    // 记录活跃请求
    global.monitoringData.activeRequests.set(requestId, {
        id: requestId,
        url: data.url,
        mode: data.mode,
        startTime: new Date(),
        clientIP: req.ip || req.socket.remoteAddress
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
        console.log('Request timeout, cleaning up')
    }, global.timeOut + 5000)

    let result;
    try {
        switch (data.mode) {
            case "source":
                result = await getSource(data).then(res => { return { source: res, code: 200 } }).catch(err => {
                    console.error('getSource error:', err.message);
                    return { code: 500, message: err.message }
                })
                break;
            case "turnstile-min":
                result = await solveTurnstileMin(data).then(res => { return { token: res, code: 200 } }).catch(err => {
                    console.error('solveTurnstileMin error:', err.message);
                    return { code: 500, message: err.message }
                })
                break;
            case "turnstile-max":
                result = await solveTurnstileMax(data).then(res => { return { token: res, code: 200 } }).catch(err => {
                    console.error('solveTurnstileMax error:', err.message);
                    return { code: 500, message: err.message }
                })
                break;
            case "waf-session":
                result = await wafSession(data).then(res => { return { ...res, code: 200 } }).catch(err => {
                    console.error('wafSession error:', err.message);
                    return { code: 500, message: err.message }
                })
                break;
            case "cfcookie":
                result = await getCfClearance(data).then(res => {
                    // 如果返回的是字符串（旧格式），转换为新格式
                    if (typeof res === 'string') {
                        return { cf_clearance: res, code: 200 };
                    }
                    // 如果返回的是对象（新格式），直接使用
                    return { ...res, code: 200 };
                }).catch(err => {
                    console.error('getCfClearance error:', err.message);
                    return { code: 500, message: err.message }
                })
                break;
            default:
                result = { code: 400, message: 'Invalid mode' }
        }
    } catch (error) {
        console.error('Switch statement error:', error);
        result = { code: 500, message: `Unexpected error: ${error.message}` };
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
    
    // 记录请求历史
    const requestDuration = requestStartTime ? (new Date() - requestStartTime) : 0
    const historyEntry = {
        id: requestId,
        url: data.url,
        mode: data.mode,
        startTime: requestStartTime,
        endTime: new Date(),
        duration: requestDuration,
        success: result.code === 200,
        clientIP: req.ip || req.socket.remoteAddress,
        // 为监控页面兼容性添加的字段
        timestamp: requestStartTime,
        responseTime: requestDuration
    }
    
    global.monitoringData.requestHistory.unshift(historyEntry)
    
    // 只保留最近100个请求历史
    if (global.monitoringData.requestHistory.length > 100) {
        global.monitoringData.requestHistory = global.monitoringData.requestHistory.slice(0, 100)
    }
    
    // 更新成功/失败计数
    if (result.code === 200) {
        global.monitoringData.successfulRequests++
        
        // 记录token或cf_clearance（如果有）
        let tokenValue = null;
        if (result.token) {
            tokenValue = result.token;
        } else if (result.cf_clearance) {
            tokenValue = result.cf_clearance;
        }

        if (tokenValue) {
            global.monitoringData.recentTokens.unshift({
                token: tokenValue,
                url: data.url,
                mode: data.mode,
                timestamp: new Date(),
                requestId: requestId
            })

            // 只保留最近50个token
            if (global.monitoringData.recentTokens.length > 50) {
                global.monitoringData.recentTokens = global.monitoringData.recentTokens.slice(0, 50)
            }
        }
    } else {
        global.monitoringData.failedRequests++
    }
    
    res.json(result)
}

// 监控API
app.get('/api/monitor', (_, res) => {
    try {
        // 计算活跃请求数
        const activeRequestCount = global.monitoringData.activeRequests.size
        
        // 计算成功率
        const totalCompleted = global.monitoringData.successfulRequests + global.monitoringData.failedRequests
        const successRate = totalCompleted > 0 ? (global.monitoringData.successfulRequests / totalCompleted * 100).toFixed(2) : 0
        
        // 获取运行时间
        const uptime = new Date() - global.monitoringData.startTime
        const uptimeHours = Math.floor(uptime / (1000 * 60 * 60))
        const uptimeMinutes = Math.floor((uptime % (1000 * 60 * 60)) / (1000 * 60))
        
        // 获取增强的内存使用情况
        const memoryStats = memoryManager.getMemoryStats()
        const memoryUsage = process.memoryUsage()
        const memoryUsageMB = (memoryUsage.rss / 1024 / 1024).toFixed(2)
        const memoryUsagePercent = (memoryUsageMB / global.maxMemoryUsage * 100).toFixed(2)
        
        // 获取浏览器实例信息
        const browserContextsCount = global.browserContexts ? global.browserContexts.size : 0;
        const contextPoolSize = global.contextPool ? global.contextPool.available.length : 0;
        // 优先使用智能容量管理器的值
        const maxContexts = capacityManager.contextPoolSize || (global.contextPool ? global.contextPool.maxSize : 20);
        const contextPoolStatus = global.contextPool ? global.contextPool.getPoolStatus() : null;

        // 构建监控数据
        const monitorData = {
            status: 'running',
            startTime: global.monitoringData.startTime,
            uptime: {
                hours: uptimeHours,
                minutes: uptimeMinutes,
                formatted: `${uptimeHours}h ${uptimeMinutes}m`
            },
            requests: {
                total: global.monitoringData.totalRequests,
                active: activeRequestCount,
                successful: global.monitoringData.successfulRequests,
                failed: global.monitoringData.failedRequests,
                successRate: `${successRate}%`
            },
            activeRequestsByService: global.monitoringData.activeRequestsByService,
            instances: {
                total: maxContexts,
                active: browserContextsCount,
                available: contextPoolSize,
                used: browserContextsCount
            },
            memory: {
                used: `${memoryUsageMB} MB`,
                max: `${global.maxMemoryUsage} MB`,
                percent: `${memoryUsagePercent}%`,
                system: memoryStats ? {
                    used: memoryStats.system.used,
                    total: memoryStats.system.total,
                    free: memoryStats.system.free,
                    available: memoryStats.system.available
                } : {
                    used: parseFloat(memoryUsageMB),
                    total: global.maxMemoryUsage,
                    free: global.maxMemoryUsage - parseFloat(memoryUsageMB)
                },
                process: memoryStats ? memoryStats.process : null,
                cpu: memoryStats ? memoryStats.cpu : { current: 0 },
                management: {
                    mode: memoryManager.memoryManagementMode || 'manual',
                    pressureLevel: memoryStats ? (memoryStats.pressureLevel || '未知') : '未知',
                    maxHeapUsage: memoryManager.maxHeapUsage
                }
            },
            performance: {
                contextPool: contextPoolStatus,
                memoryPressureHistory: memoryManager.memoryPressureHistory ?
                    memoryManager.memoryPressureHistory.slice(-10) : [],
                capacity: capacityManager.getCapacityStatus()
            },
            activeRequests: Array.from(global.monitoringData.activeRequests.values()),
            recentTokens: global.monitoringData.recentTokens,
            requestHistory: global.monitoringData.requestHistory,
            lastRequestTime: global.monitoringData.lastRequestTime
        }
        
        res.json(monitorData)
    } catch (error) {
        console.error('Monitor API error:', error)
        res.status(500).json({ error: 'Internal server error' })
    }
})

// 重置监控数据
app.post('/api/monitor/reset', (_, res) => {
    global.monitoringData = {
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
        lastRequestTime: new Date()
    }
    res.json({ message: 'Monitor data reset successfully' })
})

// 服务重启端点
app.post('/api/service/restart', async (_, res) => {
    try {
        console.log('🔄 开始重启服务...')
        
        // 清理浏览器实例和上下文
        await cleanupBrowserInstances()
        
        // 重置监控数据
        global.monitoringData = {
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
            lastRequestTime: new Date()
        }
        
        // 重置活跃请求计数
        global.activeRequestCount = 0
        
        // 触发内存清理
        memoryManager.forceCleanup()
        
        // 重新初始化浏览器（延迟执行避免阻塞响应）
        setTimeout(async () => {
            try {
                console.log('🔄 等待系统稳定后重新初始化...')
                
                // 等待更长时间确保所有清理完成
                await new Promise(resolve => setTimeout(resolve, 3000))
                
                // 重置重启标志
                global.restarting = false
                
                if (process.env.SKIP_LAUNCH != 'true') {
                    console.log('🚀 开始重新初始化浏览器...')
                    await require('../captcha-solvers/turnstile/module/createBrowser')()
                }
                console.log('✅ 服务重启完成')
            } catch (error) {
                console.error('❌ 重新初始化浏览器失败:', error.message)
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
        console.error('❌ 服务重启失败:', error.message)
        res.status(500).json({ 
            error: 'Service restart failed',
            message: error.message
        })
    }
})

// 清理浏览器实例
async function cleanupBrowserInstances() {
    try {
        console.log('🧹 清理浏览器实例...')
        
        // 设置重启标志
        global.restarting = true
        
        // 等待所有活跃请求完成
        if (global.monitoringData.activeRequests.size > 0) {
            console.log(`⏳ 等待 ${global.monitoringData.activeRequests.size} 个活跃请求完成...`)
            
            // 最多等待10秒
            const maxWait = 10000
            const startWait = Date.now()
            
            while (global.monitoringData.activeRequests.size > 0 && (Date.now() - startWait < maxWait)) {
                await new Promise(resolve => setTimeout(resolve, 500))
            }
            
            if (global.monitoringData.activeRequests.size > 0) {
                console.log(`⚠️ 仍有 ${global.monitoringData.activeRequests.size} 个活跃请求，但已达到最大等待时间`)
            } else {
                console.log('✅ 所有活跃请求已完成')
            }
        }
        
        // 关闭浏览器实例
        if (global.browser) {
            console.log('🔒 关闭主浏览器实例...')
            try {
                await global.browser.close()
                global.browser = null
            } catch (e) {
                console.error('关闭浏览器实例失败:', e.message)
            }
        }
        
        // 关闭上下文池
        if (global.contextPool) {
            console.log('🔒 关闭浏览器上下文池...')
            try {
                await global.contextPool.closeAll()
            } catch (e) {
                console.error('关闭上下文池失败:', e.message)
            }
        }
        
        console.log('✅ 浏览器实例清理完成')
        
    } catch (error) {
        console.error('❌ 清理浏览器实例失败:', error.message)
        throw error
    }
}

// 启动自动重启检查
function startAutoRestartCheck() {
    console.log('🔄 启动自动重启检查 (6小时无请求后重启)')
    
    global.autoRestartTimer = setInterval(async () => {
        try {
            const now = new Date()
            const timeSinceLastRequest = now.getTime() - global.monitoringData.lastRequestTime.getTime()
            const timeSinceLastCheck = now.getTime() - global.autoRestartConfig.lastCheckTime.getTime()
            
            // 更新检查时间
            global.autoRestartConfig.lastCheckTime = now
            
            // 检查是否有活跃请求
            const hasActiveRequests = global.monitoringData.activeRequests.size > 0
            
            // 如果有活跃请求，跳过重启检查
            if (hasActiveRequests) {
                console.log('⏭️  跳过自动重启检查: 有活跃请求')
                return
            }
            
            // 检查是否超过空闲时间阈值
            if (timeSinceLastRequest >= global.autoRestartConfig.idleTimeThreshold) {
                console.log(`🔄 检测到服务空闲超过 ${global.autoRestartConfig.idleTimeThreshold / (60 * 60 * 1000)} 小时，开始自动重启...`)
                console.log(`📊 最后请求时间: ${global.monitoringData.lastRequestTime.toLocaleString('zh-CN')}`)
                console.log(`📊 当前时间: ${now.toLocaleString('zh-CN')}`)
                console.log(`📊 空闲时间: ${Math.round(timeSinceLastRequest / (60 * 60 * 1000) * 10) / 10} 小时`)
                
                // 执行自动重启
                await performAutoRestart()
                
            } else {
                const hoursUntilRestart = Math.round((global.autoRestartConfig.idleTimeThreshold - timeSinceLastRequest) / (60 * 60 * 1000) * 10) / 10
                console.log(`✅ 自动重启检查: 服务正常，距离自动重启还有 ${hoursUntilRestart} 小时`)
            }
            
        } catch (error) {
            console.error('❌ 自动重启检查失败:', error.message)
        }
    }, global.autoRestartConfig.checkInterval)
    
    console.log(`⏰ 自动重启检查已启动，每 ${global.autoRestartConfig.checkInterval / (60 * 1000)} 分钟检查一次`)
}

// 执行自动重启
async function performAutoRestart() {
    try {
        console.log('🤖 执行自动重启...')
        
        // 清理浏览器实例和上下文
        await cleanupBrowserInstances()
        
        // 重置监控数据
        global.monitoringData = {
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
            lastRequestTime: new Date()
        }
        
        // 重置活跃请求计数
        global.activeRequestCount = 0
        
        // 触发内存清理
        memoryManager.forceCleanup()
        
        // 重新初始化浏览器
        setTimeout(async () => {
            try {
                console.log('🔄 自动重启等待系统稳定后重新初始化...')
                
                // 等待更长时间确保所有清理完成
                await new Promise(resolve => setTimeout(resolve, 3000))
                
                // 重置重启标志
                global.restarting = false
                
                if (process.env.SKIP_LAUNCH != 'true') {
                    console.log('🚀 自动重启开始重新初始化浏览器...')
                    await require('../captcha-solvers/turnstile/module/createBrowser')()
                }
                console.log('✅ 自动重启完成')
            } catch (error) {
                console.error('❌ 自动重启重新初始化浏览器失败:', error.message)
                // 确保即使失败也重置标志
                global.restarting = false
            }
        }, 1000)
        
    } catch (error) {
        console.error('❌ 自动重启失败:', error.message)
    }
}

// 健康检查端点
app.get('/health', (_, res) => {
    res.status(200).send('healthy\n')
})

// 浏览器状态检查端点
app.get('/browser-status', (_, res) => {
    const status = {
        browserExists: !!global.browser,
        browserInitFailed: !!global.browserInitFailed,
        restarting: !!global.restarting,
        contextPoolExists: !!global.contextPool,
        contextPoolSize: global.contextPool ? global.contextPool.available.length : 0,
        browserContextsCount: global.browserContexts ? global.browserContexts.size : 0
    };
    res.json(status);
})

// 性能统计端点
app.get('/api/performance', (_, res) => {
    try {
        const memoryStats = memoryManager.getMemoryStats();
        const contextPoolStatus = global.contextPool ? global.contextPool.getPoolStatus() : null;

        const performanceData = {
            timestamp: new Date(),
            memory: {
                management: {
                    mode: memoryManager.memoryManagementMode || 'manual',
                    systemTotalMB: memoryManager.systemTotalMemoryMB,
                    currentLimitMB: memoryManager.maxHeapUsage,
                    pressureLevel: memoryStats.pressureLevel || '未知'
                },
                process: memoryStats.process,
                system: memoryStats.system,
                cpu: memoryStats.cpu,
                pressureHistory: memoryManager.memoryPressureHistory ?
                    memoryManager.memoryPressureHistory.slice(-20) : []
            },
            contextPool: contextPoolStatus,
            capacity: capacityManager.getCapacityStatus(),
            requests: {
                active: global.monitoringData.activeRequests.size,
                total: global.monitoringData.totalRequests,
                successful: global.monitoringData.successfulRequests,
                failed: global.monitoringData.failedRequests,
                successRate: global.monitoringData.totalRequests > 0 ?
                    ((global.monitoringData.successfulRequests / global.monitoringData.totalRequests) * 100).toFixed(2) + '%' : '0%'
            },
            uptime: {
                startTime: global.monitoringData.startTime,
                uptimeMs: Date.now() - global.monitoringData.startTime.getTime(),
                lastRequestTime: global.monitoringData.lastRequestTime
            }
        };

        res.json(performanceData);
    } catch (error) {
        console.error('获取性能数据失败:', error.message);
        res.status(500).json({ error: '获取性能数据失败', message: error.message });
    }
})

// 启动自动重启检查
if (process.env.NODE_ENV !== 'test') {
    startAutoRestartCheck()
}

// 导出app实例（用于测试）
module.exports = app
