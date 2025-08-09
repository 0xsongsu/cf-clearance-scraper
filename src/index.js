// 加载根目录的统一配置文件
require('dotenv').config({ path: require('path').join(__dirname, '../.env') })

const express = require('express')
const app = express()
const port = process.env.PORT || 3001
const bodyParser = require('body-parser')
const authToken = process.env.AUTH_TOKEN || process.env.authToken || null // 兼容旧格式
const cors = require('cors')
const reqValidate = require('../captcha-solvers/turnstile/module/reqValidate')
const memoryManager = require('./utils/memoryManager')

// 请求计数器（替代浏览器实例计数）
global.activeRequestCount = 0
global.maxConcurrentRequests = Number(process.env.MAX_CONCURRENT_REQUESTS) || 60
global.timeOut = Number(process.env.TIMEOUT || process.env.timeOut || 300000) // 兼容旧格式
global.memoryCleanupInterval = Number(process.env.MEMORY_CLEANUP_INTERVAL || process.env.memoryCleanupInterval) || 300000
global.maxMemoryUsage = Number(process.env.MAX_MEMORY_USAGE || process.env.maxMemoryUsage) || 4096 // MB

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
if (process.env.NODE_ENV !== 'development') {
    let server = app.listen(port, '0.0.0.0', () => { 
        console.log(`Server running on port ${port}`)
        console.log(`Local access: http://localhost:${port}`)
        console.log(`Network access: http://0.0.0.0:${port}`)
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

// 启动自动重启检查（仅在非测试环境）
if (process.env.NODE_ENV !== 'test' && global.autoRestartConfig.enabled) {
    startAutoRestartCheck()
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
                message: 'Missing required parameter: type. Supported types: cftoken, cf5s',
                token: null
            });
        }

        switch (type.toLowerCase()) {
            case 'cftoken':
                return await handleCftokenRequest(req, res);
            
            case 'cf5s':
                return await handleCf5sRequest(req, res);
            
            default:
                return res.status(400).json({
                    code: 400,
                    message: `Unsupported type: ${type}. Supported types: cftoken, cf5s`,
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
        authToken: data.authToken
    };

    // 处理请求
    return handleClearanceRequest(req, res, internalData);
}


// 保留原始API格式支持 (向后兼容)
app.post('/cf-clearance-scraper', async (req, res) => {
    const data = req.body
    return handleClearanceRequest(req, res, data)
})

// 统一的请求处理函数
async function handleClearanceRequest(req, res, data) {
    const check = reqValidate(data)

    if (check !== true) return res.status(400).json({ code: 400, message: 'Bad Request', schema: check })

    if (authToken && data.authToken !== authToken) return res.status(401).json({ code: 401, message: 'Unauthorized' })

    if (global.activeRequestCount >= global.maxConcurrentRequests) return res.status(429).json({ code: 429, message: 'Too Many Requests' })

    if (process.env.SKIP_LAUNCH != 'true' && !global.browser) return res.status(500).json({ code: 500, message: 'The scanner is not ready yet. Please try again a little later.' })

    var result = { code: 500 }

    global.activeRequestCount++
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

    switch (data.mode) {
        case "source":
            result = await getSource(data).then(res => { return { source: res, code: 200 } }).catch(err => { return { code: 500, message: err.message } })
            break;
        case "turnstile-min":
            result = await solveTurnstileMin(data).then(res => { return { token: res, code: 200 } }).catch(err => { return { code: 500, message: err.message } })
            break;
        case "turnstile-max":
            result = await solveTurnstileMax(data).then(res => { return { token: res, code: 200 } }).catch(err => { return { code: 500, message: err.message } })
            break;
        case "waf-session":
            result = await wafSession(data).then(res => { return { ...res, code: 200 } }).catch(err => { return { code: 500, message: err.message } })
            break;
        case "cfcookie":
        case "cf5s":
            result = await getCfClearance(data).then(res => { 
                // 如果是 cf5s 模式，返回完整信息
                if (data.mode === 'cf5s' && typeof res === 'object' && res.cf_clearance) {
                    return res;
                }
                // 兼容旧格式
                return { cf_clearance: res, code: 200 } 
            }).catch(err => { return { code: 500, message: err.message } })
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
    
    if (result.code === 200) {
        global.monitoringData.successfulRequests++
        
        // 记录token（如果有）
        if (result.token) {
            global.monitoringData.recentTokens.unshift({
                token: result.token,
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
    
    // 记录请求历史 - 使用之前获取的开始时间
    global.monitoringData.requestHistory.unshift({
        requestId: requestId,
        url: data.url,
        mode: data.mode,
        success: result.code === 200,
        timestamp: new Date(),
        responseTime: requestStartTime ? Date.now() - requestStartTime.getTime() : 0
    })
    
    // 只保留最近100条历史
    if (global.monitoringData.requestHistory.length > 100) {
        global.monitoringData.requestHistory = global.monitoringData.requestHistory.slice(0, 100)
    }
    
    // 检查内存使用情况
    const memStats = memoryManager.checkMemoryUsage()
    if (memStats.heapUsagePercent > 0.8) {
        console.log('⚠️  High memory usage after request completion')
    }

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
            
            // 按服务分组的活跃请求
            activeRequestsByService: global.monitoringData.activeRequestsByService,
            
            // 时间戳
            timestamp: new Date()
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
            cloudflare: 0,
            hcaptcha: 0,
            recaptchav2: 0,
            recaptchav3: 0
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
            message: 'Service restart failed: ' + error.message 
        })
    }
})

// 清理浏览器实例的函数
async function cleanupBrowserInstances() {
    try {
        console.log('🧹 清理浏览器实例和上下文...')
        
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
                    console.warn('关闭上下文时出现警告:', e.message)
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
                console.warn('关闭浏览器时出现警告:', e.message)
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

app.use((_, res) => { res.status(404).json({ code: 404, message: 'Not Found' }) })

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

app.use((err, _, res, __) => {
  console.error('Express error handler:', err);
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
}

if (process.env.NODE_ENV === 'development' || process.env.NODE_ENV === 'test') {
    module.exports = { app, cleanup }
} else {
    module.exports = app
}
