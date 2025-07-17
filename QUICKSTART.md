# 🚀 CF Clearance Scraper 快速开始

## 三步启动

```bash
# 1. 克隆仓库
git clone https://github.com/0xsongsu/cf-clearance-scraper.git
cd cf-clearance-scraper

# 2. 安装依赖
npm install

# 3. 启动服务
npm start
```

## 验证服务

```bash
# 健康检查
curl http://localhost:3000/health

# 测试 Turnstile Token
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "type": "cftoken",
    "websiteUrl": "https://turnstile.zeroclover.io/",
    "websiteKey": "0x4AAAAAAAEwzhD6pyKkgXC0"
  }'

# 测试 Cloudflare 5秒盾绕过
curl -X POST http://localhost:3000/ \
  -H "Content-Type: application/json" \
  -d '{
    "type": "cf5s",
    "websiteUrl": "https://loyalty.campnetwork.xyz/home"
  }'
```

## 访问监控

打开浏览器访问: http://localhost:3000/monitor

## 常用配置

```bash
# 复制配置文件
cp .env.example .env

# 修改端口 (可选)
echo "PORT=8080" >> .env

# 启用认证 (可选)
echo "AUTH_TOKEN=your_secret_token" >> .env
```

## 下一步

- 📖 [完整安装指南](docs/INSTALLATION.md)
- 🔧 [API 使用文档](docs/API.md)
- 📚 [详细使用教程](docs/TUTORIAL.md)

## 需要帮助？

- 🐛 [故障排除](docs/TROUBLESHOOTING.md)
- 💬 [提交问题](https://github.com/0xsongsu/cf-clearance-scraper/issues)
