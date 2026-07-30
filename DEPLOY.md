# 暖阳项目 GitHub 部署配置

## 架构说明

```
本地爬虫 → nuanyang 代码仓库 → GitHub Actions → peacocoa.github.io 部署仓库 → GitHub Pages 网站
```

- **nuanyang 仓库**：存放源代码和爬虫数据
- **peacocoa.github.io 仓库**：只放网站静态文件，通过 GitHub Pages 提供访问
- 爬虫推数据到 nuanyang 后，Actions 自动同步 web/ 到部署仓库

## 配置步骤

### 1. 生成 GitHub Token

1. 打开 https://github.com/settings/tokens/new
2. Note 填 `nuanyang`
3. Expiration 选 `No expiration`（或 90 天）
4. 勾选权限：
   - `repo`（全部）
   - `workflow`
5. 点 `Generate token`
6. 复制 token（ghp_开头）

### 2. 配置本地环境变量（给爬虫推送用）

在命令行中设置环境变量：

**Windows CMD（永久生效）：**
```cmd
setx GITHUB_TOKEN "ghp_你的token"
```

设置后需要**重新打开命令行窗口**才能生效。

**或临时使用（当前窗口有效）：**
```cmd
set GITHUB_TOKEN=ghp_你的token
```

### 3. 配置 GitHub Secret（给 Actions 推送部署仓库用）

1. 打开 https://github.com/PeaCocoa/nuanyang/settings/secrets/actions
2. 点 `New repository secret`
3. Name 填 `DEPLOY_TOKEN`
4. Value 粘贴你的 token
5. 点 `Add secret`

### 4. 配置部署仓库的 GitHub Pages

1. 打开 https://github.com/PeaCocoa/peacocoa.github.io/settings/pages
2. Source 选 `Deploy from a branch`
3. Branch 选 `main`，目录选 `/ (root)`
4. 点 `Save`

### 5. 移除 remote 中的 token（改用环境变量）

```cmd
cd E:\claw\20260730-15-11-53-783\nuanyang
git remote set-url origin https://github.com/PeaCocoa/nuanyang.git
```

## 验证

配置完成后，按以下顺序验证：

1. 启动爬虫服务器：`python -m crawler.main`
2. 在控制台点"立即开爬"
3. 爬虫完成后会自动推送到 nuanyang 仓库
4. GitHub Actions 自动触发，同步到 peacocoa.github.io
5. 访问 https://peacocoa.github.io 看到网站

## Token 续期

- Token 到期后推送会报 403 错误
- 重新生成 token，然后更新环境变量和 GitHub Secret
- 建议：选 `No expiration` 避免频繁续期
