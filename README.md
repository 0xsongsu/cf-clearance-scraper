# CF Clearance Scraper

本地版本的 Cloudflare 保护绕过工具，支持 Turnstile 令牌生成和 WAF 会话创建。

## 📸 项目展示

![本地打码服务监控](assets/dashboard.png)
> 实时监控面板展示服务状态、性能指标和请求统计，支持 CPU、内存监控和双折线图表

## 版本信息

**当前版本：v1.0.3** 🚀

### 版本记录

| 版本 | 发布时间 | 主要更新 |
|------|----------|----------|
| **v1.0.3** | 2025-06 | ⚡ 优化内存管理和系统性能监控<br/>📊 增强实时监控面板<br/>🚀 完善一键部署脚本<br/>🛠️ 重构文档结构，提升用户体验 |
| **v1.0.2** | 2025-05 | 🔧 优化 Turnstile 解决算法<br/>📈 改进监控系统稳定性<br/>🐛 修复内存泄漏问题 |
| **v1.0.1** | 2025-04 | 🎯 初始版本发布<br/>✅ 基础 Cloudflare 绕过功能<br/>📊 实时监控面板 |

## 致谢开发者

本项目基于以下优秀开源项目构建：

- [ZFC-Digital/cf-clearance-scraper](https://github.com/ZFC-Digital/cf-clearance-scraper) - Cloudflare绕过基础

## 支持功能

| 功能类型 | 支持状态 | 说明 |
|---------|---------|------|
| **Cloudflare Turnstile** | ✅ | 支持轻量级和完整页面模式 |
| **实时监控面板** | ✅ | 服务状态和性能指标监控 |
| **代理支持** | ✅ | HTTP/HTTPS 代理配置 |

## 快速开始

### 安装
```bash
npm install
```

### 启动服务
```bash
npm start
```

### API 使用
```javascript
// 获取 Cloudflare Turnstile token
fetch('http://localhost:3000/', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
        type: "cftoken",
        websiteUrl: "https://example.com",
        websiteKey: "your-site-key"
    })
})
```

详细文档：[🔧 API文档](docs/API.md) | [⚙️ 配置指南](docs/CONFIGURATION.md)

## 免责声明

⚠️ 本工具仅用于测试和学习目的。使用者需对任何可能产生的法律责任承担责任。本库不意图对任何网站或公司造成损害，使用者对可能产生的任何损害承担责任。

## 许可证

ISC License - 详见 [LICENSE](LICENSE.md) 文件