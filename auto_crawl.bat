@echo off
chcp 65001 >nul
title 暖阳定时爬虫

cd /d E:\claw\20260730-15-11-53-783\nuanyang

echo ============================================
echo   暖阳定时爬虫 (无人值守)
echo   %date% %time%
echo ============================================
echo.

set NUANYANG_HEADLESS=1
python -m crawler.worker

echo.
echo 爬虫运行完毕，窗口将在10秒后关闭...
timeout /t 10 /nobreak >nul
