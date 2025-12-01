function getSource({ url, proxy }) {
  return new Promise(async (resolve, reject) => {
    if (!url) return reject("Missing url parameter");
    
    let context = null;
    let page = null;
    let isResolved = false;
    let requestHandler = null;
    let responseHandler = null;
    
    const cleanup = async () => {
      if (page) {
        try {
          // 移除事件监听器
          if (requestHandler) page.off('request', requestHandler);
          if (responseHandler) page.off('response', responseHandler);
          await page.close().catch(() => {});
        } catch (e) {}
      }
      if (context) {
        try {
          await context.close().catch(() => {});
        } catch (e) {}
      }
    };
    
    const timeoutHandler = setTimeout(async () => {
      if (!isResolved) {
        isResolved = true;
        await cleanup();
        reject("Timeout Error");
      }
    }, global.timeOut || 60000);

    try {
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
      
      // 设置页面资源限制
      await page.setDefaultTimeout(90000);
      await page.setDefaultNavigationTimeout(90000);

      if (proxy?.username && proxy?.password) {
        await page.authenticate({
          username: proxy.username,
          password: proxy.password,
        });
      }

      await page.setRequestInterception(true);
      
      requestHandler = async (request) => {
        try {
          await request.continue();
        } catch (e) {}
      };
      
      responseHandler = async (res) => {
        try {
          if (!isResolved &&
            [200, 302].includes(res.status()) &&
            [url, url + "/"].includes(res.url())
          ) {
            await page
              .waitForNavigation({ waitUntil: "load", timeout: 5000 })
              .catch(() => {});
            const html = await page.content();
            
            isResolved = true;
            clearTimeout(timeoutHandler);
            await cleanup();
            resolve(html);
          }
        } catch (e) {
          if (!isResolved) {
            isResolved = true;
            clearTimeout(timeoutHandler);
            await cleanup();
            reject(e.message || 'Response handler error');
          }
        }
      };
      
      page.on("request", requestHandler);
      page.on("response", responseHandler);
      
      await page.goto(url, {
        waitUntil: "domcontentloaded",
        timeout: Number(process.env.PAGE_TIMEOUT) || global.timeOut || 90000
      });
      
    } catch (e) {
      if (!isResolved) {
        isResolved = true;
        clearTimeout(timeoutHandler);
        await cleanup();
        reject(e.message || 'Unknown error');
      }
    }
  });
}
module.exports = getSource;
