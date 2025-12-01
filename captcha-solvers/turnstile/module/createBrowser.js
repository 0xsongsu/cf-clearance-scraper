const { connect } = require("puppeteer-real-browser")
const logger = require('../../../src/utils/logger');

// 延迟加载上下文池，避免循环依赖
let contextPool = null;
function getContextPool() {
    if (!contextPool) {
        try {
            contextPool = require('../utils/contextPool');
        } catch (e) {
            logger.error('上下文池', `加载失败: ${e.message}`);
        }
    }
    return contextPool;
}

async function createBrowser(options = {}) {
    try {
        if (global.finished === true) return
        if (global.restarting === true) {
            logger.debug('浏览器', '重启中，跳过创建')
            return
        }

        if (global.browser) {
            try {
                await global.browser.close().catch(() => {})
            } catch (e) {
                logger.warn('浏览器', `关闭旧实例失败: ${e.message}`)
            }
        }

        global.browser = null
        global.browserContexts = new Set()
        // 移除上下文池：每个任务都使用独立上下文（由各业务函数自行创建与关闭）
        global.contextPool = null;

        logger.info('浏览器', '正在启动...')

        const defaultWidth = 600
        const defaultHeight = 520

        const width = options.width || defaultWidth
        const height = options.height || defaultHeight

        logger.debug('浏览器', `启动配置: headless=false, turnstile=true, 窗口=${width}x${height}`)

        const { browser } = await connect({
            headless: false,
            turnstile: true,
            executablePath: '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            args: [
                `--window-size=${width},${height}`,
                '--window-position=0,0',
                '--no-default-browser-check',
                '--disable-restore-session-state'
            ],
            connectOption: { 
                defaultViewport: null  // 不设置视口，让窗口大小生效
            },
            disableXvfb: true
        }).catch(e => {
            logger.error('浏览器', `连接失败: ${e.message}`)
            return { browser: null }
        })

        if (!browser) {
            logger.error('浏览器', '连接失败')
            // 检查是否在重启中，如果是则不重试
            if (global.restarting === true) {
                logger.debug('浏览器', '重启中，跳过重试')
                return
            }
            // 延迟重试
            setTimeout(createBrowser, 5000)
            return
        }

        logger.browserLaunched()

        // 初始化 Turnstile 上下文池
        const pool = getContextPool();
        if (pool && process.env.TURNSTILE_ENABLE_POOL !== 'false') {
            setTimeout(async () => {
                try {
                    await pool.initialize();
                } catch (e) {
                    logger.error('上下文池', `初始化失败: ${e.message}`);
                }
            }, 2000); // 延迟2秒，确保浏览器完全就绪
        }

        const originalCreateContext = browser.createBrowserContext.bind(browser)
        browser.createBrowserContext = async function(...args) {
            const context = await originalCreateContext(...args)
            if (context) {
                global.browserContexts.add(context)
                
                const originalClose = context.close.bind(context)
                context.close = async function() {
                    try {
                        await originalClose()
                    } catch (e) {
                        logger.debug('上下文', `关闭失败: ${e.message}`)
                    } finally {
                        global.browserContexts.delete(context)
                    }
                }
            }
            return context
        }

        global.browser = browser

        browser.on('disconnected', async () => {
            if (global.finished === true) return
            if (global.restarting === true) {
                logger.debug('浏览器', '重启中断开，跳过重连')
                return
            }

            logger.browserDisconnected()

            // 重置上下文池
            const pool = getContextPool();
            if (pool) {
                try {
                    await pool.destroy();
                } catch (e) {}
            }

            try {
                for (const context of global.browserContexts) {
                    try {
                        await context.close().catch(() => {})
                    } catch (e) {
                        logger.debug('上下文', `清理失败: ${e.message}`)
                    }
                }
                global.browserContexts.clear()
            } catch (e) {
                logger.warn('浏览器', `清理上下文失败: ${e.message}`)
            }

            await new Promise(resolve => setTimeout(resolve, 5000))
            await createBrowser()
        })

    } catch (e) {
        logger.error('浏览器', `创建失败: ${e.message}`)
        if (global.finished === true) return
        if (global.restarting === true) {
            logger.debug('浏览器', '重启中出错，跳过重试')
            return
        }
        await new Promise(resolve => setTimeout(resolve, 5000))
        await createBrowser()
    }
}

process.on('SIGINT', async () => {
    logger.info('系统', '收到终止信号，正在清理...')
    global.finished = true

    if (global.browser) {
        try {
            // 关闭所有上下文
            if (global.browserContexts) {
                for (const context of global.browserContexts) {
                    await context.close().catch(() => {})
                }
            }
            await global.browser.close().catch(() => {})
        } catch (e) {
            logger.error('浏览器', `清理失败: ${e.message}`)
        }
    }

    process.exit(0)
})

module.exports = createBrowser

// 自动启动浏览器
if (process.env.SKIP_LAUNCH !== 'true') {
    createBrowser()
}
