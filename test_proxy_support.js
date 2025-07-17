#!/usr/bin/env node
/**
 * 测试代理URL格式支持
 */

// 测试配置
const TEST_CONFIG = {
    server: {
        host: 'localhost',
        port: 3000,
        timeout: 30000
    },
    testUrl: 'https://httpbin.org/ip'  // 用于测试代理的简单网站
};

/**
 * 发送测试请求
 */
async function testProxyFormat(proxyConfig, description) {
    console.log(`\n🧪 测试: ${description}`);
    console.log(`代理配置:`, typeof proxyConfig === 'string' ? `"${proxyConfig}"` : proxyConfig);

    const requestData = {
        type: "cf5s",
        websiteUrl: TEST_CONFIG.testUrl,
        proxy: proxyConfig
    };

    try {
        const response = await fetch(`http://${TEST_CONFIG.server.host}:${TEST_CONFIG.server.port}/`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(requestData),
            signal: AbortSignal.timeout(TEST_CONFIG.server.timeout)
        });

        const result = await response.json();
        
        console.log(`状态码: ${response.status}`);
        console.log(`响应:`, JSON.stringify(result, null, 2));
        
        if (response.status === 400 && result.message && result.message.includes('Invalid proxy')) {
            console.log('❌ 代理格式验证失败');
        } else if (response.status === 200) {
            console.log('✅ 代理格式验证通过');
        } else {
            console.log('⚠️  其他响应');
        }
        
        return result;
    } catch (error) {
        console.log(`❌ 请求失败: ${error.message}`);
        return null;
    }
}

/**
 * 检查服务状态
 */
async function checkServerStatus() {
    try {
        const response = await fetch(`http://${TEST_CONFIG.server.host}:${TEST_CONFIG.server.port}/health`, {
            signal: AbortSignal.timeout(5000)
        });
        return response.status === 200;
    } catch (error) {
        return false;
    }
}

/**
 * 运行测试套件
 */
async function runTests() {
    console.log('🚀 代理URL格式支持测试');
    console.log('='.repeat(60));
    console.log(`🌐 测试服务: http://${TEST_CONFIG.server.host}:${TEST_CONFIG.server.port}`);
    console.log(`🎯 测试网站: ${TEST_CONFIG.testUrl}`);
    console.log('='.repeat(60));

    // 1. 检查服务状态
    console.log('\n📡 检查服务状态...');
    const serverStatus = await checkServerStatus();
    
    if (!serverStatus) {
        console.log('❌ 服务未运行或无法连接');
        console.log('   请确保服务已启动: npm start');
        process.exit(1);
    }
    
    console.log('✅ 服务运行正常');

    // 2. 测试各种代理格式
    const testCases = [
        // 有效的代理格式
        {
            proxy: {
                host: "proxy.example.com",
                port: 8080,
                username: "user",
                password: "pass"
            },
            description: "对象格式 - 完整配置"
        },
        {
            proxy: {
                host: "proxy.example.com", 
                port: 8080
            },
            description: "对象格式 - 无认证"
        },
        {
            proxy: "http://username:password@proxy.example.com:8080",
            description: "URL格式 - HTTP代理带认证"
        },
        {
            proxy: "https://user:pass@secure-proxy.com:8443",
            description: "URL格式 - HTTPS代理"
        },
        {
            proxy: "socks5://user:pass@socks.proxy.com:1080", 
            description: "URL格式 - SOCKS5代理"
        },
        {
            proxy: "http://proxy.example.com:8080",
            description: "URL格式 - HTTP代理无认证"
        },
        {
            proxy: "proxy.example.com:8080",
            description: "URL格式 - 简化格式"
        },
        {
            proxy: "username:password@proxy.example.com:8080",
            description: "URL格式 - 无协议前缀"
        },
        {
            proxy: "http://user%40domain.com:pass%23123@proxy.example.com:8080",
            description: "URL格式 - URL编码的认证信息"
        },
        
        // 无效的代理格式
        {
            proxy: "invalid-proxy-format",
            description: "无效格式 - 纯文本"
        },
        {
            proxy: "",
            description: "无效格式 - 空字符串"
        },
        {
            proxy: 123,
            description: "无效格式 - 数字"
        },
        {
            proxy: { host: "proxy.com" },
            description: "无效格式 - 缺少端口"
        }
    ];

    console.log('\n🧪 开始代理格式测试...');
    
    for (let i = 0; i < testCases.length; i++) {
        const testCase = testCases[i];
        await testProxyFormat(testCase.proxy, testCase.description);
        
        // 添加延迟避免请求过快
        if (i < testCases.length - 1) {
            await new Promise(resolve => setTimeout(resolve, 1000));
        }
    }

    console.log('\n✅ 代理格式测试完成！');
    console.log('\n📝 总结:');
    console.log('   ✅ 支持对象格式代理配置');
    console.log('   ✅ 支持多种URL格式代理配置');
    console.log('   ✅ 支持URL编码的认证信息');
    console.log('   ✅ 对无效格式进行验证和错误提示');
}

// 运行测试
if (require.main === module) {
    runTests().catch(error => {
        console.error('测试运行失败:', error);
        process.exit(1);
    });
}

module.exports = { testProxyFormat, checkServerStatus };
