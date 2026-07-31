# -*- coding: utf-8 -*-
"""补丁：在工作流UP主节点配置中添加已有UP主快速选择"""

filepath = "web/console.html"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# 替换UP主节点配置部分
old = """            if (type === 'up') {
                html += `<div class="wf-config-field"><div class="wf-config-label">UP主名称</div><input class="wf-config-input" value="${data.uname||''}" oninput="updateNodeData(${id},'uname',this.value)"></div>`;
                html += `<div class="wf-config-field"><div class="wf-config-label">UID</div><input class="wf-config-input" type="number" value="${data.uid||''}" oninput="updateNodeData(${id},'uid',this.value)"></div>`;
                html += `<div class="wf-config-field"><div class="wf-config-label">分类 (逗号分隔)</div><input class="wf-config-input" value="${data.categories||''}" oninput="updateNodeData(${id},'categories',this.value)" placeholder="科普探索,教育学习"></div>`;
                html += `<div class="wf-config-field"><div class="wf-config-label">重复次数</div><input class="wf-config-input" type="number" min="1" max="5" value="${data.repeat||'1'}" oninput="updateNodeData(${id},'repeat',this.value)"></div>`;"""

new = """            if (type === 'up') {
                let upOptions = '<option value="">— 从列表选择 —</option>';
                if (typeof allUpmasters !== 'undefined' && allUpmasters.length > 0) {
                    upOptions += allUpmasters.map(up => {
                        const uid = String(up.uid || '');
                        const name = up.name || '';
                        const cats = Array.isArray(up.categories) ? up.categories.join(',') : (up.categories || '');
                        const sel = (String(data.uid||'') === uid) ? 'selected' : '';
                        return `<option value="${uid}" data-name="${name}" data-cats="${cats}" ${sel}>${name} (${uid})</option>`;
                    }).join('');
                }
                html += `<div class="wf-config-field"><div class="wf-config-label">从已有UP主选择</div><select class="wf-config-input" onchange="pickUpFromList(${id},this)">${upOptions}</select></div>`;
                html += `<div class="wf-config-field"><div class="wf-config-label">或手动输入名称</div><input class="wf-config-input" value="${data.uname||''}" oninput="updateNodeData(${id},'uname',this.value)"></div>`;
                html += `<div class="wf-config-field"><div class="wf-config-label">UID</div><input class="wf-config-input" type="number" value="${data.uid||''}" oninput="updateNodeData(${id},'uid',this.value)"></div>`;
                html += `<div class="wf-config-field"><div class="wf-config-label">分类 (逗号分隔)</div><input class="wf-config-input" value="${data.categories||''}" oninput="updateNodeData(${id},'categories',this.value)" placeholder="科普探索,教育学习"></div>`;
                html += `<div class="wf-config-field"><div class="wf-config-label">重复次数</div><input class="wf-config-input" type="number" min="1" max="5" value="${data.repeat||'1'}" oninput="updateNodeData(${id},'repeat',this.value)"></div>`;"""

if old in content:
    content = content.replace(old, new)
    print("替换成功")
else:
    print("未找到目标文本!")
    # 诊断
    for i, line in enumerate(old.split('\n')):
        if line.strip() and line.strip() not in content:
            print(f"  行{i}: NOT FOUND: {line.strip()[:60]}")
    import sys; sys.exit(1)

# 在 updateNodeData 函数后面添加 pickUpFromList 函数
old_fn = """        function deleteSelectedNode() {"""
new_fn = """        function pickUpFromList(id, select) {
            const opt = select.selectedOptions[0];
            if (!opt || !opt.value) return;
            const uid = opt.value;
            const name = opt.dataset.name || '';
            const cats = opt.dataset.cats || '';
            flowEditor.updateNodeDataFromId(id, {uid: uid, uname: name, categories: cats});
            const node = flowEditor.getNodeFromId(id);
            if (node) updateNodeDisplay(id, node.name, node.data);
            // 刷新配置面板
            showNodeConfig(id);
        }

        function deleteSelectedNode() {"""

content = content.replace(old_fn, new_fn)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print(f"Done! File size: {len(content)} chars")
