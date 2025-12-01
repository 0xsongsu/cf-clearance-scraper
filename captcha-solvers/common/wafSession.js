async function findAcceptLanguage(page) {
  return await page.evaluate(async () => {
    const result = await fetch("https://httpbin.org/get")
      .then((res) => res.json())
      .then(
        (res) =>
          res.headers["Accept-Language"] || res.headers["accept-language"]
      )
      .catch(() => null);
    return result;
  });
}

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
      
      await page.setDefaultTimeout(90000);
      await page.setDefaultNavigationTimeout(90000);

      if (proxy?.username && proxy?.password) {
        await page.authenticate({
          username: proxy.username,
          password: proxy.password,
        });
      }
      
      let acceptLanguage = await findAcceptLanguage(page);
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
            const cookies = await page.cookies();
            let headers = await res.request().headers();
            delete headers["content-type"];
            delete headers["accept-encoding"];
            delete headers["accept"];
            delete headers["content-length"];
            headers["accept-language"] = acceptLanguage;
            
            isResolved = true;
            clearTimeout(timeoutHandler);
            await cleanup();
            resolve({ cookies, headers });
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
