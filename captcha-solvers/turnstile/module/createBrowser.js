const { connect } = require("puppeteer-real-browser")

async function createBrowser(options = {}) {
    try {
        if (global.finished === true) return
        if (global.restarting === true) {
            console.log('Skipping browser creation during restart...')
            return
        }

        if (global.browser) {
            try {
                await global.browser.close().catch(() => {})
            } catch (e) {
                console.log("Error closing previous browser:", e.message)
            }
        }

        global.browser = null
        global.browserContexts = new Set()
        global.contextPool = {
            available: [],
            maxSize: Number(process.env.CONTEXT_POOL_SIZE) || 20,
            used: 0,
            waitingQueue: [], // 等待队列
            contextUsage: new Map(), // 跟踪每个上下文的使用次数
            
            async getContext() {
                // 如果有可用的上下文，选择使用次数最少的
                if (this.available.length > 0) {
                    // 按使用次数排序，选择最少使用的
                    this.available.sort((a, b) => 
                        (this.contextUsage.get(a) || 0) - (this.contextUsage.get(b) || 0)
                    );
                    
                    const context = this.available.shift();
                    this.used++;
                    
                    // 增加使用计数
                    const usage = this.contextUsage.get(context) || 0;
                    this.contextUsage.set(context, usage + 1);
                    
                    console.log(`🔄 Reusing context (usage: ${usage + 1}, ${this.used} active, ${this.available.length} available)`);
                    return context;
                }
                
                // 如果没有可用上下文且未达到最大限制，创建新的
                if ((this.used + this.available.length) < this.maxSize) {
                    try {
                        const context = await global.browser.createBrowserContext({
                            // 优化上下文设置，减少资源占用
                            ignoreHTTPSErrors: true
                        });
                        
                        this.used++;
                        this.contextUsage.set(context, 1);
                        console.log(`🆕 Created new context (${this.used} active, ${this.available.length} available, total: ${this.used + this.available.length})`);
                        return context;
                    } catch (e) {
                        console.error("Failed to create browser context:", e.message);
                        return null;
                    }
                }
                
                // 达到最大限制，等待可用上下文
                console.log(`⏳ Context pool full, waiting for available context (${this.used} active, ${this.waitingQueue.length} waiting)`);
                return new Promise((resolve, reject) => {
                    const timeout = setTimeout(() => {
                        const index = this.waitingQueue.findIndex(item => item.resolve === resolve);
                        if (index !== -1) {
                            this.waitingQueue.splice(index, 1);
                        }
                        reject(new Error('Context pool timeout'));
                    }, 30000); // 30秒超时
                    
                    this.waitingQueue.push({ resolve, reject, timeout });
                });
            },
            
            async releaseContext(context) {
                if (!context) return;
                
                this.used = Math.max(0, this.used - 1);
                
                // 检查是否有等待的请求
                if (this.waitingQueue.length > 0) {
                    try {
                        // 清理页面但保留上下文给等待的请求
                        const pages = await context.pages();
                        await Promise.all(pages.map(page => page.close().catch(() => {})));
                        
                        const waitingRequest = this.waitingQueue.shift();
                        clearTimeout(waitingRequest.timeout);
                        
                        this.used++;
                        const usage = this.contextUsage.get(context) || 0;
                        this.contextUsage.set(context, usage + 1);
                        
                        console.log(`🚀 Context passed to waiting request (${this.used} active, ${this.waitingQueue.length} waiting)`);
                        waitingRequest.resolve(context);
                        return;
                    } catch (e) {
                        console.error("Error transferring context to waiting request:", e.message);
                        // 失败的话，处理等待的请求
                        if (this.waitingQueue.length > 0) {
                            const waitingRequest = this.waitingQueue.shift();
                            clearTimeout(waitingRequest.timeout);
                            waitingRequest.reject(new Error('Context transfer failed'));
                        }
                    }
                }
                
                // 检查上下文是否过度使用，如果是则替换
                const usage = this.contextUsage.get(context) || 0;
                if (usage > 100) { // 使用超过100次就替换
                    try {
                        this.contextUsage.delete(context);
                        await context.close();
                        console.log(`🔄 Context recycled due to high usage (${usage} uses)`);
                        
                        // 创建新的上下文补充池子
                        if (this.available.length < Math.floor(this.maxSize / 2)) {
                            const newContext = await global.browser.createBrowserContext({
                                ignoreHTTPSErrors: true
                            });
                            this.contextUsage.set(newContext, 0);
                            this.available.push(newContext);
                            console.log(`🆕 New context created to replace recycled one`);
                        }
                        return;
                    } catch (e) {
                        console.error("Error recycling context:", e.message);
                    }
                }
                
                // 正常情况下，返回到池子
                try {
                    // 清理页面但保留上下文
                    const pages = await context.pages();
                    await Promise.all(pages.map(page => page.close().catch(() => {})));
                    
                    this.available.push(context);
                    console.log(`♻️  Context returned to pool (usage: ${usage}, ${this.used} active, ${this.available.length} available)`);
                } catch (e) {
                    console.error("Error cleaning context for reuse:", e.message);
                    // 清理失败，关闭上下文
                    try {
                        this.contextUsage.delete(context);
                        await context.close();
                        console.log(`🗑️  Context closed due to cleanup failure`);
                    } catch (closeError) {
                        console.error("Error closing context:", closeError.message);
                    }
                }
            },
            
            async cleanup() {
                // 清理所有池中的上下文
                while (this.available.length > 0) {
                    const context = this.available.pop();
                    try {
                        await context.close();
                    } catch (e) {
                        console.error("Error closing pooled context:", e.message);
                    }
                }
                this.used = 0;
                console.log('🧹 Context pool cleaned up');
            }
        }

        console.log('Launching the browser...')

        const defaultWidth = 600
        const defaultHeight = 520

        const width = options.width || defaultWidth
        const height = options.height || defaultHeight

        console.log('Browser launch config:', {
            headless: false,
            turnstile: true,
            width,
            height
        })

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
            console.error("Browser connection error:", e.message)
            console.error("Full error:", e)
            return { browser: null }
        })

        if (!browser) {
            console.error("Failed to connect to browser")
            // 检查是否在重启中，如果是则不重试
            if (global.restarting === true) {
                console.log('Browser connection failed during restart, skipping retry...')
                return
            }
            // 延迟重试
            setTimeout(createBrowser, 5000)
            return
        }

        console.log('Browser launched successfully')

        // 立即创建一个初始浏览器上下文以准备服务
        try {
            const initialContext = await browser.createBrowserContext()
            console.log('Initial browser context created successfully')
            global.browserContexts.add(initialContext)
            
            // 设置上下文关闭处理
            const originalClose = initialContext.close.bind(initialContext)
            initialContext.close = async function() {
                try {
                    await originalClose()
                } catch (e) {
                    console.error("Error closing context:", e.message)
                } finally {
                    global.browserContexts.delete(initialContext)
                }
            }
        } catch (e) {
            console.error("Failed to create initial context:", e.message)
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
                        console.error("Error closing context:", e.message)
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
                console.log('Browser disconnected during restart, skipping reconnect...')
                return
            }
            
            console.log('Browser disconnected, attempting to reconnect...')
            
            try {
                for (const context of global.browserContexts) {
                    try {
                        await context.close().catch(() => {})
                    } catch (e) {
                        console.error("Error closing context during reconnect:", e.message)
                    }
                }
                global.browserContexts.clear()
            } catch (e) {
                console.error("Error cleaning up contexts:", e.message)
            }
            
            await new Promise(resolve => setTimeout(resolve, 5000))
            await createBrowser()
        })

    } catch (e) {
        console.error("Browser creation error:", e.message)
        if (global.finished === true) return
        if (global.restarting === true) {
            console.log('Browser creation error during restart, skipping retry...')
            return
        }
        await new Promise(resolve => setTimeout(resolve, 5000))
        await createBrowser()
    }
}

process.on('SIGINT', async () => {
    console.log('Received SIGINT, cleaning up...')
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
            console.error("Error during cleanup:", e.message)
        }
    }
    
    process.exit(0)
})

module.exports = createBrowser

// 自动启动浏览器
if (process.env.SKIP_LAUNCH !== 'true') {
    createBrowser()
}