# 暖阳 Nuanyang

> 为老年人精选优质短视频的公益应用 — 开源、无广告、无收益

## 项目简介

暖阳从B站精选适合老年人观看的知识性、趣味性短视频，提供适老化的浏览和播放体验。

- **内容来源**：B站百大UP主（历史、科普、美食、纪录片、时事、影视、旅行）
- **视频播放**：B站嵌入播放器，不下载、不存储视频文件
- **目标用户**：60岁以上老年群体
- **项目属性**：开源 · 公益 · 零成本运营

## 技术架构

```
本地电脑 (Playwright爬虫)  →  data/videos.json  →  git push  →  GitHub Pages (H5前端)
                                                                         ↓
                                                                    B站 iframe 播放
```

- **爬虫层**：Python + Playwright 浏览器自动化，本地运行，自动 push 到仓库
- **数据层**：仓库内 JSON 文件，零数据库
- **前端层**：纯 H5 页面，GitHub Pages 托管
- **安卓层**：WebView 壳封装 H5（计划中）

## 目录结构

```
nuanyang/
├── .github/workflows/    # CI/CD 配置
│   └── deploy.yml        # GitHub Pages 自动部署
├── crawler/              # Python 爬虫（Playwright）
│   ├── config.py         # 配置 & UP主加载
│   ├── bilibili.py       # B站 API 封装（Playwright版）
│   ├── filter.py         # 内容筛选规则
│   └── main.py           # 爬虫入口
├── web/                  # H5 前端
│   ├── index.html        # 主页面
│   ├── css/style.css     # 适老化样式（Airbnb Design System）
│   └── js/app.js         # 前端逻辑
├── data/                 # 数据文件
│   ├── upmasters.json    # UP主配置
│   └── videos.json       # 视频数据（爬虫生成）
├── auth/                 # Playwright登录状态（gitignore，不提交）
├── requirements.txt      # Python 依赖
└── .gitignore
```

## 爬虫使用

### 安装依赖

```bash
pip install -r requirements.txt
playwright install chromium
```

### 首次运行（需扫码登录）

```bash
python crawler/main.py
```

首次运行会弹出浏览器窗口，请扫码登录B站。登录状态会保存在 `auth/` 目录，后续运行自动复用，无需重复登录。

### 爬虫工作流程

1. 启动 Playwright 浏览器，加载已保存的登录状态
2. 遍历 `data/upmasters.json` 中每位UP主
3. 调用B站搜索API（浏览器内fetch，自动携带Cookie）搜索UP主名
4. 精确匹配UP主名称，排除高仿号（如"-罗翔说刑法"≠"罗翔说刑法"）
5. 调用B站视频详情API获取封面、时长、播放量等
6. 筛选：时长1-15分钟、排除广告/恐怖等关键词
7. 每位UP主最多保留5条，写入 `data/videos.json`
8. 自动 git commit + push 到GitHub仓库，触发 Pages 部署

### 定时运行（Windows 任务计划程序）

```bash
# 创建定时任务（每6小时运行一次）
schtasks /create /sc HOURLY /mo 6 /tn "暖阳爬虫" /tr "python E:\path\to\nuanyang\crawler\main.py"
```

### 前端预览

```bash
cd web
python -m http.server 8080
# 浏览器打开 http://localhost:8080
```

## 开源协议

MIT License

>如果你想了解我们的开发过程，请查看：【金山文档 | WPS云文档】 暖阳APP开发经验 https://www.kdocs.cn/l/cgU2SPFdD377
