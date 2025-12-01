#!/usr/bin/env node
/**
 * 智能压力测试脚本
 * 支持多种并发模式、随机代理、详细统计
 */

const http = require('http');
const { readFileSync } = require('fs');
const path = require('path');

// ==================== 配置 ====================
const config = {
  serviceUrl: process.env.SERVICE_URL || 'http://localhost:3000/',
  sitesFile: path.join(__dirname, '../sites.json'),
  proxiesFile: path.join(__dirname, 'proxies.txt'),
  authToken: process.env.AUTH_TOKEN || '',

  // 压力测试配置
  totalRequests: Number(process.env.TOTAL_REQUESTS) || 2000,

  // 代理使用概率 (0-1, 0.5 表示 50% 的请求使用代理)
  proxyProbability: Number(process.env.PROXY_PROBABILITY) || 0.5,

  // 压力测试阶段配置
  phases: [
    { name: '预热阶段', concurrency: 5, requests: 50, description: '低并发预热系统' },
    { name: '轻度并发', concurrency: 15, requests: 200, description: '模拟正常使用场景' },
    { name: '中度并发', concurrency: 30, requests: 400, description: '模拟中等负载' },
    { name: '高度并发', concurrency: 50, requests: 500, description: '模拟高负载场景' },
    { name: '极限并发', concurrency: 80, requests: 600, description: '测试系统极限' },
    { name: '恢复测试', concurrency: 20, requests: 250, description: '验证系统恢复能力' },
  ],
};

// ==================== 颜色输出 ====================
const c = {
  reset: '\x1b[0m',
  bright: '\x1b[1m',
  dim: '\x1b[2m',
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  magenta: '\x1b[35m',
  cyan: '\x1b[36m',
  white: '\x1b[37m',
  bgRed: '\x1b[41m',
  bgGreen: '\x1b[42m',
  bgYellow: '\x1b[43m',
  bgBlue: '\x1b[44m',
};

const log = {
  info: (msg) => console.log(`${c.cyan}[INFO]${c.reset} ${msg}`),
  success: (msg) => console.log(`${c.green}[SUCCESS]${c.reset} ${msg}`),
  error: (msg) => console.log(`${c.red}[ERROR]${c.reset} ${msg}`),
  warn: (msg) => console.log(`${c.yellow}[WARN]${c.reset} ${msg}`),
  phase: (msg) => console.log(`\n${c.bgBlue}${c.white}${c.bright} ${msg} ${c.reset}\n`),
  stat: (label, value) => console.log(`  ${c.dim}${label}:${c.reset} ${value}`),
};

// ==================== 工具函数 ====================
function formatDuration(ms) {
  if (ms < 1000) return `${Math.round(ms)}ms`;
  if (ms < 60000) return `${(ms / 1000).toFixed(1)}s`;
  return `${(ms / 60000).toFixed(1)}min`;
}

function formatNumber(num) {
  return num.toLocaleString('zh-CN');
}

function shortUrl(url) {
  try {
    return new URL(url).hostname.replace('www.', '');
  } catch {
    return url.substring(0, 25);
  }
}

function percentile(arr, p) {
  if (!arr.length) return 0;
  const sorted = arr.slice().sort((a, b) => a - b);
  const idx = Math.floor(sorted.length * p);
  return sorted[Math.min(idx, sorted.length - 1)];
}

function average(arr) {
  if (!arr.length) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stdDev(arr) {
  if (arr.length < 2) return 0;
  const avg = average(arr);
  const squareDiffs = arr.map(v => Math.pow(v - avg, 2));
  return Math.sqrt(average(squareDiffs));
}

// ==================== 代理解析 ====================
function loadProxies(filePath) {
  try {
    const content = readFileSync(filePath, 'utf8');
    const proxies = content.split('\n')
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#'))
      .map(line => {
        const parts = line.split(':');
        if (parts.length >= 4) {
          return {
            host: parts[0],
            port: Number(parts[1]),  // 确保 port 是整数
            username: parts[2],
            password: parts[3],
          };
        } else if (parts.length >= 2) {
          return { host: parts[0], port: Number(parts[1]) };
        }
        return null;
      })
      .filter(Boolean);

    return proxies;
  } catch (e) {
    log.warn(`无法加载代理文件: ${e.message}`);
    return [];
  }
}

function getRandomProxy(proxies) {
  if (!proxies.length) return null;
  return proxies[Math.floor(Math.random() * proxies.length)];
}

// ==================== HTTP 请求 ====================
function postJson(url, body, timeout = 180000) {
  return new Promise((resolve) => {
    const data = Buffer.from(JSON.stringify(body));
    const urlObj = new URL(url);
    const startTime = Date.now();

    const req = http.request({
      method: 'POST',
      hostname: urlObj.hostname,
      port: urlObj.port || 80,
      path: urlObj.pathname,
      headers: {
        'Content-Type': 'application/json',
        'Content-Length': data.length,
      },
      timeout,
    }, (res) => {
      const chunks = [];
      res.on('data', (d) => chunks.push(d));
      res.on('end', () => {
        const raw = Buffer.concat(chunks).toString('utf8');
        let json = null;
        try { json = JSON.parse(raw); } catch {}
        resolve({
          status: res.statusCode,
          body: json,
          raw,
          duration: Date.now() - startTime
        });
      });
    });

    req.on('error', (err) => resolve({
      status: 0,
      error: String(err),
      duration: Date.now() - startTime
    }));

    req.on('timeout', () => {
      req.destroy();
      resolve({
        status: 0,
        error: 'Request timeout',
        duration: Date.now() - startTime
      });
    });

    req.write(data);
    req.end();
  });
}

// ==================== 统计类 ====================
class PhaseStats {
  constructor(name, concurrency) {
    this.name = name;
    this.concurrency = concurrency;
    this.startTime = null;
    this.endTime = null;
    this.total = 0;
    this.success = 0;
    this.failed = 0;
    this.pending = 0;
    this.latencies = [];
    this.successLatencies = [];
    this.errors = new Map();
    this.bySite = new Map();
    this.withProxy = { success: 0, failed: 0, latencies: [] };
    this.withoutProxy = { success: 0, failed: 0, latencies: [] };
  }

  start() {
    this.startTime = Date.now();
  }

  end() {
    this.endTime = Date.now();
  }

  record(result) {
    this.total++;
    this.latencies.push(result.duration);

    // 站点统计
    const siteKey = result.site;
    if (!this.bySite.has(siteKey)) {
      this.bySite.set(siteKey, { success: 0, failed: 0, latencies: [] });
    }
    const siteStats = this.bySite.get(siteKey);

    // 代理统计
    const proxyStats = result.usedProxy ? this.withProxy : this.withoutProxy;

    if (result.success) {
      this.success++;
      this.successLatencies.push(result.duration);
      siteStats.success++;
      siteStats.latencies.push(result.duration);
      proxyStats.success++;
      proxyStats.latencies.push(result.duration);
    } else {
      this.failed++;
      siteStats.failed++;
      proxyStats.failed++;
      const errKey = result.error || 'Unknown error';
      this.errors.set(errKey, (this.errors.get(errKey) || 0) + 1);
    }
  }

  getReport() {
    const duration = (this.endTime || Date.now()) - this.startTime;
    const successRate = this.total > 0 ? (this.success / this.total * 100) : 0;
    const throughput = duration > 0 ? (this.total / duration * 1000) : 0;

    return {
      name: this.name,
      concurrency: this.concurrency,
      duration,
      total: this.total,
      success: this.success,
      failed: this.failed,
      successRate,
      throughput,
      latency: {
        avg: Math.round(average(this.successLatencies)),
        min: Math.round(Math.min(...this.successLatencies) || 0),
        max: Math.round(Math.max(...this.successLatencies) || 0),
        p50: Math.round(percentile(this.successLatencies, 0.5)),
        p95: Math.round(percentile(this.successLatencies, 0.95)),
        p99: Math.round(percentile(this.successLatencies, 0.99)),
        stdDev: Math.round(stdDev(this.successLatencies)),
      },
      proxy: {
        with: this.withProxy,
        without: this.withoutProxy,
      },
      errors: Array.from(this.errors.entries()).sort((a, b) => b[1] - a[1]),
      bySite: this.bySite,
    };
  }
}

class GlobalStats {
  constructor() {
    this.phases = [];
    this.startTime = null;
    this.endTime = null;
  }

  start() {
    this.startTime = Date.now();
  }

  end() {
    this.endTime = Date.now();
  }

  addPhase(phaseStats) {
    this.phases.push(phaseStats.getReport());
  }

  getReport() {
    const totalRequests = this.phases.reduce((sum, p) => sum + p.total, 0);
    const totalSuccess = this.phases.reduce((sum, p) => sum + p.success, 0);
    const totalFailed = this.phases.reduce((sum, p) => sum + p.failed, 0);
    const allLatencies = this.phases.flatMap(p =>
      Array.from({ length: p.success }, (_, i) => p.latency.avg)
    );
    const duration = this.endTime - this.startTime;

    return {
      duration,
      totalRequests,
      totalSuccess,
      totalFailed,
      overallSuccessRate: totalRequests > 0 ? (totalSuccess / totalRequests * 100) : 0,
      overallThroughput: duration > 0 ? (totalRequests / duration * 1000) : 0,
      phases: this.phases,
    };
  }
}

// ==================== 进度显示 ====================
class ProgressBar {
  constructor(total, phaseName, concurrency) {
    this.total = total;
    this.current = 0;
    this.success = 0;
    this.failed = 0;
    this.pending = 0;
    this.phaseName = phaseName;
    this.concurrency = concurrency;
    this.startTime = Date.now();
    this.lastPrint = 0;
  }

  update(success, failed, pending) {
    this.current = success + failed;
    this.success = success;
    this.failed = failed;
    this.pending = pending;

    // 限制打印频率
    const now = Date.now();
    if (now - this.lastPrint < 100 && this.current < this.total) return;
    this.lastPrint = now;

    this.print();
  }

  print() {
    const percent = Math.round((this.current / this.total) * 100);
    const barLength = 25;
    const filled = Math.round((this.current / this.total) * barLength);
    const bar = '█'.repeat(filled) + '░'.repeat(barLength - filled);

    const elapsed = Date.now() - this.startTime;
    const rate = this.current > 0 ? (this.current / elapsed * 1000).toFixed(1) : '0.0';
    const eta = this.current > 0 ? formatDuration((this.total - this.current) / (this.current / elapsed) * 1000) : '--';

    const successRate = this.current > 0 ? ((this.success / this.current) * 100).toFixed(1) : '0.0';

    process.stdout.write(`\r${c.cyan}[${this.phaseName}]${c.reset} ${bar} ${percent}% | ` +
      `${c.green}✓${this.success}${c.reset} ${c.red}✗${this.failed}${c.reset} ` +
      `${c.yellow}⏳${this.pending}${c.reset} | ` +
      `${rate}/s | 成功率:${successRate}% | ETA:${eta}   `);
  }

  finish() {
    this.print();
    console.log('');
  }
}

// ==================== 测试执行器 ====================
async function runPhase(phase, sites, proxies, globalStats) {
  log.phase(`${phase.name} - 并发: ${phase.concurrency}, 请求: ${phase.requests}`);
  log.info(phase.description);

  const stats = new PhaseStats(phase.name, phase.concurrency);
  const progress = new ProgressBar(phase.requests, phase.name, phase.concurrency);

  stats.start();

  let completed = 0;
  let started = 0;
  let pending = 0;

  const runRequest = async (index) => {
    pending++;
    progress.update(stats.success, stats.failed, pending);

    const site = sites[index % sites.length];
    const useProxy = Math.random() < config.proxyProbability;
    const proxy = useProxy ? getRandomProxy(proxies) : null;

    const body = {
      type: 'cftoken',
      websiteUrl: site.websiteUrl,
      websiteKey: site.websiteKey,
    };

    if (proxy) {
      body.proxy = proxy;
    }

    if (config.authToken) {
      body.authToken = config.authToken;
    }

    const resp = await postJson(config.serviceUrl, body);

    pending--;

    const result = {
      site: site.websiteUrl,
      duration: resp.duration,
      success: false,
      error: null,
      usedProxy: !!proxy,
    };

    if (resp.status === 200 && resp.body && resp.body.token) {
      result.success = true;
    } else {
      result.error = resp.body?.message || resp.error || `HTTP ${resp.status}`;
    }

    stats.record(result);
    progress.update(stats.success, stats.failed, pending);

    return result;
  };

  // 并发控制调度器
  const promises = [];

  while (started < phase.requests || pending > 0) {
    // 启动新请求
    while (pending < phase.concurrency && started < phase.requests) {
      const index = started++;
      promises.push(runRequest(index));
    }

    // 短暂等待
    await new Promise(r => setTimeout(r, 10));
  }

  // 等待所有请求完成
  await Promise.all(promises);

  stats.end();
  progress.finish();

  // 打印阶段报告
  const report = stats.getReport();
  printPhaseReport(report);

  globalStats.addPhase(stats);

  // 阶段间休息
  log.info('阶段间休息 3 秒...');
  await new Promise(r => setTimeout(r, 3000));

  return report;
}

function printPhaseReport(report) {
  console.log(`\n${c.bright}--- ${report.name} 结果 ---${c.reset}`);

  log.stat('总请求', formatNumber(report.total));
  log.stat('成功', `${c.green}${formatNumber(report.success)}${c.reset} (${report.successRate.toFixed(1)}%)`);
  log.stat('失败', `${c.red}${formatNumber(report.failed)}${c.reset}`);
  log.stat('耗时', formatDuration(report.duration));
  log.stat('吞吐量', `${report.throughput.toFixed(2)} req/s`);

  console.log(`\n${c.dim}  延迟统计:${c.reset}`);
  log.stat('    平均', formatDuration(report.latency.avg));
  log.stat('    P50', formatDuration(report.latency.p50));
  log.stat('    P95', formatDuration(report.latency.p95));
  log.stat('    P99', formatDuration(report.latency.p99));
  log.stat('    最小/最大', `${formatDuration(report.latency.min)} / ${formatDuration(report.latency.max)}`);

  console.log(`\n${c.dim}  代理统计:${c.reset}`);
  const proxyTotal = report.proxy.with.success + report.proxy.with.failed;
  const noProxyTotal = report.proxy.without.success + report.proxy.without.failed;
  const proxySuccessRate = proxyTotal > 0 ? (report.proxy.with.success / proxyTotal * 100).toFixed(1) : 0;
  const noProxySuccessRate = noProxyTotal > 0 ? (report.proxy.without.success / noProxyTotal * 100).toFixed(1) : 0;
  log.stat('    有代理', `${proxyTotal} 请求, 成功率 ${proxySuccessRate}%`);
  log.stat('    无代理', `${noProxyTotal} 请求, 成功率 ${noProxySuccessRate}%`);

  if (report.errors.length > 0) {
    console.log(`\n${c.dim}  错误统计 (Top 3):${c.reset}`);
    report.errors.slice(0, 3).forEach(([err, count]) => {
      log.stat('   ', `${count}x ${err.substring(0, 50)}`);
    });
  }
}

function printFinalReport(report) {
  console.log('\n');
  console.log(`${c.bgGreen}${c.white}${c.bright}${'═'.repeat(60)}${c.reset}`);
  console.log(`${c.bgGreen}${c.white}${c.bright}${'                    最终测试报告                    '}${c.reset}`);
  console.log(`${c.bgGreen}${c.white}${c.bright}${'═'.repeat(60)}${c.reset}`);

  console.log(`\n${c.bright}[总体统计]${c.reset}`);
  log.stat('总测试时间', formatDuration(report.duration));
  log.stat('总请求数', formatNumber(report.totalRequests));
  log.stat('总成功', `${c.green}${formatNumber(report.totalSuccess)}${c.reset}`);
  log.stat('总失败', `${c.red}${formatNumber(report.totalFailed)}${c.reset}`);
  log.stat('总体成功率', `${report.overallSuccessRate.toFixed(2)}%`);
  log.stat('平均吞吐量', `${report.overallThroughput.toFixed(2)} req/s`);

  console.log(`\n${c.bright}[各阶段对比]${c.reset}`);
  console.log(`\n  ${'阶段'.padEnd(12)}${'并发'.padStart(6)}${'成功率'.padStart(10)}${'吞吐量'.padStart(12)}${'P50'.padStart(10)}${'P95'.padStart(10)}`);
  console.log(`  ${'-'.repeat(60)}`);

  report.phases.forEach(phase => {
    const row = `  ${phase.name.padEnd(12)}` +
      `${String(phase.concurrency).padStart(6)}` +
      `${(phase.successRate.toFixed(1) + '%').padStart(10)}` +
      `${(phase.throughput.toFixed(1) + '/s').padStart(12)}` +
      `${formatDuration(phase.latency.p50).padStart(10)}` +
      `${formatDuration(phase.latency.p95).padStart(10)}`;
    console.log(row);
  });

  // 性能评估
  console.log(`\n${c.bright}[性能评估]${c.reset}`);

  const avgSuccessRate = report.overallSuccessRate;
  const highLoadPhase = report.phases.find(p => p.name === '极限并发');
  const recoveryPhase = report.phases.find(p => p.name === '恢复测试');

  let grade = 'A';
  const issues = [];

  if (avgSuccessRate < 80) {
    grade = 'D';
    issues.push('整体成功率过低');
  } else if (avgSuccessRate < 90) {
    grade = 'C';
    issues.push('成功率有待提升');
  } else if (avgSuccessRate < 95) {
    grade = 'B';
  }

  if (highLoadPhase && highLoadPhase.successRate < 70) {
    if (grade > 'C') grade = 'C';
    issues.push('极限并发下性能下降明显');
  }

  if (recoveryPhase && recoveryPhase.successRate < avgSuccessRate - 10) {
    issues.push('系统恢复能力不足');
  }

  const gradeColor = grade === 'A' ? c.green : grade === 'B' ? c.cyan : grade === 'C' ? c.yellow : c.red;
  log.stat('综合评级', `${gradeColor}${c.bright}${grade}${c.reset}`);

  if (issues.length > 0) {
    console.log(`\n${c.yellow}  改进建议:${c.reset}`);
    issues.forEach(issue => console.log(`    • ${issue}`));
  } else {
    console.log(`\n${c.green}  系统性能表现优秀!${c.reset}`);
  }

  console.log('\n' + '═'.repeat(60) + '\n');
}

// ==================== 主函数 ====================
async function main() {
  console.log(`\n${c.cyan}${c.bright}`);
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           Turnstile 智能压力测试工具 v2.0                  ║');
  console.log('║     支持多阶段并发、随机代理、详细统计                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝');
  console.log(`${c.reset}\n`);

  // 加载配置
  let sites, proxies;

  try {
    sites = JSON.parse(readFileSync(config.sitesFile, 'utf8'));
    log.success(`加载 ${sites.length} 个测试站点`);
    sites.forEach((s, i) => {
      console.log(`  ${i + 1}. ${shortUrl(s.websiteUrl)}`);
    });
  } catch (e) {
    log.error(`无法加载站点配置: ${e.message}`);
    process.exit(1);
  }

  proxies = loadProxies(config.proxiesFile);
  if (proxies.length > 0) {
    log.success(`加载 ${proxies.length} 个代理`);
  } else {
    log.warn('未加载任何代理，将不使用代理进行测试');
    config.proxyProbability = 0;
  }

  console.log('');
  log.info(`服务地址: ${config.serviceUrl}`);
  log.info(`代理使用概率: ${(config.proxyProbability * 100).toFixed(0)}%`);
  log.info(`总测试请求: ${config.phases.reduce((sum, p) => sum + p.requests, 0)}`);

  console.log(`\n${c.dim}测试阶段:${c.reset}`);
  config.phases.forEach((p, i) => {
    console.log(`  ${i + 1}. ${p.name} - 并发${p.concurrency}, ${p.requests}请求`);
  });

  // 等待用户确认
  console.log(`\n${c.yellow}3秒后开始测试...${c.reset}`);
  await new Promise(r => setTimeout(r, 3000));

  // 执行测试
  const globalStats = new GlobalStats();
  globalStats.start();

  for (const phase of config.phases) {
    await runPhase(phase, sites, proxies, globalStats);
  }

  globalStats.end();

  // 打印最终报告
  const finalReport = globalStats.getReport();
  printFinalReport(finalReport);

  log.success('压力测试完成!');
}

// 运行
main().catch(e => {
  log.error(`测试失败: ${e.message}`);
  console.error(e);
  process.exit(1);
});
