const fs = require("fs");
function solveTurnstileMin({ url, proxy }) {
  return new Promise(async (resolve, reject) => {
    if (!url) return reject("Missing url parameter");

    // 检查浏览器是否已初始化
    if (!global.browser) {
      if (global.browserInitFailed) {
        return reject("浏览器初始化失败，请检查Chrome安装和配置");
      }
      return reject("浏览器正在初始化中，请稍后重试");
    }

    const context = await global.browser
      .createBrowserContext({
        proxyServer: proxy ? `http://${proxy.host}:${proxy.port}` : undefined, // https://pptr.dev/api/puppeteer.browsercontextoptions
      })
      .catch(() => null);

    if (!context) return reject("Failed to create browser context");

    let isResolved = false;

    var cl = setTimeout(async () => {
      if (!isResolved) {
        await context.close();
        reject("Timeout Error");
      }
    }, global.timeOut || 60000);

    try {
      const page = await context.newPage();

      if (proxy?.username && proxy?.password)
        await page.authenticate({
          username: proxy.username,
          password: proxy.password,
        });
        
      await page.evaluateOnNewDocument(() => {
        let token = null;
        async function waitForToken() {
          while (!token) {
            try {
              token = window.turnstile.getResponse();
            } catch (e) {}
            await new Promise((resolve) => setTimeout(resolve, 500));
          }
          var c = document.createElement("input");
          c.type = "hidden";
          c.name = "cf-response";
          c.value = token;
          document.body.appendChild(c);
        }
        waitForToken();
      });

      await page.goto(url, {
        waitUntil: "domcontentloaded",
      });

      await page.waitForSelector('[name="cf-response"]', {
        timeout: 60000,
      });
      const token = await page.evaluate(() => {
        try {
          return document.querySelector('[name="cf-response"]').value;
        } catch (e) {
          return null;
        }
      });
      isResolved = true;
      clearInterval(cl);
      await context.close();
      if (!token || token.length < 10) return reject("Failed to get token");
      return resolve(token);
    } catch (e) {
      console.log(e);

      if (!isResolved) {
        await context.close();
        clearInterval(cl);
        reject(e.message);
      }
    }
  });
}
module.exports = solveTurnstileMin;
