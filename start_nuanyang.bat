@echo off
chcp 65001 >nul
title 暖阳爬虫控制台

cd /d E:\claw\20260730-15-11-53-783\nuanyang

echo ============================================
echo   暖阳爬虫服务器
echo   控制台: http://localhost:8899/console.html
echo   按 Ctrl+C 退出
echo ============================================
echo.

python -m crawler.main

pause
