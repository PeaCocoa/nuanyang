"""
暖阳定时爬虫 — 每天10:00和20:00自动运行
使用 Windows 任务计划程序注册定时任务

使用方法：
  python -m crawler.schedule_crawler install   # 注册定时任务
  python -m crawler.schedule_crawler uninstall  # 卸载定时任务
  python -m crawler.schedule_crawler status     # 查看任务状态
"""

import subprocess
import sys
import os

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PROJECT_DIR = BASE_DIR
PYTHON_EXE = sys.executable

# 定时任务配置
TASK_NAME = "NuanyangCrawler"
# 爬虫任务时间
TASK_TIMES = ["10:00", "20:00"]
# 更新任务时间
UPDATE_TASK_TIMES = ["16:00"]
# 更新脚本
UPDATE_SCRIPT = os.path.join(PROJECT_DIR, "auto_update.bat")

# 启动脚本路径
START_SCRIPT = os.path.join(PROJECT_DIR, "auto_crawl.bat")

def install():
    """注册 Windows 定时任务"""
    # 先删除旧任务（如果存在）
    subprocess.run(
        ["schtasks", "/Delete", "/TN", TASK_NAME, "/F"],
        capture_output=True
    )

    # 创建任务，每天10:00和20:00执行
    for time_str in TASK_TIMES + UPDATE_TASK_TIMES:
        task_name = f"{TASK_NAME}_{"Update_" if time_str in UPDATE_TASK_TIMES else ""}{time_str.replace(':', '')}"
        subprocess.run(
            ["schtasks", "/Delete", "/TN", task_name, "/F"],
            capture_output=True
        )

        cmd = [
            "schtasks", "/Create",
            "/TN", task_name,
            "/TR", f'"{START_SCRIPT}"',
            "/SC", "DAILY",
            "/ST", time_str,
            "/F"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"[OK] 定时任务已注册: {task_name} -> 每天 {time_str}")
        else:
            print(f"[ERROR] 注册失败 {task_name}: {result.stderr}")

    # 注册16点更新任务
    for time_str in UPDATE_TASK_TIMES:
        task_name = f"{TASK_NAME}_Update_{time_str.replace(':', '')}"
        subprocess.run(
            ["schtasks", "/Delete", "/TN", task_name, "/F"],
            capture_output=True
        )
        cmd = [
            "schtasks", "/Create",
            "/TN", task_name,
            "/TR", f'"{UPDATE_SCRIPT}"',
            "/SC", "DAILY",
            "/ST", time_str,
            "/F"
        ]
        result = subprocess.run(cmd, capture_output=True, text=True)
        if result.returncode == 0:
            print(f"[OK] 更新任务已注册: {task_name} -> 每天 {time_str}")
        else:
            print(f"[ERROR] 注册失败 {task_name}: {result.stderr}")

    print(f"\n定时任务已安装:")
    print(f"  爬虫: 每天 {', '.join(TASK_TIMES)}")
    print(f"  更新: 每天 {', '.join(UPDATE_TASK_TIMES)}")
    print(f"启动脚本: {START_SCRIPT}")
    print(f"Python: {PYTHON_EXE}")

def uninstall():
    """卸载 Windows 定时任务"""
    for time_str in TASK_TIMES + UPDATE_TASK_TIMES:
        prefix = "Update_" if time_str in UPDATE_TASK_TIMES else ""
        task_name = f"{TASK_NAME}_{prefix}{time_str.replace(':', '')}"
        result = subprocess.run(
            ["schtasks", "/Delete", "/TN", task_name, "/F"],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print(f"[OK] 已删除定时任务: {task_name}")
        else:
            print(f"[SKIP] 任务不存在或删除失败: {task_name}")

def status():
    """查看定时任务状态"""
    for time_str in TASK_TIMES + UPDATE_TASK_TIMES:
        task_name = f"{TASK_NAME}_{"Update_" if time_str in UPDATE_TASK_TIMES else ""}{time_str.replace(':', '')}"
        result = subprocess.run(
            ["schtasks", "/Query", "/TN", task_name],
            capture_output=True, text=True
        )
        if result.returncode == 0:
            print(f"[ACTIVE] {task_name}")
            # 提取关键信息
            for line in result.stdout.split('\n'):
                if task_name in line or '准备就绪' in line or 'Ready' in line or '运行' in line:
                    print(f"  {line.strip()}")
        else:
            print(f"[MISSING] {task_name} - 未注册")

if __name__ == "__main__":
    action = sys.argv[1] if len(sys.argv) > 1 else "status"
    if action == "install":
        install()
    elif action == "uninstall":
        uninstall()
    elif action == "status":
        status()
    else:
        print(f"用法: python -m crawler.schedule_crawler [install|uninstall|status]")
