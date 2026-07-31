# -*- coding: utf-8 -*-
"""修改 bilibili.py: 添加反自动化检测参数"""

with open('crawler/bilibili.py', 'r', encoding='utf-8') as f:
    content = f.read()

# 1. 在 launch_args 中添加 --disable-blink-features=AutomationControlled
content = content.replace(
    '            "--remote-debugging-port=0",\n        ]',
    '            "--remote-debugging-port=0",\n            "--disable-blink-features=AutomationControlled",\n        ]'
)

# 2. 两处 launch_persistent_context 都加 ignore_default_args
content = content.replace(
    '            args=launch_args,\n        )',
    '            args=launch_args,\n            ignore_default_args=["--enable-automation"],\n        )'
)

with open('crawler/bilibili.py', 'w', encoding='utf-8') as f:
    f.write(content)

print('Anti-automation patches applied')
