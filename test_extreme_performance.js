#!/usr/bin/env node
/**
 * 极致性能模式基准测试
 * 验证系统在极致性能压榨模式下的表现
 */

const TEST_CONFIG = {
    server: {
        host: 'localhost',
        port: 3000,
        timeout: 60000
    },
    testUrl: 'https://loyalty.campnetwork.xyz/loyalty',
    // 极致性能测试：更高的并发数
    concurrentTests: [10, 25, 50, 75, 100, 150, 200, 300, 500]
};

/**
 * 获取系统监控信息
 */
async function getSystemMonitor() {
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
 * 发送单个测试请求
 */
async function sendTestRequest(requestId, testName) {
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
            testName,
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
            testName,
            status: 0,
            duration,
            success: false,
            error: error.message,
            result: null
        };
    }
}

/**
 * 极致性能压力测试
 */
async function extremePerformanceTest(concurrentCount) {
    console.log(`\n🔥 极致性能测试 - ${concurrentCount} 并发`);
    console.log('='.repeat(60));
    
    // 获取测试前的系统状态
    const beforeMonitor = await getSystemMonitor();
    if (beforeMonitor) {
        console.log(`📊 测试前状态:`);
        console.log(`   并发模式: ${beforeMonitor.requests.concurrency.mode}`);
        console.log(`   并发限制: ${beforeMonitor.requests.concurrency.limit} (${beforeMonitor.requests.concurrency.cpuMultiplier})`);
        console.log(`   活跃请求: ${beforeMonitor.requests.active}`);
        console.log(`   内存使用: ${beforeMonitor.memory.used} / ${beforeMonitor.memory.max} (${beforeMonitor.memory.percent})`);
    }
    
    const startTime = Date.now();
    
    // 创建极高并发请求
    const promises = [];
    for (let i = 0; i < concurrentCount; i++) {
        promises.push(sendTestRequest(i + 1, `extreme-${concurrentCount}`));
    }
    
    console.log(`🚀 发送 ${concurrentCount} 个极致并发请求...`);
    
    // 等待所有请求完成
    const results = await Promise.all(promises);
    
    const totalDuration = Date.now() - startTime;
    
    // 分析结果
    const successful = results.filter(r => r.success).length;
    const failed = results.filter(r => !r.success).length;
    const rateLimited = results.filter(r => r.status === 429).length;
    const errors = results.filter(r => r.status === 0).length;
    const avgDuration = results.reduce((sum, r) => sum + r.duration, 0) / results.length;
    const minDuration = Math.min(...results.map(r => r.duration));
    const maxDuration = Math.max(...results.map(r => r.duration));
    
    console.log(`\n📈 极致性能测试结果:`);
    console.log(`   🎯 总请求数: ${concurrentCount}`);
    console.log(`   ✅ 成功: ${successful} (${Math.round((successful / concurrentCount) * 100)}%)`);
    console.log(`   ❌ 失败: ${failed}`);
    console.log(`   🚫 限流(429): ${rateLimited}`);
    console.log(`   💥 网络错误: ${errors}`);
    console.log(`   ⏱️  总耗时: ${totalDuration}ms`);
    console.log(`   📊 平均耗时: ${Math.round(avgDuration)}ms`);
    console.log(`   ⚡ 最快: ${minDuration}ms`);
    console.log(`   🐌 最慢: ${maxDuration}ms`);
    console.log(`   🚀 吞吐量: ${Math.round((successful / (totalDuration / 1000)) * 100) / 100} 请求/秒`);
    
    // 获取测试后的系统状态
    const afterMonitor = await getSystemMonitor();
    if (afterMonitor) {
        console.log(`\n📊 测试后状态:`);
        console.log(`   活跃请求: ${afterMonitor.requests.active}`);
        console.log(`   总请求数: ${afterMonitor.requests.total}`);
        console.log(`   并发利用率: ${afterMonitor.requests.concurrency.utilization}`);
        console.log(`   内存使用: ${afterMonitor.memory.used} / ${afterMonitor.memory.max} (${afterMonitor.memory.percent})`);
    }
    
    // 性能评级
    const successRate = (successful / concurrentCount) * 100;
    const throughput = successful / (totalDuration / 1000);
    
    let performanceGrade = '🔴 差';
    if (successRate >= 95 && throughput >= 5) {
        performanceGrade = '🟢 优秀';
    } else if (successRate >= 90 && throughput >= 3) {
        performanceGrade = '🟡 良好';
    } else if (successRate >= 80 && throughput >= 1) {
        performanceGrade = '🟠 一般';
    }
    
    console.log(`\n🏆 性能评级: ${performanceGrade}`);
    console.log(`   成功率: ${Math.round(successRate)}% (目标: ≥95%)`);
    console.log(`   吞吐量: ${Math.round(throughput * 100) / 100} 请求/秒 (目标: ≥5)`);
    
    return {
        concurrentCount,
        successful,
        failed,
        rateLimited,
        errors,
        totalDuration,
        avgDuration,
        minDuration,
        maxDuration,
        throughput,
        successRate,
        performanceGrade,
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
 * 运行极致性能基准测试
 */
async function runExtremePerformanceTests() {
    console.log('🔥 极致性能模式基准测试');
    console.log('='.repeat(80));
    console.log(`🌐 测试服务: http://${TEST_CONFIG.server.host}:${TEST_CONFIG.server.port}`);
    console.log(`🎯 测试网站: ${TEST_CONFIG.testUrl}`);
    console.log(`⚡ 测试模式: 极致性能压榨`);
    console.log('='.repeat(80));

    // 1. 检查服务状态
    console.log('\n📡 检查服务状态...');
    const serverStatus = await checkServerStatus();
    
    if (!serverStatus) {
        console.log('❌ 服务未运行或无法连接');
        console.log('   请确保服务已启动: npm start');
        process.exit(1);
    }
    
    console.log('✅ 服务运行正常');

    // 2. 获取初始系统信息
    const initialMonitor = await getSystemMonitor();
    if (initialMonitor) {
        console.log('\n🔥 极致性能模式状态:');
        console.log(`   模式: ${initialMonitor.requests.concurrency.mode}`);
        console.log(`   并发限制: ${initialMonitor.requests.concurrency.limit} (${initialMonitor.requests.concurrency.cpuMultiplier})`);
        console.log(`   数据来源: ${initialMonitor.requests.concurrency.source}`);
        console.log(`   内存限制: ${initialMonitor.memory.max}`);
    }

    // 3. 运行极致性能测试
    const allResults = [];
    
    for (const concurrentCount of TEST_CONFIG.concurrentTests) {
        const result = await extremePerformanceTest(concurrentCount);
        allResults.push(result);
        
        // 等待系统恢复
        console.log('\n⏳ 等待系统恢复...');
        await new Promise(resolve => setTimeout(resolve, 5000));
    }

    // 4. 生成性能报告
    console.log('\n📋 极致性能基准报告');
    console.log('='.repeat(80));
    
    console.log('| 并发数 | 成功率 | 吞吐量(req/s) | 平均耗时(ms) | 性能评级 |');
    console.log('|--------|--------|---------------|--------------|----------|');
    
    allResults.forEach(result => {
        console.log(`| ${result.concurrentCount.toString().padEnd(6)} | ${Math.round(result.successRate).toString().padEnd(6)}% | ${result.throughput.toFixed(2).padEnd(13)} | ${Math.round(result.avgDuration).toString().padEnd(12)} | ${result.performanceGrade.padEnd(8)} |`);
    });
    
    // 5. 找出最佳性能点
    const bestResult = allResults
        .filter(r => r.successRate >= 95)
        .sort((a, b) => b.throughput - a.throughput)[0];
    
    if (bestResult) {
        console.log(`\n🏆 最佳性能点:`);
        console.log(`   并发数: ${bestResult.concurrentCount}`);
        console.log(`   成功率: ${Math.round(bestResult.successRate)}%`);
        console.log(`   吞吐量: ${bestResult.throughput.toFixed(2)} 请求/秒`);
        console.log(`   平均耗时: ${Math.round(bestResult.avgDuration)}ms`);
    }
    
    console.log('\n✅ 极致性能基准测试完成！');
    console.log('💡 建议: 根据测试结果调整系统配置以获得最佳性能');
}

// 运行测试
if (require.main === module) {
    runExtremePerformanceTests().catch(error => {
        console.error('测试运行失败:', error);
        process.exit(1);
    });
}

module.exports = { extremePerformanceTest, checkServerStatus };
