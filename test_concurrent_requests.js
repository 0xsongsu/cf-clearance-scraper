#!/usr/bin/env node
/**
 * 测试并发请求控制
 */

const TEST_CONFIG = {
    server: {
        host: 'localhost',
        port: 3000,
        timeout: 30000
    },
    testUrl: 'https://loyalty.campnetwork.xyz/loyalty',
    concurrentTests: [5, 10, 15, 20, 25, 30] // 不同的并发数测试
};

/**
 * 发送单个测试请求
 */
async function sendTestRequest(requestId) {
    const requestData = {
        type: "cf5s",
        websiteUrl: TEST_CONFIG.testUrl
    };

    const startTime = Date.now();
    
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
        const duration = Date.now() - startTime;
        
        return {
            requestId,
            status: response.status,
            duration,
            success: response.status === 200,
            error: response.status !== 200 ? result.message : null,
            result
        };
    } catch (error) {
        const duration = Date.now() - startTime;
        return {
            requestId,
            status: 0,
            duration,
            success: false,
            error: error.message,
            result: null
        };
    }
}

/**
 * 获取监控信息
 */
async function getMonitorInfo() {
    try {
        const response = await fetch(`http://${TEST_CONFIG.server.host}:${TEST_CONFIG.server.port}/api/monitor`);
        if (response.ok) {
            return await response.json();
        }
    } catch (error) {
        console.log('无法获取监控信息:', error.message);
    }
    return null;
}

/**
 * 测试指定数量的并发请求
 */
async function testConcurrentRequests(concurrentCount) {
    console.log(`\n🧪 测试 ${concurrentCount} 个并发请求`);
    console.log('='.repeat(50));
    
    // 获取测试前的监控信息
    const beforeMonitor = await getMonitorInfo();
    if (beforeMonitor) {
        console.log(`📊 测试前状态:`);
        console.log(`   活跃请求: ${beforeMonitor.requests.active}`);
        console.log(`   并发限制: ${beforeMonitor.requests.concurrency.limit} (来源: ${beforeMonitor.requests.concurrency.source})`);
        console.log(`   配置限制: ${beforeMonitor.requests.concurrency.configured}`);
    }
    
    const startTime = Date.now();
    
    // 创建并发请求
    const promises = [];
    for (let i = 0; i < concurrentCount; i++) {
        promises.push(sendTestRequest(i + 1));
    }
    
    console.log(`🚀 发送 ${concurrentCount} 个并发请求...`);
    
    // 等待所有请求完成
    const results = await Promise.all(promises);
    
    const totalDuration = Date.now() - startTime;
    
    // 分析结果
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const rateLimited = results.filter(r => r.status === 429).length;
    const errors = results.filter(r => r.status === 0).length;
    
    console.log(`\n📈 测试结果:`);
    console.log(`   总请求数: ${concurrentCount}`);
    console.log(`   成功: ${successful}`);
    console.log(`   失败: ${failed}`);
    console.log(`   限流(429): ${rateLimited}`);
    console.log(`   网络错误: ${errors}`);
    console.log(`   成功率: ${Math.round((successful / concurrentCount) * 100)}%`);
    console.log(`   总耗时: ${totalDuration}ms`);
    console.log(`   平均耗时: ${Math.round(totalDuration / concurrentCount)}ms`);
    
    // 显示限流错误的详细信息
    if (rateLimited > 0) {
        console.log(`\n⚠️  限流错误详情:`);
        results.filter(r => r.status === 429).forEach(r => {
            console.log(`   请求 ${r.requestId}: ${r.error}`);
        });
    }
    
    // 获取测试后的监控信息
    const afterMonitor = await getMonitorInfo();
    if (afterMonitor) {
        console.log(`\n📊 测试后状态:`);
        console.log(`   活跃请求: ${afterMonitor.requests.active}`);
        console.log(`   总请求数: ${afterMonitor.requests.total}`);
        console.log(`   并发利用率: ${afterMonitor.requests.concurrency.utilization}`);
    }
    
    return {
        concurrentCount,
        successful,
        failed,
        rateLimited,
        errors,
        totalDuration,
        results
    };
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
 * 运行并发测试套件
 */
async function runConcurrentTests() {
    console.log('🚀 并发请求控制测试');
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

    // 2. 获取初始监控信息
    const initialMonitor = await getMonitorInfo();
    if (initialMonitor) {
        console.log('\n📊 初始状态:');
        console.log(`   并发限制: ${initialMonitor.requests.concurrency.limit} (来源: ${initialMonitor.requests.concurrency.source})`);
        console.log(`   配置限制: ${initialMonitor.requests.concurrency.configured}`);
        console.log(`   智能系统: ${initialMonitor.requests.concurrency.source === 'smart' ? '已启用' : '未启用'}`);
    }

    // 3. 运行不同并发数的测试
    const allResults = [];
    
    for (const concurrentCount of TEST_CONFIG.concurrentTests) {
        const result = await testConcurrentRequests(concurrentCount);
        allResults.push(result);
        
        // 等待一段时间让系统恢复
        console.log('\n⏳ 等待系统恢复...');
        await new Promise(resolve => setTimeout(resolve, 3000));
    }

    // 4. 总结报告
    console.log('\n📋 测试总结');
    console.log('='.repeat(60));
    
    allResults.forEach(result => {
        const successRate = Math.round((result.successful / result.concurrentCount) * 100);
        const rateLimitRate = Math.round((result.rateLimited / result.concurrentCount) * 100);
        
        console.log(`并发 ${result.concurrentCount}: 成功率 ${successRate}%, 限流率 ${rateLimitRate}%, 耗时 ${result.totalDuration}ms`);
    });
    
    console.log('\n✅ 并发测试完成！');
}

// 运行测试
if (require.main === module) {
    runConcurrentTests().catch(error => {
        console.error('测试运行失败:', error);
        process.exit(1);
    });
}

module.exports = { testConcurrentRequests, checkServerStatus };
