@echo off
chcp 65001 >nul
title 暖阳项目 - 环境安装

echo ============================================
echo   暖阳项目 - 环境安装脚本
echo ============================================
echo.

echo [1/3] 安装 Python 依赖包...
pip install playwright
if %errorlevel% neq 0 (
    echo [错误] pip install 失败，请检查 pip 是否可用
    pause
    exit /b 1
)
echo.

echo [2/3] 下载 Chromium 浏览器引擎（约几百MB，请耐心等待）...
playwright install chromium
if %errorlevel% neq 0 (
    echo [错误] Chromium 下载失败，请检查网络连接
    pause
    exit /b 1
)
echo.

echo [3/3] 安装完成！
echo.
echo ============================================
echo   安装成功！接下来请运行：
echo   start_nuanyang.bat
echo   然后在浏览器打开 http://localhost:8899/console.html
echo ============================================
echo.
pause
