import requests, json, time

# 1. 开启测试模式，时长上限设为3600秒（60分钟）
print("=== 开启测试模式 ===")
r = requests.post('http://localhost:8899/api/settings', json={
    'test_mode': True,
    'max_videos_per_up': 2,
    'duration_min': 60,
    'duration_max': 3600,
    'pubdate_days': 0,
    'selected_ups': []
}).json()
print(f"设置已保存: test_mode={r['settings']['test_mode']}, duration_max={r['settings']['duration_max']}")

# 2. 启动爬虫
print("\n=== 启动爬虫 ===")
r = requests.post('http://localhost:8899/api/start').json()
print(f"启动结果: {r}")

# 3. 每30秒检查一次进度
print("\n=== 等待爬虫运行 ===")
for i in range(20):
    time.sleep(30)
    r = requests.get('http://localhost:8899/api/status').json()
    state = r['state']
    done = r['done_ups']
    total = r['total_ups']
    videos = r['total_videos']
    current = r.get('current_up', '')
    step = r.get('current_step', '')
    login = r.get('login_required', False)

    print(f"[{(i+1)*30}s] state={state}, 进度={done}/{total}, 视频={videos}, 当前={current}({step}), 登录={login}")

    if state in ('done', 'error'):
        print(f"\n爬虫结束: state={state}")
        print(f"总视频数: {videos}")
        print("\n完整日志:")
        for log in r['logs']:
            print(f"  [{log['time']}] {log['level']}: {log['msg']}")
        break

    if state == 'running' and login:
        print("  >>> 需要扫码登录B站！请在弹出的浏览器窗口中扫码 <<<")
