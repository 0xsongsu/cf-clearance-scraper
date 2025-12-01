/**
 * Get Cookies Service - 专门获取网站cookies
 * 用于获取任意网站的所有cookies，不限于cf_clearance
 */
const crypto = require("crypto");
const siteQueueManager = require("../utils/siteQueueManager");

async function getCookies({ url, proxy, waitTime = 10000, requestId }) {
  return new Promise(async (resolve, reject) => {
    if (!url) return reject("Missing url parameter");
    
    let context = null;
    let page = null;
    let isResolved = false;
    let contextClosed = false;
    
    // 预先解析 hostname，用于后续 cookie 归属校验
    let hostname = null;
    try {
      hostname = new URL(url).hostname;
    } catch (_) {}

    // 判断 cookie 的 domain 是否匹配目标站点
    const domainMatches = (cookieDomain, host) => {
      if (!cookieDomain || !host) return false;
      const cd = cookieDomain.startsWith('.') ? cookieDomain.slice(1) : cookieDomain;
      if (host === cd) return true;
      return host.endsWith('.' + cd);
    };
    
    const cleanup = async () => {
      if (page) {
        try {
          await page.close().catch(() => {});
        } catch (e) {}
      }
      if (context && !contextClosed) {
        try {
          contextClosed = true;
          await context.close();
        } catch (e) {
          console.error("Error closing context:", e.message);
        }
      }
    };
    
    const timeoutHandler = setTimeout(async () => {
      if (!isResolved) {
        isResolved = true;
        await cleanup();
        reject("Timeout Error - failed to get cookies");
      }
    }, global.timeOut || 120000);

    try {
      // 生成唯一请求ID
      const reqId = requestId || crypto.randomBytes(8).toString('hex');
      
      // 加入站点队列
      const qres = await siteQueueManager.queueRequest(url, null, reqId);
      if (qres && qres.timeout) {
        throw new Error(`Queue timeout for request ${reqId}`);
      }

      // 创建浏览器上下文
      const ctxOpts = proxy ? { proxyServer: `http://${proxy.host}:${proxy.port}` } : undefined;
      context = await global.browser.createBrowserContext(ctxOpts).catch(() => null);
        
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
      
      // 访问页面
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: 90000
      });
      
      // 等待页面加载和JavaScript执行
      console.log(`等待页面加载和cookies设置 (${waitTime/1000}秒)...`);
      await new Promise(resolve => setTimeout(resolve, waitTime));
      
      // 获取所有cookies
      const cookies = await page.cookies(url).catch(() => page.cookies());
      const filteredCookies = cookies.filter(c => domainMatches(c.domain, hostname));
      
      // 获取User-Agent和其他headers
      const userAgent = await page.evaluate(() => navigator.userAgent);
      
      console.log(`✅ 成功获取 ${filteredCookies.length} 个cookies`);
      
      // 打印获取到的cookie名称，便于调试
      const cookieNames = filteredCookies.map(c => c.name);
      console.log(`Cookie名称列表: ${cookieNames.join(', ')}`);
      
      isResolved = true;
      clearTimeout(timeoutHandler);
      
      const fullResponse = {
        code: 200,
        headers: {
          "User-Agent": userAgent,
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
          "Accept-Language": "en-US,en;q=0.9",
          "Accept-Encoding": "gzip, deflate, br",
          "DNT": "1",
          "Connection": "keep-alive",
          "Upgrade-Insecure-Requests": "1",
          "Sec-Fetch-Dest": "document",
          "Sec-Fetch-Mode": "navigate",
          "Sec-Fetch-Site": "none",
          "Sec-Fetch-User": "?1",
          "Cache-Control": "max-age=0"
        },
        cookies: filteredCookies.map(cookie => ({
          name: cookie.name,
          value: cookie.value,
          domain: cookie.domain,
          path: cookie.path,
          expires: cookie.expires,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite
        })),
        url: url,
        timestamp: new Date().toISOString(),
        // 快速查找特定cookie
        cookiesMap: filteredCookies.reduce((acc, cookie) => {
          acc[cookie.name] = cookie.value;
          return acc;
        }, {})
      };
      
      await cleanup();
      // 释放队列槽位（成功）
      try { 
        siteQueueManager.releaseSlot(url, null, reqId, true, 0); 
      } catch {}
      
      resolve(fullResponse);
      
    } catch (e) {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutHandler);
        await cleanup();
        // 释放队列槽位（失败）
        try {
          siteQueueManager.releaseSlot(url, null, requestId, false, 0);
        } catch {}
        reject(e.message || 'Unknown error while getting cookies');
      }
    }
  });
}

module.exports = getCookies;