# -*- coding: utf-8 -*-
"""补丁脚本：将表格式工作流替换为Drawflow流程图式"""

filepath = "web/console.html"
with open(filepath, "r", encoding="utf-8") as f:
    content = f.read()

# ============================================================
# 1. 在 </style> 前添加 Drawflow 样式覆盖
# ============================================================
old_style_end = '''        @media (max-width: 768px) {
            .main { flex-direction: column; height: auto; }
            .left-panel { flex: none; border-right: none; border-bottom: 1px solid var(--hairline); }
            .right-panel { flex: none; }
            .log-container { max-height: 400px; }
            .up-grid { grid-template-columns: 1fr; }
        }
    </style>'''

new_style_end = '''        @media (max-width: 768px) {
            .main { flex-direction: column; height: auto; }
            .left-panel { flex: none; border-right: none; border-bottom: 1px solid var(--hairline); }
            .right-panel { flex: none; }
            .log-container { max-height: 400px; }
            .up-grid { grid-template-columns: 1fr; }
        }

        /* === Drawflow 流程图样式 === */
        .wf-toolbar {
            flex: 0 0 200px;
            border-right: 1px solid var(--hairline);
            padding: 16px 12px;
            overflow-y: auto;
        }
        .wf-toolbar-title {
            font-size: 12px;
            font-weight: 600;
            color: var(--mute);
            text-transform: uppercase;
            letter-spacing: 0.5px;
            margin-bottom: 12px;
        }
        .wf-node-template {
            padding: 10px 14px;
            border-radius: 8px;
            margin-bottom: 8px;
            cursor: grab;
            font-size: 13px;
            font-weight: 600;
            text-align: center;
            transition: transform 0.1s, box-shadow 0.15s;
            user-select: none;
        }
        .wf-node-template:hover { transform: translateY(-1px); box-shadow: 0 3px 8px rgba(0,0,0,0.1); }
        .wf-node-template:active { cursor: grabbing; }
        .wf-tpl-start { background: #00A699; color: #fff; }
        .wf-tpl-up { background: #FF385C; color: #fff; }
        .wf-tpl-delay { background: #FC642D; color: #fff; }
        .wf-tpl-filter { background: #6C5CE7; color: #fff; }
        .wf-tpl-push { background: #0984e3; color: #fff; }
        .wf-tpl-end { background: #2d3436; color: #fff; }

        .wf-canvas-wrap {
            flex: 1;
            display: flex;
            flex-direction: column;
            overflow: hidden;
        }
        .wf-toolbar-bar {
            display: flex;
            align-items: center;
            gap: 8px;
            padding: 10px 16px;
            border-bottom: 1px solid var(--hairline);
            background: var(--canvas);
        }
        .wf-name-input {
            font-size: 16px;
            font-weight: 700;
            border: none;
            background: transparent;
            color: var(--ink);
            outline: none;
            border-bottom: 1px solid transparent;
            min-width: 150px;
        }
        .wf-name-input:focus { border-bottom-color: var(--rausch); }
        #drawflow {
            flex: 1;
            background: var(--cloud);
            position: relative;
        }
        body.dark #drawflow {
            background: #1e1e1e;
        }
        /* Drawflow 节点样式覆盖 */
        #drawflow .drawflow-node {
            background: var(--canvas);
            border: 2px solid var(--hairline);
            border-radius: 10px;
            padding: 0;
            min-width: 160px;
        }
        #drawflow .drawflow-node.selected {
            border-color: var(--rausch);
            box-shadow: 0 0 0 3px rgba(255,56,92,0.15);
        }
        #drawflow .drawflow-node .drawflow_content_node {
            padding: 10px 14px;
            font-size: 13px;
            font-weight: 600;
            text-align: center;
        }
        #drawflow .drawflow-node.wf-nd-start { border-color: #00A699; background: #00A699; color: #fff; }
        #drawflow .drawflow-node.wf-nd-up { border-color: #FF385C; }
        #drawflow .drawflow-node.wf-nd-delay { border-color: #FC642D; }
        #drawflow .drawflow-node.wf-nd-filter { border-color: #6C5CE7; }
        #drawflow .drawflow-node.wf-nd-push { border-color: #0984e3; }
        #drawflow .drawflow-node.wf-nd-end { border-color: #2d3436; background: #2d3436; color: #fff; }
        #drawflow .drawflow-node .input::before, #drawflow .drawflow-node .output::before {
            background: var(--ash);
        }
        #drawflow .connection .main-path {
            stroke: var(--ash);
            stroke-width: 2px;
        }
        body.dark #drawflow .drawflow-node { background: #2A2A2A; color: #F7F7F7; }
        body.dark #drawflow .drawflow-node.wf-nd-start { background: #00A699; color: #fff; }
        body.dark #drawflow .drawflow-node.wf-nd-end { background: #2d3436; color: #fff; }

        /* 节点配置面板 */
        .wf-config-panel {
            flex: 0 0 280px;
            border-left: 1px solid var(--hairline);
            padding: 16px;
            overflow-y: auto;
            display: none;
        }
        .wf-config-panel.show { display: block; }
        .wf-config-title {
            font-size: 14px;
            font-weight: 700;
            margin-bottom: 12px;
            color: var(--ink);
        }
        .wf-config-field { margin-bottom: 12px; }
        .wf-config-label { font-size: 12px; color: var(--mute); margin-bottom: 4px; }
        .wf-config-input {
            width: 100%;
            padding: 6px 10px;
            border: 1px solid var(--hairline);
            border-radius: 6px;
            background: var(--canvas);
            color: var(--ink);
            font-size: 13px;
        }
        .wf-flow-list {
            flex: 0 0 240px;
            border-right: 1px solid var(--hairline);
            padding: 16px 12px;
            overflow-y: auto;
        }
    </style>'''

content = content.replace(old_style_end, new_style_end)

# ============================================================
# 2. 替换工作流面板 HTML
# ============================================================
old_wf_html_start = '    <!-- 工作流面板 -->\n    <div class="main" id="tab-workflow" style="display:none;flex-direction:row;">'
# 找到工作流面板的结束位置（toast div前面）
old_wf_html_end = '    <div class="toast" id="toast"></div>'

# 找到旧的工作流面板完整内容
wf_start_idx = content.index(old_wf_html_start)
wf_end_idx = content.index(old_wf_html_end)
old_wf_full = content[wf_start_idx:wf_end_idx]

new_wf_html = '''    <!-- 工作流面板 -->
    <div class="main" id="tab-workflow" style="display:none;flex-direction:row;">
        <!-- 左侧：工作流列表 -->
        <div class="wf-flow-list">
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px;">
                <div class="section-title" style="margin:0;">工作流</div>
                <button class="btn btn-primary" style="padding:4px 12px;font-size:13px;" onclick="newFlowWorkflow()">+ 新建</button>
            </div>
            <div id="flowWorkflowList" style="display:flex;flex-direction:column;gap:6px;">
                <div style="color:var(--mute);font-size:13px;padding:8px 0;">加载中...</div>
            </div>
        </div>

        <!-- 中间：节点工具栏 + 画布 -->
        <div class="wf-canvas-wrap">
            <div class="wf-toolbar-bar">
                <input type="text" id="flowName" class="wf-name-input" placeholder="工作流名称" value="未命名">
                <div style="flex:1;"></div>
                <button class="btn btn-green" onclick="saveFlowWorkflow()">保存</button>
                <button class="btn btn-primary" id="flowRunBtn" onclick="runFlowWorkflow()">运行</button>
                <button class="btn btn-outline" onclick="deleteFlowWorkflow()" style="color:#e74c3c;border-color:#e74c3c;">删除</button>
            </div>
            <div style="display:flex;flex:1;overflow:hidden;">
                <!-- 节点工具栏 -->
                <div class="wf-toolbar">
                    <div class="wf-toolbar-title">拖拽节点</div>
                    <div class="wf-node-template wf-tpl-start" draggable="true" ondragstart="dragNode(event,'start')">▶ 开始</div>
                    <div class="wf-node-template wf-tpl-up" draggable="true" ondragstart="dragNode(event,'up')">UP主</div>
                    <div class="wf-node-template wf-tpl-delay" draggable="true" ondragstart="dragNode(event,'delay')">⏱ 延迟</div>
                    <div class="wf-node-template wf-tpl-filter" draggable="true" ondragstart="dragNode(event,'filter')">▼ 筛选</div>
                    <div class="wf-node-template wf-tpl-push" draggable="true" ondragstart="dragNode(event,'push')">↗ 推送</div>
                    <div class="wf-node-template wf-tpl-end" draggable="true" ondragstart="dragNode(event,'end')">■ 结束</div>
                    <div style="margin-top:16px;font-size:11px;color:var(--mute);line-height:1.6;">
                        拖拽节点到画布<br>
                        拖拽连接点连线<br>
                        点击节点配置参数<br>
                        双击节点删除
                    </div>
                </div>
                <!-- Drawflow 画布 -->
                <div id="drawflow"></div>
            </div>
        </div>

        <!-- 右侧：节点配置面板 -->
        <div class="wf-config-panel" id="wfConfigPanel">
            <div class="wf-config-title" id="wfConfigTitle">节点配置</div>
            <div id="wfConfigFields"></div>
            <button class="btn btn-outline" style="width:100%;margin-top:12px;color:#e74c3c;border-color:#e74c3c;" onclick="deleteSelectedNode()">删除此节点</button>
        </div>
    </div>

'''

content = content.replace(old_wf_full, new_wf_html)

# ============================================================
# 3. 在 <head> 中添加 Drawflow CDN
# ============================================================
old_head_end = '</head>'
new_head_end = '''    <script src="https://cdn.jsdelivr.net/npm/drawflow@0.0.60/dist/drawflow.min.js"></script>
    <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/drawflow@0.0.60/dist/drawflow.min.css">
</head>'''
content = content.replace(old_head_end, new_head_end, 1)

# ============================================================
# 4. 替换工作流 JS 逻辑
# ============================================================
# 找到旧的工作流JS（从 "let workflows = []" 到 "// === 初始化 ==="）
old_js_start = "        // === 工作流管理 ===\n        let workflows = [];"
old_js_end = "        // === 初始化 ==="

js_start_idx = content.index(old_js_start)
js_end_idx = content.index(old_js_end)
old_js_full = content[js_start_idx:js_end_idx]

new_js = '''        // === 流程图工作流 ===
        let flowEditor = null;
        let flowWorkflows = [];
        let currentFlowWF = null;
        let selectedNodeId = null;

        // 初始化 Drawflow
        function initDrawflow() {
            if (flowEditor) return;
            const container = document.getElementById('drawflow');
            flowEditor = new Drawflow(container);
            flowEditor.reroute = true;
            flowEditor.reroute_fix_curvature = true;
            flowEditor.force_first_input = false;

            flowEditor.on('nodeSelected', function(id) {
                selectedNodeId = id;
                showNodeConfig(id);
            });
            flowEditor.on('nodeUnselected', function() {
                selectedNodeId = null;
                document.getElementById('wfConfigPanel').classList.remove('show');
            });
            flowEditor.on('nodeRemoved', function() {
                selectedNodeId = null;
                document.getElementById('wfConfigPanel').classList.remove('show');
            });
            flowEditor.on('connectionCreated', function(info) {
                // 限制：每个输出只能连一条线
                const outputs = flowEditor.drawflow.drawflow.Home.data[info.output_id].outputs[info.output_key];
                if (outputs && outputs.connections.length > 1) {
                    // 移除之前的连接
                    flowEditor.removeSingleConnection(info.output_id, info.output_key, outputs.connections[0].node, outputs.connections[0].output);
                }
            });

            flowEditor.start();
        }

        // 拖拽节点
        function dragNode(e, type) {
            e.dataTransfer.setData('node-type', type);
        }

        // 画布拖放
        function setupCanvasDrop() {
            const canvas = document.getElementById('drawflow');
            canvas.addEventListener('drop', function(e) {
                e.preventDefault();
                const type = e.dataTransfer.getData('node-type');
                if (!type) return;
                const rect = canvas.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                addFlowNode(type, x / canvas.offsetWidth * 100, y / canvas.offsetHeight * 100);
            });
            canvas.addEventListener('dragover', function(e) { e.preventDefault(); });
            canvas.addEventListener('dblclick', function(e) {
                // 双击空白取消选中
                if (e.target.id === 'drawflow' || e.target.classList.contains('drawflow')) {
                    selectedNodeId = null;
                    document.getElementById('wfConfigPanel').classList.remove('show');
                    flowEditor.node_selected = null;
                    flowEditor.dispatch('nodeUnselected', true);
                }
            });
        }

        // 添加节点
        function addFlowNode(type, x, y) {
            const nodeConfigs = {
                start: { name: '开始', class: 'wf-nd-start', inputs: 0, outputs: 1, data: {} },
                up: { name: 'UP主', class: 'wf-nd-up', inputs: 1, outputs: 1,
                      data: { uid: '', uname: '', categories: '', repeat: '1' } },
                delay: { name: '延迟', class: 'wf-nd-delay', inputs: 1, outputs: 1,
                         data: { seconds: '30' } },
                filter: { name: '筛选', class: 'wf-nd-filter', inputs: 1, outputs: 1,
                          data: { duration_min: '60', duration_max: '3600', pubdate_days: '0' } },
                push: { name: '推送GitHub', class: 'wf-nd-push', inputs: 1, outputs: 1, data: {} },
                end: { name: '结束', class: 'wf-nd-end', inputs: 1, outputs: 0, data: {} },
            };
            const cfg = nodeConfigs[type];
            if (!cfg) return;

            const html = `<div>${cfg.name}</div>`;
            flowEditor.addNode(type, cfg.inputs, cfg.outputs, x, y, type, cfg.data, html);
            // 设置节点样式class
            const nodeId = flowEditor.nodeId;
            const nodeEl = document.querySelector(`#node-${nodeId}`);
            if (nodeEl) nodeEl.classList.add(cfg.class);

            // 更新节点显示内容
            updateNodeDisplay(nodeId, type, cfg.data);
        }

        // 更新节点显示
        function updateNodeDisplay(id, type, data) {
            const displays = {
                start: () => '▶ 开始',
                end: () => '■ 结束',
                push: () => '↗ 推送GitHub',
                up: () => `UP主<br><span style="font-size:11px;font-weight:400;opacity:0.8;">${data.uname || '未设置'} (${data.uid || '?'})</span>`,
                delay: () => `⏱ 延迟<br><span style="font-size:11px;font-weight:400;opacity:0.8;">${data.seconds || '30'}秒</span>`,
                filter: () => `▼ 筛选<br><span style="font-size:11px;font-weight:400;opacity:0.8;">${data.duration_min || 60}-${data.duration_max || 3600}秒</span>`,
            };
            const fn = displays[type];
            if (fn) {
                const nodeEl = document.querySelector(`#node-${id} .drawflow_content_node`);
                if (nodeEl) nodeEl.innerHTML = fn();
            }
        }

        // 显示节点配置
        function showNodeConfig(id) {
            const node = flowEditor.getNodeFromId(id);
            if (!node) return;
            const type = node.name;
            const data = node.data;
            const panel = document.getElementById('wfConfigPanel');
            const title = document.getElementById('wfConfigTitle');
            const fields = document.getElementById('wfConfigFields');

            const titles = { start:'开始节点', up:'UP主节点', delay:'延迟节点', filter:'筛选节点', push:'推送节点', end:'结束节点' };
            title.textContent = titles[type] || type;

            let html = '';
            if (type === 'up') {
                html += `<div class="wf-config-field"><div class="wf-config-label">UP主名称</div><input class="wf-config-input" value="${data.uname||''}" oninput="updateNodeData(${id},'uname',this.value)"></div>`;
                html += `<div class="wf-config-field"><div class="wf-config-label">UID</div><input class="wf-config-input" type="number" value="${data.uid||''}" oninput="updateNodeData(${id},'uid',this.value)"></div>`;
                html += `<div class="wf-config-field"><div class="wf-config-label">分类 (逗号分隔)</div><input class="wf-config-input" value="${data.categories||''}" oninput="updateNodeData(${id},'categories',this.value)" placeholder="科普探索,教育学习"></div>`;
                html += `<div class="wf-config-field"><div class="wf-config-label">重复次数</div><input class="wf-config-input" type="number" min="1" max="5" value="${data.repeat||'1'}" oninput="updateNodeData(${id},'repeat',this.value)"></div>`;
            } else if (type === 'delay') {
                html += `<div class="wf-config-field"><div class="wf-config-label">等待秒数</div><input class="wf-config-input" type="number" value="${data.seconds||'30'}" oninput="updateNodeData(${id},'seconds',this.value)"></div>`;
            } else if (type === 'filter') {
                html += `<div class="wf-config-field"><div class="wf-config-label">最短时长(秒)</div><input class="wf-config-input" type="number" value="${data.duration_min||'60'}" oninput="updateNodeData(${id},'duration_min',this.value)"></div>`;
                html += `<div class="wf-config-field"><div class="wf-config-label">最长时长(秒)</div><input class="wf-config-input" type="number" value="${data.duration_max||'3600'}" oninput="updateNodeData(${id},'duration_max',this.value)"></div>`;
                html += `<div class="wf-config-field"><div class="wf-config-label">投稿时间限制(天,0=不限)</div><input class="wf-config-input" type="number" value="${data.pubdate_days||'0'}" oninput="updateNodeData(${id},'pubdate_days',this.value)"></div>`;
            } else {
                html = `<div style="font-size:13px;color:var(--mute);padding:12px 0;">此节点无可配置参数</div>`;
            }
            fields.innerHTML = html;
            panel.classList.add('show');
        }

        function updateNodeData(id, key, value) {
            flowEditor.updateNodeDataFromId(id, {[key]: value});
            const node = flowEditor.getNodeFromId(id);
            if (node) updateNodeDisplay(id, node.name, node.data);
        }

        function deleteSelectedNode() {
            if (selectedNodeId) {
                flowEditor.removeNodeId(`node-${selectedNodeId}`);
            }
        }

        // 工作流列表
        async function loadFlowWorkflows() {
            try {
                const resp = await fetch('/api/workflows');
                const data = await resp.json();
                flowWorkflows = data.workflows || [];
                renderFlowList();
            } catch(e) {}
        }

        function renderFlowList() {
            const list = document.getElementById('flowWorkflowList');
            if (flowWorkflows.length === 0) {
                list.innerHTML = '<div style="color:var(--mute);font-size:13px;padding:8px 0;">暂无工作流</div>';
                return;
            }
            list.innerHTML = flowWorkflows.map(wf => `
                <div class="up-item" style="cursor:pointer;${currentFlowWF && currentFlowWF.id === wf.id ? 'background:var(--cloud);' : ''}" onclick="selectFlowWorkflow('${wf.id}')">
                    <span class="up-status-dot dot-done"></span>
                    <div style="flex:1;min-width:0;">
                        <div class="up-name">${escapeHtml(wf.name||'未命名')}</div>
                        <div class="up-category">${(wf.nodes||[]).filter(n=>n.type==='up').length} 个UP主节点</div>
                    </div>
                </div>
            `).join('');
        }

        function selectFlowWorkflow(id) {
            currentFlowWF = flowWorkflows.find(w => w.id === id);
            if (!currentFlowWF) return;
            document.getElementById('flowName').value = currentFlowWF.name || '';
            // 清空画布并加载节点
            flowEditor.clear();
            if (currentFlowWF.drawflow) {
                flowEditor.import(currentFlowWF.drawflow);
                // 恢复节点样式
                const nodes = flowEditor.drawflow.drawflow.Home.data;
                const classMap = {start:'wf-nd-start',up:'wf-nd-up',delay:'wf-nd-delay',filter:'wf-nd-filter',push:'wf-nd-push',end:'wf-nd-end'};
                for (const id in nodes) {
                    const node = nodes[id];
                    const el = document.querySelector(`#node-${id}`);
                    if (el) el.classList.add(classMap[node.name] || '');
                    updateNodeDisplay(parseInt(id), node.name, node.data);
                }
            }
            renderFlowList();
        }

        function newFlowWorkflow() {
            currentFlowWF = { id: '', name: '新工作流', nodes: [] };
            document.getElementById('flowName').value = '新工作流';
            if (!flowEditor) initDrawflow();
            flowEditor.clear();
            // 添加默认的 开始 → 结束
            addFlowNode('start', 10, 40);
            addFlowNode('end', 70, 40);
            renderFlowList();
        }

        // 导出流程图为可执行格式
        function exportFlowData() {
            const drawflowData = flowEditor.export();
            const nodes = drawflowData.drawflow.Home.data;
            // 按连接关系排序节点
            const ordered = [];
            const visited = new Set();
            function trace(id) {
                if (visited.has(id)) return;
                visited.add(id);
                const node = nodes[id];
                if (!node) return;
                ordered.push({
                    id: parseInt(id),
                    type: node.name,
                    data: node.data || {},
                    outputs: node.outputs || {}
                });
                // 跟踪输出连接
                for (const key in node.outputs) {
                    for (const conn of (node.outputs[key].connections || [])) {
                        trace(conn.node);
                    }
                }
            }
            // 找到start节点开始
            for (const id in nodes) {
                if (nodes[id].name === 'start') {
                    trace(id);
                    break;
                }
            }
            // 加入未访问的节点
            for (const id in nodes) {
                if (!visited.has(id)) trace(id);
            }
            return { nodes: ordered, drawflow: drawflowData };
        }

        async function saveFlowWorkflow() {
            if (!currentFlowWF) { showToast('请先新建或选择工作流'); return; }
            currentFlowWF.name = document.getElementById('flowName').value || '未命名';
            const flowData = exportFlowData();
            currentFlowWF.nodes = flowData.nodes;
            currentFlowWF.drawflow = flowData.drawflow;
            currentFlowWF.config = { total_limit: 800, stop_after_done: true };

            try {
                const resp = await fetch('/api/workflows/save', {
                    method: 'POST',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify(currentFlowWF)
                });
                const data = await resp.json();
                if (data.ok) {
                    currentFlowWF = data.workflow;
                    showToast('工作流已保存');
                    loadFlowWorkflows();
                } else { showToast(data.msg||'保存失败'); }
            } catch(e) { showToast('无法连接服务器'); }
        }

        async function runFlowWorkflow() {
            if (!currentFlowWF || !currentFlowWF.id) {
                await saveFlowWorkflow();
                if (!currentFlowWF || !currentFlowWF.id) return;
            }
            try {
                const resp = await fetch('/api/workflows/run', {
                    method: 'POST',
                    headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({id: currentFlowWF.id})
                });
                const data = await resp.json();
                if (data.ok) {
                    showToast('工作流已启动');
                    switchTab('monitor');
                } else { showToast(data.msg||'启动失败'); }
            } catch(e) { showToast('无法连接服务器'); }
        }

        async function deleteFlowWorkflow() {
            if (!currentFlowWF || !currentFlowWF.id) { showToast('请先选择工作流'); return; }
            if (!confirm(`确认删除 "${currentFlowWF.name}"？`)) return;
            try {
                const resp = await fetch('/api/workflows/delete', {
                    method: 'POST', headers: {'Content-Type':'application/json'},
                    body: JSON.stringify({id: currentFlowWF.id})
                });
                const data = await resp.json();
                if (data.ok) {
                    showToast('已删除');
                    currentFlowWF = null;
                    if (flowEditor) flowEditor.clear();
                    loadFlowWorkflows();
                }
            } catch(e) {}
        }

'''

content = content.replace(old_js_full, new_js)

# ============================================================
# 5. 修改 switchTab 中工作流初始化
# ============================================================
content = content.replace(
    "if (tab === 'workflow') loadWorkflows();",
    "if (tab === 'workflow') { if (!flowEditor) { initDrawflow(); setupCanvasDrop(); } loadFlowWorkflows(); }"
)

# ============================================================
# 6. 修改 init 函数，加载工作流列表
# ============================================================
content = content.replace(
    "loadUpmasters().catch(function(){});",
    "loadUpmasters().catch(function(){});\n            loadFlowWorkflows().catch(function(){});"
)

with open(filepath, "w", encoding="utf-8") as f:
    f.write(content)

print("console.html patched with Drawflow workflow!")
print(f"File size: {len(content)} chars")
