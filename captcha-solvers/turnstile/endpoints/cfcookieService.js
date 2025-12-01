/**
 * CF Cookie Service - 专门提取 cf_clearance cookie
 * 优化版本：资源拦截、快速清理、减少内存占用
 */
const crypto = require("crypto");
const siteQueueManager = require("../utils/siteQueueManager");
const logger = require("../../../src/utils/logger");

// 需要阻止的资源类型
const BLOCKED_RESOURCE_TYPES = new Set(['image', 'media', 'font']);

// 需要阻止的URL模式
const BLOCKED_URL_PATTERNS = [
  /google-analytics/i, /googletagmanager/i, /facebook.*pixel/i,
  /doubleclick/i, /hotjar/i, /mixpanel/i, /sentry\.io/i
];

function shouldBlockUrl(url) {
  return BLOCKED_URL_PATTERNS.some(p => p.test(url));
}

function domainMatches(cookieDomain, host) {
  if (!cookieDomain || !host) return false;
  const cd = cookieDomain.startsWith('.') ? cookieDomain.slice(1) : cookieDomain;
  return host === cd || host.endsWith('.' + cd);
}

async function getCfClearance({ url, proxy, mode, requestId }) {
  return new Promise(async (resolve, reject) => {
    if (!url) return reject("Missing url parameter");

    const reqId = requestId || crypto.randomBytes(8).toString('hex');
    const startTime = Date.now();
    let context = null;
    let page = null;
    let timeoutId = null;
    let isResolved = false;

    // 解析hostname
    let hostname = null;
    try { hostname = new URL(url).hostname; } catch (_) {}

    // 统一清理函数
    const cleanup = async (success = false) => {
      if (isResolved) return;
      isResolved = true;

      if (timeoutId) {
        clearTimeout(timeoutId);
        timeoutId = null;
      }

      if (page) {
        try { await page.close().catch(() => {}); } catch (e) {}
        page = null;
      }

      if (context) {
        try { await context.close().catch(() => {}); } catch (e) {}
        context = null;
      }

      siteQueueManager.releaseSlot(url, null, reqId, success, Date.now() - startTime);
    };

    // 加入站点队列
    const qres = await siteQueueManager.queueRequest(url, null, reqId);
    if (qres && qres.timeout) {
      return reject(`Queue timeout for request ${reqId}`);
    }

    try {
      // 创建浏览器上下文
      const ctxOpts = proxy ? { proxyServer: `http://${proxy.host}:${proxy.port}` } : undefined;
      context = await global.browser.createBrowserContext(ctxOpts).catch(() => null);

      if (!context) {
        await cleanup(false);
        return reject("Failed to create browser context");
      }

      // 设置超时
      timeoutId = setTimeout(async () => {
        if (!isResolved) {
          logger.requestTimeout(reqId, Date.now() - startTime);
          await cleanup(false);
          reject("Timeout - cf_clearance not obtained");
        }
      }, global.timeOut || 90000);

      page = await context.newPage();

      // 代理认证
      if (proxy?.username && proxy?.password) {
        await page.authenticate({ username: proxy.username, password: proxy.password });
      }

      // 设置请求拦截 - 阻止不必要的资源
      await page.setRequestInterception(true);
      page.on("request", async (request) => {
        try {
          const resourceType = request.resourceType();
          const reqUrl = request.url();

          if (BLOCKED_RESOURCE_TYPES.has(resourceType) || shouldBlockUrl(reqUrl)) {
            await request.abort();
          } else {
            await request.continue();
          }
        } catch (e) {}
      });

      // 访问页面
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 60000 });

      // 等待 cf_clearance cookie - 优化的检查逻辑
      const maxWaitTime = 60; // 60秒
      const checkInterval = 2; // 2秒检查一次

      for (let i = 0; i < maxWaitTime / checkInterval; i++) {
        if (isResolved) break;

        await new Promise(r => setTimeout(r, checkInterval * 1000));

        try {
          const cookies = await page.cookies(url).catch(() => page.cookies());
          const filteredCookies = cookies.filter(c => domainMatches(c.domain, hostname));
          const cfCookie = filteredCookies.find(c => c.name === 'cf_clearance');

          if (cfCookie && cfCookie.value) {
            logger.cookieSuccess(reqId, 'cf_clearance');

            // 构建响应
            const userAgent = await page.evaluate(() => navigator.userAgent);
            const response = {
              code: 200,
              cf_clearance: cfCookie.value,
              headers: {
                "User-Agent": userAgent,
                "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
                "Accept-Language": "en-US,en;q=0.9",
                "Accept-Encoding": "gzip, deflate, br"
              },
              cookies: filteredCookies.map(c => ({
                name: c.name, value: c.value, domain: c.domain,
                path: c.path, expires: c.expires, httpOnly: c.httpOnly,
                secure: c.secure, sameSite: c.sameSite
              })),
              url: url,
              timestamp: new Date().toISOString()
            };

            await cleanup(true);
            return resolve(response);
          }

          // 每20秒刷新一次（如果还没获取到）
          if (i > 0 && i % 10 === 0) {
            await page.reload({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {});
          }
        } catch (e) {
          // 继续等待
        }
      }

      // 超时未获取到
      await cleanup(false);
      reject('cf_clearance cookie not found');

    } catch (e) {
      await cleanup(false);
      reject(e.message || 'Unknown error');
    }
  });
}

module.exports = getCfClearance;
