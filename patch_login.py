# -*- coding: utf-8 -*-
"""修改 bilibili.py 的 _login 方法，改用轮询 nav API 检测登录"""

with open('crawler/bilibili.py', 'r', encoding='utf-8') as f:
    content = f.read()

old_login = '''    def _login(self):
        """打开B站登录页面，等待用户扫码登录"""
        self.page.goto("https://passport.bilibili.com/login", wait_until="networkidle")
        print("=" * 50)
        print("请在弹出的浏览器窗口中扫码登录B站")
        print("登录成功后程序会自动继续...")
        print("=" * 50)

        # 等待登录成功：URL跳转 或 页面出现用户头像
        logged = False
        try:
            self.page.wait_for_url("**/www.bilibili.com**", timeout=120000)
            logged = True
        except Exception:
            try:
                self.page.wait_for_selector(".header-login-entry", state="detached", timeout=120000)
                logged = True
            except Exception:
                print("[WARN] 等待登录超时，继续尝试...")

        if logged:
            print("[INFO] 登录成功！")
            # 导航到桌面版B站首页，确保Cookie正确写入
            self.page.goto("https://www.bilibili.com", wait_until="domcontentloaded")
            time.sleep(3)
            # 验证登录状态
            if self.is_logged_in():
                print("[INFO] 登录状态验证通过")
            else:
                print("[WARN] 登录状态验证未通过，但继续尝试...")
        else:
            time.sleep(3)'''

new_login = '''    def _login(self):
        """打开B站登录页面，等待用户扫码登录"""
        self.page.goto("https://passport.bilibili.com/login", wait_until="networkidle")
        print("=" * 50)
        print("请在弹出的浏览器窗口中扫码登录B站")
        print("登录成功后程序会自动继续...")
        print("=" * 50)

        # 轮询 nav API 确认真正登录成功（不依赖URL跳转，避免误判）
        max_wait = 180  # 最多等3分钟
        logged = False
        for i in range(max_wait):
            time.sleep(1)
            if i > 0 and i % 10 == 0:
                print(f"[INFO] 等待扫码登录... ({i}s)")
            if self.is_logged_in():
                logged = True
                break

        if logged:
            print("[INFO] 登录成功！Cookie已保存")
            # 导航到B站首页，确保Cookie正确写入
            self.page.goto("https://www.bilibili.com", wait_until="domcontentloaded")
            time.sleep(2)
        else:
            print("[WARN] 等待登录超时（3分钟），继续尝试...")
            time.sleep(2)'''

if old_login in content:
    content = content.replace(old_login, new_login, 1)
    with open('crawler/bilibili.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('Login method patched successfully')
else:
    print('ERROR: old _login method not found')
    # Debug: find the _login line
    for i, line in enumerate(content.split('\n')):
        if '_login' in line and 'def' in line:
            print(f'Found at line {i+1}: {line.rstrip()}')
