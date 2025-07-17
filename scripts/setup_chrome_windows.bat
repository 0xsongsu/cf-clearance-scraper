@echo off
chcp 65001 >nul
echo.
echo ========================================
echo   CF Clearance Scraper - Chrome设置工具
echo ========================================
echo.

echo 🔍 正在检测Chrome浏览器安装...
echo.

:: 检查常见Chrome路径
set CHROME_FOUND=0
set CHROME_PATH_FOUND=

:: 检查用户安装的Chrome
if exist "%USERPROFILE%\AppData\Local\Google\Chrome\Application\chrome.exe" (
    set CHROME_FOUND=1
    set CHROME_PATH_FOUND=%USERPROFILE%\AppData\Local\Google\Chrome\Application\chrome.exe
    echo ✅ 找到Chrome: %USERPROFILE%\AppData\Local\Google\Chrome\Application\chrome.exe
)

:: 检查系统安装的Chrome (64位)
if exist "%PROGRAMFILES%\Google\Chrome\Application\chrome.exe" (
    set CHROME_FOUND=1
    if not defined CHROME_PATH_FOUND set CHROME_PATH_FOUND=%PROGRAMFILES%\Google\Chrome\Application\chrome.exe
    echo ✅ 找到Chrome: %PROGRAMFILES%\Google\Chrome\Application\chrome.exe
)

:: 检查系统安装的Chrome (32位)
if exist "%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe" (
    set CHROME_FOUND=1
    if not defined CHROME_PATH_FOUND set CHROME_PATH_FOUND=%PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe
    echo ✅ 找到Chrome: %PROGRAMFILES(X86)%\Google\Chrome\Application\chrome.exe
)

:: 检查Edge浏览器
if exist "%PROGRAMFILES%\Microsoft\Edge\Application\msedge.exe" (
    if not defined CHROME_PATH_FOUND set CHROME_PATH_FOUND=%PROGRAMFILES%\Microsoft\Edge\Application\msedge.exe
    echo ✅ 找到Edge: %PROGRAMFILES%\Microsoft\Edge\Application\msedge.exe
)

if exist "%PROGRAMFILES(X86)%\Microsoft\Edge\Application\msedge.exe" (
    if not defined CHROME_PATH_FOUND set CHROME_PATH_FOUND=%PROGRAMFILES(X86)%\Microsoft\Edge\Application\msedge.exe
    echo ✅ 找到Edge: %PROGRAMFILES(X86)%\Microsoft\Edge\Application\msedge.exe
)

echo.

if %CHROME_FOUND%==0 (
    echo ❌ 未找到Chrome浏览器安装
    echo.
    echo 🔧 解决方案:
    echo 1. 下载并安装Chrome: https://www.google.com/chrome/
    echo 2. 安装完成后重新运行此脚本
    echo.
    pause
    exit /b 1
)

echo 📋 检测结果:
echo 推荐使用: %CHROME_PATH_FOUND%
echo.

:: 设置环境变量
echo 🔧 正在设置Chrome路径环境变量...
setx CHROME_PATH "%CHROME_PATH_FOUND%" >nul 2>&1

if %ERRORLEVEL%==0 (
    echo ✅ Chrome路径已设置: %CHROME_PATH_FOUND%
    echo.
    echo 💡 环境变量已设置，重新打开命令提示符后生效
    echo.
    echo 🚀 现在可以启动服务:
    echo    npm start
    echo.
) else (
    echo ❌ 设置环境变量失败，请手动设置:
    echo    set CHROME_PATH=%CHROME_PATH_FOUND%
    echo.
)

:: 测试Chrome版本
echo 🧪 测试Chrome版本...
"%CHROME_PATH_FOUND%" --version 2>nul
if %ERRORLEVEL%==0 (
    echo ✅ Chrome可以正常启动
) else (
    echo ⚠️  Chrome启动测试失败，可能需要管理员权限
)

echo.
echo ========================================
echo   设置完成！
echo ========================================
echo.
pause
