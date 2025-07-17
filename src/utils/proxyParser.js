/**
 * 代理URL解析工具
 * 支持多种代理格式的解析和标准化
 */

/**
 * 解析代理配置
 * @param {string|object} proxy - 代理配置，可以是URL字符串或对象
 * @returns {object|null} 标准化的代理对象或null
 */
function parseProxy(proxy) {
    if (!proxy) {
        return null;
    }

    // 如果已经是对象格式，直接返回
    if (typeof proxy === 'object' && proxy.host && proxy.port) {
        return {
            host: proxy.host,
            port: Number(proxy.port),
            username: proxy.username || null,
            password: proxy.password || null
        };
    }

    // 如果是字符串，尝试解析URL格式
    if (typeof proxy === 'string') {
        try {
            return parseProxyUrl(proxy);
        } catch (error) {
            console.error('代理URL解析失败:', error.message);
            return null;
        }
    }

    return null;
}

/**
 * 解析代理URL字符串
 * 支持格式:
 * - http://host:port
 * - http://username:password@host:port
 * - https://username:password@host:port
 * - socks5://username:password@host:port
 * - host:port
 * - username:password@host:port
 * 
 * @param {string} proxyUrl - 代理URL字符串
 * @returns {object} 解析后的代理对象
 */
function parseProxyUrl(proxyUrl) {
    if (!proxyUrl || typeof proxyUrl !== 'string') {
        throw new Error('代理URL必须是字符串');
    }

    let url = proxyUrl.trim();
    let protocol = 'http';
    let username = null;
    let password = null;
    let host = null;
    let port = null;

    // 检查是否有协议前缀
    const protocolMatch = url.match(/^(https?|socks[45]?):\/\//i);
    if (protocolMatch) {
        protocol = protocolMatch[1].toLowerCase();
        url = url.substring(protocolMatch[0].length);
    }

    // 检查是否有认证信息
    const authMatch = url.match(/^([^:@]+):([^@]+)@(.+)$/);
    if (authMatch) {
        username = decodeURIComponent(authMatch[1]);
        password = decodeURIComponent(authMatch[2]);
        url = authMatch[3];
    }

    // 解析主机和端口
    const hostPortMatch = url.match(/^([^:]+):(\d+)$/);
    if (hostPortMatch) {
        host = hostPortMatch[1];
        port = parseInt(hostPortMatch[2], 10);
    } else {
        // 如果没有端口，尝试只解析主机
        const hostMatch = url.match(/^([^:]+)$/);
        if (hostMatch) {
            host = hostMatch[1];
            // 根据协议设置默认端口
            switch (protocol) {
                case 'http':
                    port = 8080;
                    break;
                case 'https':
                    port = 8443;
                    break;
                case 'socks4':
                case 'socks5':
                    port = 1080;
                    break;
                default:
                    port = 8080;
            }
        } else {
            throw new Error(`无效的代理URL格式: ${proxyUrl}`);
        }
    }

    // 验证解析结果
    if (!host) {
        throw new Error(`无法解析主机名: ${proxyUrl}`);
    }

    if (!port || port < 1 || port > 65535) {
        throw new Error(`无效的端口号: ${port}`);
    }

    return {
        host: host,
        port: port,
        username: username,
        password: password,
        protocol: protocol
    };
}

/**
 * 将代理对象转换为Puppeteer兼容的格式
 * @param {object} proxy - 代理对象
 * @returns {string} Puppeteer代理服务器字符串
 */
function formatProxyForPuppeteer(proxy) {
    if (!proxy || !proxy.host || !proxy.port) {
        return null;
    }

    // Puppeteer只支持http代理格式
    return `http://${proxy.host}:${proxy.port}`;
}

/**
 * 验证代理配置是否有效
 * @param {object} proxy - 代理对象
 * @returns {boolean} 是否有效
 */
function isValidProxy(proxy) {
    if (!proxy || typeof proxy !== 'object') {
        return false;
    }

    // 检查必需字段
    if (!proxy.host || typeof proxy.host !== 'string') {
        return false;
    }

    if (!proxy.port || typeof proxy.port !== 'number' || proxy.port < 1 || proxy.port > 65535) {
        return false;
    }

    // 检查可选的认证字段
    if (proxy.username && typeof proxy.username !== 'string') {
        return false;
    }

    if (proxy.password && typeof proxy.password !== 'string') {
        return false;
    }

    return true;
}

module.exports = {
    parseProxy,
    parseProxyUrl,
    formatProxyForPuppeteer,
    isValidProxy
};
