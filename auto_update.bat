@echo off
chcp 65001 >nul
title 暖阳自动更新

cd /d C:\nuanyang

echo ============================================
echo   暖阳自动更新
echo   %date% %time%
echo ============================================
echo.

git fetch https://ghproxy.net/https://github.com/PeaCocoa/nuanyang.git main 2>nul
if %errorlevel% neq 0 (
    echo [WARN] ghproxy镜像失败，尝试直连...
    git fetch https://github.com/PeaCocoa/nuanyang.git main 2>nul
)
if %errorlevel% neq 0 (
    echo [ERROR] 无法连接GitHub，跳过更新
    timeout /t 10 /nobreak >nul
    exit /b 1
)

git reset --hard FETCH_HEAD
echo.
echo [OK] 更新完成
timeout /t 5 /nobreak >nul
