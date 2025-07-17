/**
 * CF Cookie Service - 专门提取 cf_clearance cookie
 * 使用上下文池优化版本，兼容 puppeteer-real-browser
 */
async function getCfClearance({ url, proxy }) {
  return new Promise(async (resolve, reject) => {
    if (!url) return reject("Missing url parameter");

    // 检查浏览器是否已初始化
    if (!global.browser) {
      if (global.browserInitFailed) {
        return reject("浏览器初始化失败，请检查Chrome安装和配置");
      }
      return reject("浏览器正在初始化中，请稍后重试");
    }
    
    let context = null;
    let page = null;
    let isResolved = false;
    let contextClosed = false;
    
    const cleanup = async () => {
      if (page) {
        try {
          await page.close().catch(() => {});
        } catch (e) {}
      }
      if (context && !contextClosed) {
        try {
          contextClosed = true;
          // cfcookie请求需要强制关闭上下文，不能复用
          // 因为cookie状态会影响后续请求
          console.log('🧹 强制关闭cfcookie上下文以避免cookie缓存');
          await context.close();
        } catch (e) {
          console.error("Error closing cfcookie context:", e.message);
        }
      }
    };
    
    const timeoutHandler = setTimeout(async () => {
      if (!isResolved) {
        isResolved = true;
        await cleanup();
        reject("Timeout Error - cf_clearance cookie not obtained");
      }
    }, global.timeOut || 120000);

    try {
      // cfcookie请求总是创建全新的上下文，避免cookie缓存问题
      console.log('🆕 为cfcookie请求创建全新上下文');
      context = await global.browser
        .createBrowserContext({
          proxyServer: proxy ? `http://${proxy.host}:${proxy.port}` : undefined,
        })
        .catch(() => null);
        
      if (!context) {
        clearTimeout(timeoutHandler);
        return reject("Failed to create browser context");
      }

      page = await context.newPage();
      
      if (proxy?.username && proxy?.password) {
        await page.authenticate({
          username: proxy.username,
          password: proxy.password,
        });
      }

      console.log(`正在访问: ${url}`);
      
      // 直接访问页面
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 30000
      });
      
      // 等待页面完全加载，让 Cloudflare 有时间设置 cookie
      console.log('等待页面加载和 Cloudflare 验证...');
      
      let maxWaitTime = 90; // 等待90秒
      let checkInterval = 3; // 每3秒检查一次，减少频率
      
      for (let i = 0; i < maxWaitTime / checkInterval; i++) {
        if (isResolved) break;
        
        await new Promise(resolve => setTimeout(resolve, checkInterval * 1000));
        
        try {
          // 检查 cf_clearance cookie
          const cookies = await page.cookies();
          const cfClearanceCookie = cookies.find(cookie => cookie.name === 'cf_clearance');
          
          if (cfClearanceCookie && cfClearanceCookie.value) {
            console.log('✅ 成功获取 cf_clearance cookie');

            // 获取完整的请求头信息
            const headers = {
              'User-Agent': await page.evaluate(() => navigator.userAgent),
              'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7',
              'Accept-Language': 'en-US,en;q=0.9',
              'Accept-Encoding': 'gzip, deflate, br',
              'DNT': '1',
              'Connection': 'keep-alive',
              'Upgrade-Insecure-Requests': '1',
              'Sec-Fetch-Dest': 'document',
              'Sec-Fetch-Mode': 'navigate',
              'Sec-Fetch-Site': 'none',
              'Sec-Fetch-User': '?1',
              'Cache-Control': 'max-age=0'
            };

            // 获取所有cookies，不仅仅是cf_clearance
            const allCookies = cookies.map(cookie => ({
              name: cookie.name,
              value: cookie.value,
              domain: cookie.domain,
              path: cookie.path,
              expires: cookie.expires,
              httpOnly: cookie.httpOnly,
              secure: cookie.secure,
              sameSite: cookie.sameSite
            }));

            const result = {
              cf_clearance: cfClearanceCookie.value,
              headers: headers,
              cookies: allCookies,
              url: url,
              timestamp: new Date().toISOString()
            };

            isResolved = true;
            clearTimeout(timeoutHandler);
            await cleanup();
            resolve(result);
            return;
          }
          
          // 检查页面状态 - 简化检查
          const content = await page.content();
          const isCloudflareChallenge = content.includes('Just a moment') || 
                                      content.includes('cf-browser-verification') ||
                                      content.includes('Checking if the site connection is secure') ||
                                      content.includes('DDoS protection by Cloudflare') ||
                                      content.includes('Ray ID:');
          
          if (isCloudflareChallenge) {
            console.log(`⏳ Cloudflare 验证中... (${i * checkInterval}/${maxWaitTime}s)`);
          } else {
            console.log(`🔍 页面已加载，等待 cf_clearance cookie... (${i * checkInterval}/${maxWaitTime}s)`);
            
            // 如果页面已经加载完成但没有验证页面，可能需要刷新一下
            if (i > 5 && i % 10 === 0) {
              console.log('🔄 尝试刷新页面以触发 Cloudflare 验证...');
              await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
            }
          }
          
        } catch (e) {
          console.error('检查过程中发生错误:', e.message);
          // 继续等待，不立即退出
        }
      }
      
      // 如果循环结束仍未找到 cookie
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutHandler);
        await cleanup();
        reject('cf_clearance cookie not found after waiting');
      }
      
    } catch (e) {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutHandler);
        await cleanup();
        reject(e.message || 'Unknown error while getting cf_clearance');
      }
    }
  });
}

module.exports = getCfClearance;