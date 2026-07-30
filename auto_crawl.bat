@echo off
chcp 65001 >nul
title 暖阳定时爬虫

cd /d C:\nuanyang

echo ============================================
echo   暖阳定时爬虫 (轻量API版)
echo   %date% %time%
echo ============================================
echo.

python -m crawler.worker

echo.
echo 爬虫运行完毕，窗口将在10秒后关闭...
timeout /t 10 /nobreak >nul
