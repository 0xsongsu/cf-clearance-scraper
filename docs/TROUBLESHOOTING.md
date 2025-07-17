# CF Clearance Scraper 故障排除指南

## 🚨 常见问题及解决方案

### 服务启动问题

#### 1. 端口被占用

**错误信息**:
```
Error: listen EADDRINUSE :::3000
```

**解决方案**:
```bash
# 查看端口占用
lsof -i :3000  # Mac/Linux
netstat -ano | findstr :3000  # Windows

# 终止占用进程
kill -9 <PID>  # Mac/Linux
taskkill /PID <PID> /F  # Windows

# 或者更换端口
echo "PORT=8080" > .env
npm start
```

#### 2. Node.js 版本过低

**错误信息**:
```
Error: The engine "node" is incompatible with this module
```

**解决方案**:
```bash
# 使用 nvm 管理 Node.js 版本
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.39.0/install.sh | bash
nvm install --lts
nvm use --lts

# 或直接从官网下载最新版本
# https://nodejs.org/
```

#### 3. 依赖安装失败

**错误信息**:
```
npm ERR! peer dep missing
```

**解决方案**:
```bash
# 清理缓存并重新安装
npm cache clean --force
rm -rf node_modules package-lock.json
npm install

# 或使用 yarn
yarn install
```

#### 4. Chrome 浏览器问题

**错误信息**:
```
Error: Could not find browser
```

**解决方案**:
```bash
# Mac
brew install --cask google-chrome

# Ubuntu/Debian
wget -q -O - https://dl.google.com/linux/linux_signing_key.pub | sudo apt-key add -
sudo sh -c 'echo "deb [arch=amd64] http://dl.google.com/linux/chrome/deb/ stable main" >> /etc/apt/sources.list.d/google-chrome.list'
sudo apt update
sudo apt install google-chrome-stable

# CentOS/RHEL
sudo yum install -y google-chrome-stable
```

### API 请求问题

#### 1. 请求超时

**错误信息**:
```json
{
  "code": 500,
  "message": "Request timeout"
}
```

**解决方案**:
```bash
# 增加超时时间
echo "TIMEOUT=180000" >> .env

# 检查网络连接
ping google.com

# 检查目标网站是否可访问
curl -I https://example.com
```

#### 2. 参数错误

**错误信息**:
```json
{
  "code": 400,
  "message": "websiteUrl is required"
}
```

**解决方案**:
```javascript
// 确保请求包含必需参数
{
  "type": "cftoken",
  "websiteUrl": "https://example.com",  // 必需
  "websiteKey": "your-site-key"         // 必需
}

// cfcookie 请求
{
  "type": "cfcookie",
  "websiteUrl": "https://example.com"   // 必需
}
```

#### 3. 认证失败

**错误信息**:
```json
{
  "code": 401,
  "message": "Authentication failed"
}
```

**解决方案**:
```javascript
// 如果设置了 AUTH_TOKEN，需要在请求中包含
{
  "type": "cftoken",
  "websiteUrl": "https://example.com",
  "websiteKey": "your-site-key",
  "authToken": "your-auth-token"
}
```

### 性能问题

#### 1. 内存使用过高

**症状**: 系统变慢，内存占用持续增长

**解决方案**:
```bash
# 检查内存使用
curl -s http://localhost:3000/api/monitor | grep memory

# 系统会自动管理内存，或手动设置限制
echo "MAX_MEMORY_USAGE=2048" >> .env

# 重启服务
npm start
```

#### 2. 响应时间过长

**症状**: 请求处理时间超过预期

**解决方案**:
```bash
# 检查系统资源
top  # Linux/Mac
taskmgr  # Windows

# 检查并发数设置
curl -s http://localhost:3000/api/performance | grep capacity

# 系统会自动调节，或手动设置
echo "MAX_CONCURRENT_REQUESTS=30" >> .env
```

#### 3. 上下文池耗尽

**症状**: 请求排队等待时间过长

**解决方案**:
```bash
# 检查上下文池状态
curl -s http://localhost:3000/api/performance | grep contextPool

# 系统会自动管理，或手动调整
echo "CONTEXT_POOL_SIZE=30" >> .env

# 重启服务
npm start
```

### Cloudflare 相关问题

#### 1. Turnstile 解决失败

**错误信息**:
```json
{
  "code": 500,
  "message": "Failed to solve Turnstile"
}
```

**解决方案**:
```bash
# 检查网站URL和密钥是否正确
curl -I https://your-target-site.com

# 检查是否有网络限制
curl -v https://challenges.cloudflare.com

# 尝试使用代理
{
  "type": "cftoken",
  "websiteUrl": "https://example.com",
  "websiteKey": "your-key",
  "proxy": {
    "host": "proxy.example.com",
    "port": 8080
  }
}
```

#### 2. cf_clearance 获取失败

**错误信息**:
```json
{
  "code": 500,
  "message": "Failed to get cf_clearance"
}
```

**解决方案**:
```bash
# 检查目标网站是否真的有 Cloudflare 保护
curl -I https://your-target-site.com

# 检查是否返回了 Cloudflare 验证页面
curl -v https://your-target-site.com | grep -i cloudflare

# 增加超时时间
echo "TIMEOUT=120000" >> .env
```

### Docker 相关问题

#### 1. 容器启动失败

**错误信息**:
```
Error: Cannot start container
```

**解决方案**:
```bash
# 检查 Docker 状态
docker --version
docker info

# 重新构建镜像
docker-compose down
docker-compose build --no-cache
docker-compose up -d

# 查看日志
docker-compose logs -f
```

#### 2. 端口映射问题

**错误信息**:
```
Error: Port already in use
```

**解决方案**:
```bash
# 修改 docker-compose.yml 中的端口映射
ports:
  - "8080:3000"  # 改为其他端口

# 或停止占用端口的服务
docker ps
docker stop <container_id>
```

## 🔍 诊断工具

### 1. 健康检查

```bash
# 基础健康检查
curl http://localhost:3000/health

# 详细监控信息
curl http://localhost:3000/api/monitor

# 性能统计
curl http://localhost:3000/api/performance
```

### 2. 日志分析

```bash
# 启动时查看详细日志
NODE_ENV=development npm start

# 使用 PM2 查看日志
pm2 logs cf-clearance-scraper

# Docker 日志
docker-compose logs -f
```

### 3. 性能监控

```bash
# 使用监控脚本
./scripts/performance_monitor.sh

# 实时监控
./scripts/performance_monitor.sh --watch

# Web 监控界面
open http://localhost:3000/monitor
```

## 🆘 获取帮助

### 1. 收集诊断信息

```bash
# 系统信息
uname -a  # Linux/Mac
systeminfo  # Windows

# Node.js 版本
node --version
npm --version

# 服务状态
curl -s http://localhost:3000/api/monitor | python3 -m json.tool

# 错误日志
tail -n 50 ~/.pm2/logs/cf-clearance-scraper-error.log
```

### 2. 常用调试命令

```bash
# 检查进程
ps aux | grep node

# 检查网络连接
netstat -tulpn | grep :3000

# 检查磁盘空间
df -h

# 检查内存使用
free -h  # Linux
vm_stat  # Mac
```

### 3. 重置服务

```bash
# 完全重置
npm run clean  # 如果有清理脚本
rm -rf node_modules package-lock.json
npm install
npm start

# 或使用 Docker 重置
docker-compose down -v
docker-compose up --build -d
```

## 📞 联系支持

如果以上解决方案都无法解决问题：

1. **收集信息**: 错误日志、系统信息、配置文件
2. **重现步骤**: 详细描述如何重现问题
3. **环境信息**: 操作系统、Node.js版本、部署方式
4. **提交 Issue**: 在 GitHub 仓库中创建详细的问题报告

## 🔗 相关链接

- [安装指南](INSTALLATION.md) - 重新安装或升级
- [配置指南](CONFIGURATION.md) - 调整配置参数
- [API 文档](API.md) - 了解正确的使用方法
- [性能优化](PERFORMANCE_OPTIMIZATION.md) - 提升性能表现
