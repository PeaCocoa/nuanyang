# -*- coding: utf-8 -*-
"""修改 bilibili.py 的 _login 和 is_logged_in 方法"""

with open('crawler/bilibili.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 替换 _login 方法
old_login = '''    def _login(self):
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

new_login = '''    def _login(self):
        """打开B站登录页面，等待用户扫码登录"""
        self.page.goto("https://passport.bilibili.com/login", wait_until="networkidle")
        print("=" * 50)
        print("请在弹出的浏览器窗口中扫码登录B站")
        print("登录成功后程序会自动继续...")
        print("=" * 50)

        # 轮询检测 Cookie 中是否出现 SESSDATA（登录成功标志）
        max_wait = 180  # 最多等3分钟
        logged = False
        for i in range(max_wait):
            time.sleep(1)
            if i > 0 and i % 10 == 0:
                print(f"[INFO] 等待扫码登录... ({i}s)")
            # 检查 Cookie 是否已包含 SESSDATA
            cookies = self.context.cookies("https://www.bilibili.com")
            for c in cookies:
                if c["name"] == "SESSDATA" and len(c["value"]) > 10:
                    logged = True
                    break
            if logged:
                break

        if logged:
            print("[INFO] 登录成功！Cookie已保存")
            # 导航到B站首页，确保Cookie正确写入
            self.page.goto("https://www.bilibili.com", wait_until="domcontentloaded")
            time.sleep(2)
            # 在B站首页上下文验证登录状态（同域，Cookie会正确携带）
            if self.is_logged_in():
                print("[INFO] 登录状态验证通过")
            else:
                print("[WARN] Cookie检测通过，nav验证未通过，继续尝试...")
        else:
            print("[WARN] 等待登录超时（3分钟），继续尝试...")
            time.sleep(2)'''

if old_login in content:
    content = content.replace(old_login, new_login, 1)
    with open('crawler/bilibili.py', 'w', encoding='utf-8') as f:
        f.write(content)
    print('_login patched successfully')
else:
    print('ERROR: old _login not found')
