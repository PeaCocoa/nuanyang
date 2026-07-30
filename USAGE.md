# 暖阳爬虫使用指南

## 环境要求

- Python 3.9+
- Playwright + Chromium
- 网络：需能访问 bilibili.com

## 一、安装

双击运行 `install.bat`，或手动执行：

```bash
cd E:\claw\20260730-15-11-53-783\nuanyang
pip install playwright
playwright install chromium
```

> Chromium 引擎约几百MB，首次下载需等待几分钟。

## 二、启动服务器

双击运行 `start_nuanyang.bat`，或手动执行：

```bash
cd E:\claw\20260730-15-11-53-783\nuanyang
python -m crawler.main
```

启动后看到以下输出表示成功：

```
暖阳爬虫服务器
控制台: http://localhost:8899/console.html
按 Ctrl+C 退出
[INFO] 控制台地址: http://localhost:8899/console.html
[INFO] 等待手动启动爬虫（在控制台点击"立即开爬"）
```

> 服务器启动后会常驻运行，不要关闭命令行窗口。

## 三、使用控制台

浏览器打开 `http://localhost:8899/console.html`，控制台有两个标签页：

### 监控页

- 顶部显示爬虫状态（空闲/运行中/已完成/出错）
- 左侧统计卡片：已完成UP主数、抓取视频数
- 进度条显示总体进度
- UP主列表实时更新每个UP主的状态（待处理/搜索中/获取详情/筛选中/完成/失败）
- 右侧实时日志区，滚动显示每一步操作

### 设置页

| 设置项 | 说明 | 默认值 |
|-------|------|-------|
| 测试模式 | 只爬前2个UP主，用于快速验证 | 关 |
| 每个UP主爬取数量 | 每位UP主最多保留多少条视频 | 5 |
| 最短时长（秒） | 短于此时间的视频被过滤 | 60 |
| 最长时长（秒） | 长于此时间的视频被过滤 | 3600（60分钟） |
| 投稿时间限制（天） | 0=不限制，仅保留最近N天的投稿 | 0 |
| UP主选择 | 勾选要爬的UP主，不勾选则爬全部 | 全部 |

设置修改后点击"保存设置"按钮，下次启动爬虫时生效。

## 四、开始爬取

### 手动启动

在控制台监控页点击右上角"立即开爬"按钮，爬虫在后台启动。

### 自动启动

```bash
python -m crawler.main --auto
```

启动服务器后自动开始爬取。

### 首次使用需登录

首次运行时，会弹出Chromium浏览器窗口：
1. 页面会跳转到B站登录页
2. 用手机B站APP扫码登录
3. 登录成功后程序自动继续，无需额外操作

登录信息保存在 `auth/` 目录，之后运行无需重复登录。

## 五、爬取流程

每个UP主的处理顺序：

1. **搜索**：通过B站搜索API按投稿时间排序搜索该UP主的视频
2. **匹配**：精确匹配搜索结果中的作者名，过滤同名UP主
3. **获取详情**：逐个调用视频详情API获取完整信息（时长、播放量等）
4. **筛选**：按时长、关键词、投稿时间等条件过滤
5. **保存**：写入 `data/videos.json` 并同步到 `web/data/videos.json`

所有UP主处理完毕后：
- 数据自动写入文件
- 尝试推送到GitHub（需配置git remote和认证）

## 六、测试模式

在设置页开启"测试模式"后，只爬取前2个UP主（小约翰可汗、正直讲史-李正Str），约1分钟可完成。用于验证爬虫流程是否正常。

## 七、数据文件说明

| 文件 | 说明 |
|------|------|
| `data/videos.json` | 爬取的视频数据（主文件） |
| `data/upmasters.json` | UP主配置清单（24位） |
| `data/crawl_status.json` | 爬虫运行状态（控制台读取） |
| `data/crawl_settings.json` | 爬虫设置（控制台保存） |
| `web/data/videos.json` | 前端使用的视频数据（自动同步） |
| `auth/` | Playwright浏览器持久化数据（含登录Cookie） |

## 八、常见问题

### Q: 控制台打开显示全0

服务器需要先启动。确认命令行窗口中显示 `[INFO] 控制台地址: http://localhost:8899/console.html`。如果端口被占用，先关闭旧进程再重启。

### Q: 爬虫启动后搜索结果为0

B站搜索API有风控，可能间歇性返回空结果。爬虫内置3次重试机制，如果仍然失败，等待几分钟后重试。

### Q: 所有视频都被筛选过滤

检查设置页中的时长限制。历史类视频普遍较长（30-60分钟），默认上限为3600秒（60分钟）。如需抓取更长视频，调大此值。

### Q: Git推送失败

需先初始化git仓库并配置远程地址：

```bash
cd E:\claw\20260730-15-11-53-783\nuanyang
git init
git remote add origin https://github.com/你的用户名/nuanyang.git
```

并配置认证（Personal Access Token 或 SSH Key）。Token 需勾选 `repo` 和 `workflow` 权限。

### Q: 端口8899被占用

```bash
# 查找占用进程
netstat -ano | findstr 8899
# 终止进程（替换PID）
taskkill /PID <PID> /F
```

然后重新启动服务器。

## 九、命令速查

| 操作 | 命令 |
|------|------|
| 安装依赖 | `install.bat` 或 `pip install playwright && playwright install chromium` |
| 启动服务器 | `start_nuanyang.bat` 或 `python -m crawler.main` |
| 启动并自动开爬 | `python -m crawler.main --auto` |
| 打开控制台 | 浏览器访问 `http://localhost:8899/console.html` |
| 退出 | 在命令行窗口按 `Ctrl+C` |
