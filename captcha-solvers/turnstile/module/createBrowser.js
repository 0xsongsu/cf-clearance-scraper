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
            contextCreationTime: new Map(), // 跟踪上下文创建时间
            performanceStats: {
                totalCreated: 0,
                totalReused: 0,
                totalRecycled: 0,
                avgCreationTime: 0,
                creationTimes: []
            },
            
            async getContext() {
                // 如果有可用的上下文，智能选择最优的
                if (this.available.length > 0) {
                    // 智能选择策略：优先选择使用次数少且创建时间不太久的上下文
                    const now = Date.now();
                    const contextScores = this.available.map(context => {
                        const usage = this.contextUsage.get(context) || 0;
                        const creationTime = this.contextCreationTime.get(context) || now;
                        const age = now - creationTime;

                        // 计算分数：使用次数越少越好，但过老的上下文分数降低
                        const usageScore = Math.max(0, 100 - usage * 2); // 使用次数权重
                        const ageScore = Math.max(0, 100 - age / (60 * 60 * 1000)); // 1小时内的上下文优先

                        return {
                            context,
                            score: usageScore * 0.7 + ageScore * 0.3,
                            usage,
                            age
                        };
                    });

                    // 选择分数最高的上下文
                    contextScores.sort((a, b) => b.score - a.score);
                    const bestContext = contextScores[0];

                    // 从可用列表中移除
                    const contextIndex = this.available.indexOf(bestContext.context);
                    this.available.splice(contextIndex, 1);

                    this.used++;

                    // 增加使用计数和性能统计
                    const newUsage = bestContext.usage + 1;
                    this.contextUsage.set(bestContext.context, newUsage);
                    this.performanceStats.totalReused++;

                    console.log(`🔄 智能复用上下文 (使用: ${newUsage}次, 年龄: ${Math.round(bestContext.age / 60000)}分钟, 活跃: ${this.used}, 可用: ${this.available.length})`);
                    return bestContext.context;
                }
                
                // 如果没有可用上下文且未达到最大限制，创建新的
                if ((this.used + this.available.length) < this.maxSize) {
                    try {
                        const creationStart = Date.now();

                        const context = await global.browser.createBrowserContext({
                            // 优化上下文设置，减少资源占用
                            ignoreHTTPSErrors: true,
                            // 禁用不必要的功能以提升性能
                            args: [
                                '--disable-background-networking',
                                '--disable-background-timer-throttling',
                                '--disable-renderer-backgrounding',
                                '--disable-backgrounding-occluded-windows',
                                '--disable-client-side-phishing-detection',
                                '--disable-default-apps',
                                '--disable-dev-shm-usage',
                                '--disable-extensions',
                                '--disable-features=TranslateUI',
                                '--disable-hang-monitor',
                                '--disable-ipc-flooding-protection',
                                '--disable-popup-blocking',
                                '--disable-prompt-on-repost',
                                '--disable-sync',
                                '--disable-web-security',
                                '--metrics-recording-only',
                                '--no-first-run',
                                '--safebrowsing-disable-auto-update',
                                '--enable-automation',
                                '--password-store=basic',
                                '--use-mock-keychain'
                            ]
                        });

                        const creationTime = Date.now() - creationStart;

                        this.used++;
                        this.contextUsage.set(context, 1);
                        this.contextCreationTime.set(context, Date.now());

                        // 更新性能统计
                        this.performanceStats.totalCreated++;
                        this.performanceStats.creationTimes.push(creationTime);
                        if (this.performanceStats.creationTimes.length > 50) {
                            this.performanceStats.creationTimes.shift();
                        }
                        this.performanceStats.avgCreationTime =
                            this.performanceStats.creationTimes.reduce((a, b) => a + b, 0) /
                            this.performanceStats.creationTimes.length;

                        console.log(`🆕 创建新上下文 (耗时: ${creationTime}ms, 活跃: ${this.used}, 可用: ${this.available.length}, 总计: ${this.used + this.available.length})`);
                        return context;
                    } catch (e) {
                        console.error("创建浏览器上下文失败:", e.message);
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
                
                // 智能回收策略：检查上下文是否需要回收
                const usage = this.contextUsage.get(context) || 0;
                const creationTime = this.contextCreationTime.get(context) || Date.now();
                const age = Date.now() - creationTime;
                const maxAge = 2 * 60 * 60 * 1000; // 2小时最大年龄
                const maxUsage = 150; // 提高使用次数限制

                const shouldRecycle = usage > maxUsage || age > maxAge;

                if (shouldRecycle) {
                    try {
                        this.contextUsage.delete(context);
                        this.contextCreationTime.delete(context);
                        await context.close();
                        this.performanceStats.totalRecycled++;

                        const reason = usage > maxUsage ? `高使用次数(${usage})` : `超时(${Math.round(age / 60000)}分钟)`;
                        console.log(`♻️  上下文回收: ${reason}`);

                        // 智能补充策略：只在池子不足时创建新上下文
                        const totalContexts = this.used + this.available.length;
                        const targetPoolSize = Math.min(Math.floor(this.maxSize * 0.6), 12); // 目标池大小

                        if (this.available.length < targetPoolSize && totalContexts < this.maxSize) {
                            try {
                                const creationStart = Date.now();
                                const newContext = await global.browser.createBrowserContext({
                                    ignoreHTTPSErrors: true,
                                });
                                const creationTime = Date.now() - creationStart;

                                this.contextUsage.set(newContext, 0);
                                this.contextCreationTime.set(newContext, Date.now());
                                this.available.push(newContext);
                                this.performanceStats.totalCreated++;

                                console.log(`🆕 补充新上下文替换回收的 (耗时: ${creationTime}ms)`);
                            } catch (e) {
                                console.error("创建补充上下文失败:", e.message);
                            }
                        }
                        return;
                    } catch (e) {
                        console.error("回收上下文时出错:", e.message);
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
            },

            async closeAll() {
                console.log('🔒 关闭所有浏览器上下文...');

                // 打印性能统计
                this.printPerformanceStats();

                // 清空等待队列
                this.waitingQueue.forEach(({ reject, timeout }) => {
                    clearTimeout(timeout);
                    reject(new Error('Context pool is being closed'));
                });
                this.waitingQueue = [];

                // 关闭所有可用的上下文
                const allContexts = [...this.available];
                this.available = [];
                this.used = 0;

                await Promise.all(allContexts.map(async (context) => {
                    try {
                        await context.close();
                    } catch (e) {
                        console.error('关闭上下文时出错:', e.message);
                    }
                }));

                this.contextUsage.clear();
                this.contextCreationTime.clear();
                console.log('✅ 所有浏览器上下文已关闭');
            },

            // 打印性能统计
            printPerformanceStats() {
                const stats = this.performanceStats;
                console.log('📊 上下文池性能统计:');
                console.log(`   总创建: ${stats.totalCreated}个`);
                console.log(`   总复用: ${stats.totalReused}次`);
                console.log(`   总回收: ${stats.totalRecycled}个`);
                console.log(`   平均创建时间: ${Math.round(stats.avgCreationTime)}ms`);
                console.log(`   复用率: ${stats.totalReused > 0 ? Math.round(stats.totalReused / (stats.totalCreated + stats.totalReused) * 100) : 0}%`);
            },

            // 获取池状态
            getPoolStatus() {
                return {
                    available: this.available.length,
                    used: this.used,
                    total: this.used + this.available.length,
                    maxSize: this.maxSize,
                    waiting: this.waitingQueue.length,
                    performance: {
                        ...this.performanceStats,
                        reuseRate: this.performanceStats.totalReused > 0 ?
                            Math.round(this.performanceStats.totalReused / (this.performanceStats.totalCreated + this.performanceStats.totalReused) * 100) : 0
                    }
                };
            }
        }

        console.log('Launching the browser...')

        const defaultWidth = 520
        const defaultHeight = 240

        const width = options.width || defaultWidth
        const height = options.height || defaultHeight

        console.log('Browser launch config:', {
            headless: false,
            turnstile: true,
            width,
            height
        })

        // 尝试多个Chrome路径
        const chromePaths = [
            '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
            '/Applications/Chromium.app/Contents/MacOS/Chromium',
            '/usr/bin/google-chrome-stable',
            '/usr/bin/google-chrome',
            '/usr/bin/chromium-browser',
            '/usr/bin/chromium'
        ];

        let browser = null;
        let lastError = null;

        for (const chromePath of chromePaths) {
            try {
                const fs = require('fs');
                if (fs.existsSync(chromePath)) {
                    console.log(`尝试使用Chrome路径: ${chromePath}`);

                    const result = await connect({
                        headless: false,
                        turnstile: true,
                        executablePath: chromePath,
                        connectOption: { defaultViewport: null },
                        disableXvfb: true
                    });

                    if (result && result.browser) {
                        browser = result.browser;
                        console.log(`✅ 成功连接到Chrome: ${chromePath}`);
                        break;
                    }
                }
            } catch (e) {
                console.log(`❌ Chrome路径失败 ${chromePath}: ${e.message}`);
                lastError = e;
                continue;
            }
        }

        if (!browser) {
            console.error("❌ 所有Chrome路径都失败了");
            if (lastError) {
                console.error("最后一个错误:", lastError.message);
                console.error("完整错误:", lastError);
            }
        }

        if (!browser) {
            console.error("❌ 无法连接到浏览器")
            console.error("请确保:")
            console.error("1. Google Chrome 已安装")
            console.error("2. Chrome 路径正确")
            console.error("3. 系统有足够权限启动Chrome")

            // 检查是否在重启中，如果是则不重试
            if (global.restarting === true) {
                console.log('浏览器连接在重启期间失败，跳过重试...')
                return
            }

            // 设置全局标志表示浏览器初始化失败
            global.browserInitFailed = true;

            // 延迟重试
            console.log('⏰ 5秒后重试浏览器连接...')
            setTimeout(createBrowser, 5000)
            return
        }

        console.log('✅ 浏览器启动成功')

        // 清除浏览器初始化失败标志
        global.browserInitFailed = false;

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