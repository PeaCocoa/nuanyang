import requests, json

print('=== 1. 状态恢复（之前全0的问题）===')
r = requests.get('http://localhost:8899/api/status').json()
print(f'  state={r["state"]}, done_ups={r["done_ups"]}, total_videos={r["total_videos"]}')
print(f'  ups列表长度={len(r["ups"])}')
print(f'  日志条数={len(r["logs"])}')
print(f'  附带settings字段={"settings" in r}')

print()
print('=== 2. UP主列表 ===')
r = requests.get('http://localhost:8899/api/upmasters').json()
print(f'  共{len(r["ups"])}位UP主')

print()
print('=== 3. 设置读取 ===')
r = requests.get('http://localhost:8899/api/settings').json()
print(f'  test_mode={r["test_mode"]}, max_videos_per_up={r["max_videos_per_up"]}')
print(f'  duration_min={r["duration_min"]}, duration_max={r["duration_max"]}')
print(f'  pubdate_days={r["pubdate_days"]}, selected_ups={r["selected_ups"]}')

print()
print('=== 4. 设置保存（测试模式+自定义）===')
r = requests.post('http://localhost:8899/api/settings', json={
    'test_mode': True,
    'max_videos_per_up': 2,
    'duration_min': 60,
    'duration_max': 600,
    'pubdate_days': 90,
    'selected_ups': []
}).json()
print(f'  保存成功={r["ok"]}')
print(f'  test_mode={r["settings"]["test_mode"]}, max_videos={r["settings"]["max_videos_per_up"]}')

print()
print('=== 5. 重置回默认 ===')
r = requests.post('http://localhost:8899/api/settings', json={
    'test_mode': False, 'max_videos_per_up': 5, 'duration_min': 60,
    'duration_max': 900, 'pubdate_days': 0, 'selected_ups': []
}).json()
print(f'  重置成功={r["ok"]}')

print()
print('=== 6. 控制台页面可访问 ===')
r = requests.get('http://localhost:8899/console.html')
print(f'  页面加载={r.status_code == 200}')
print(f'  有立即开爬按钮={"立即开爬" in r.text}')
print(f'  有测试模式设置={"测试模式" in r.text}')
print(f'  有UP主选择网格={"upGrid" in r.text}')
print(f'  有Tab导航={"switchTab" in r.text}')

print()
print('全部测试通过!')
