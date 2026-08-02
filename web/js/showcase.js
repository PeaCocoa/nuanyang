/**
 * 暖阳展示页 - 设备模拟试玩
 * 6台华为设备外框 + iframe嵌入暖阳主站
 */

// === 设备数据（屏幕坐标为精确测量值）===
const DEVICES = [
    {
        id: 'mate80',
        name: 'Mate 80',
        img: 'assets/devices/mate80.png',
        imgRatio: '1 / 1',
        orientation: 'portrait',
        screen: { left: 50.3, right: 97.2, top: 1.8, bottom: 97.6, radius: 16 },
        spec: '6.75英寸 OLED · 2832×1280 · 麒麟9020',
        iconType: 'phone'
    },
    {
        id: 'nova16',
        name: 'nova 16',
        img: 'assets/devices/nova16.png',
        imgRatio: '1 / 1.28',
        orientation: 'portrait',
        screen: { left: 48.5, right: 97.6, top: 1.6, bottom: 98.2, radius: 14 },
        spec: '6.68英寸 OLED · 2800×1280 · 麒麟9010S',
        iconType: 'phone'
    },
    {
        id: 'enjoy90',
        name: '畅享 90',
        img: 'assets/devices/enjoy90.png',
        imgRatio: '1 / 1',
        orientation: 'portrait',
        screen: { left: 46.8, right: 96.8, top: 2.4, bottom: 95.8, radius: 14 },
        spec: '6.67英寸 LCD · 1604×720 · 麒麟8000A',
        iconType: 'phone'
    },
    {
        id: 'matext',
        name: 'Mate XT',
        img: 'assets/devices/matext.png',
        imgRatio: '1.57 / 1',
        orientation: 'landscape',
        screen: { left: 1.1, right: 98.0, top: 1.5, bottom: 97.4, radius: 8 },
        spec: '10.2英寸 OLED · 2232×3184 · 三折叠全展开',
        iconType: 'trifold'
    },
    {
        id: 'matepad',
        name: 'MatePad Edge',
        img: 'assets/devices/matebook.png',
        imgRatio: '1 / 1.09',
        orientation: 'landscape',
        screen: { left: 7.4, right: 92.7, top: 1.8, bottom: 57.7, radius: 4 },
        spec: '14.2英寸 OLED · 3120×2080 · 麒麟X90A',
        iconType: 'laptop'
    },
    {
        id: 'matemini',
        name: 'MatePad Mini',
        img: 'assets/devices/matepad.png',
        imgRatio: '1.74 / 1',
        orientation: 'landscape',
        screen: { left: 1.7, right: 83.1, top: 21.5, bottom: 96.7, radius: 8 },
        spec: '8.8英寸 OLED · 2560×1600 · 麒麟9010',
        iconType: 'tablet'
    }
];

// === SVG 图标 ===
const ICONS = {
    phone: '<svg viewBox="0 0 24 36" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="5" y="2" width="14" height="32" rx="3"/><circle cx="12" cy="6" r="0.7" fill="currentColor" stroke="none"/></svg>',
    trifold: '<svg viewBox="0 0 40 26" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="4" width="36" height="18" rx="2"/><line x1="14" y1="4" x2="14" y2="22"/><line x1="26" y1="4" x2="26" y2="22"/></svg>',
    laptop: '<svg viewBox="0 0 36 26" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="6" y="4" width="24" height="14" rx="1"/><path d="M3 21 L33 21" stroke-width="2"/><line x1="14" y1="21" x2="22" y2="21"/></svg>',
    tablet: '<svg viewBox="0 0 34 24" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="4" width="28" height="16" rx="2"/></svg>'
};

// === 状态 ===
let currentDevice = DEVICES[0];
let currentPage = 'home';

// === DOM ===
const deviceSelector = document.getElementById('deviceSelector');
const deviceFrame = document.getElementById('deviceFrame');
const deviceImg = document.getElementById('deviceImg');
const deviceScreen = document.getElementById('deviceScreen');
const deviceIframe = document.getElementById('deviceIframe');
const deviceStage = document.getElementById('deviceStage');
const deviceInfo = document.getElementById('deviceInfo');
const pageTabs = document.getElementById('pageTabs');

// 设置面板 DOM
const settingsBtn = document.getElementById('showcaseSettingsBtn');
const settingsPanel = document.getElementById('showcaseSettingsPanel');
const settingsOverlay = document.getElementById('showcaseSettingsOverlay');
const settingsClose = document.getElementById('showcaseSettingsClose');
const darkToggle = document.getElementById('showcaseDarkToggle');
const fontOptions = document.getElementById('showcaseFontOptions');

// === 初始化 ===
function init() {
    // 同步主题（液态玻璃/经典/白日/黑夜/跟随系统）
    const theme = localStorage.getItem('nuanyang-theme') || 'auto';
    const darkMode = localStorage.getItem('nuanyang-dark') || 'auto';
    const isDark = darkMode === 'on' || (darkMode === 'auto' && window.matchMedia('(prefers-color-scheme: dark)').matches);
    
    // 应用主题和配色方案
    document.body.setAttribute('data-theme', theme);
    document.body.setAttribute('data-color-scheme', isDark ? 'dark' : 'light');
    document.body.classList.toggle('dark', isDark);
    if (darkToggle) darkToggle.checked = isDark;

    // 更新 meta theme-color
    const metaTheme = document.querySelector('meta[name="theme-color"]');
    if (metaTheme) {
        metaTheme.content = theme === 'liquid' ? '#000000' : (isDark ? '#1A1A1A' : '#FFFFFF');
    }

    // 同步字号
    const fontSize = localStorage.getItem('nuanyang-font') || 'font-lg';
    document.body.classList.remove('font-sm', 'font-md', 'font-lg', 'font-xl', 'font-2xl');
    document.body.classList.add(fontSize);

    // 更新字号按钮选中状态
    fontOptions.querySelectorAll('.font-option').forEach(btn => {
        btn.classList.toggle('active', btn.dataset.font === fontSize);
    });

    renderDeviceSelector();
    renderDevice();
    setupPageTabs();
    setupSettings();
}

// === 渲染设备切换栏 ===
function renderDeviceSelector() {
    deviceSelector.innerHTML = DEVICES.map(d => `
        <div class="device-thumb ${d.id === currentDevice.id ? 'active' : ''}" data-device="${d.id}">
            <div class="device-thumb-icon">${ICONS[d.iconType] || ICONS.phone}</div>
            <div class="device-thumb-name">${d.name}</div>
        </div>
    `).join('');

    deviceSelector.querySelectorAll('.device-thumb').forEach(thumb => {
        thumb.addEventListener('click', () => {
            const id = thumb.dataset.device;
            if (id !== currentDevice.id) {
                switchDevice(id);
            }
        });
    });
}

// === 渲染设备展示区 ===
function renderDevice() {
    const d = currentDevice;

    // 淡出
    deviceFrame.classList.add('switching');

    setTimeout(() => {
        // 设置方向
        deviceFrame.className = `device-frame ${d.orientation} switching`;

        // 设置图片
        deviceImg.src = d.img;
        deviceImg.alt = `HUAWEI ${d.name}`;

        // 设置宽高比
        deviceFrame.style.aspectRatio = d.imgRatio;

        // 图片加载后定位屏幕
        deviceImg.onload = () => {
            positionScreen();
            deviceFrame.classList.remove('switching');
        };

        // 如果图片已缓存
        if (deviceImg.complete) {
            positionScreen();
            deviceFrame.classList.remove('switching');
        }

        // 更新设备信息
        deviceInfo.innerHTML = `
            <p class="device-info-name">HUAWEI ${d.name}</p>
            <p class="device-info-spec">${d.spec}</p>
        `;

        // 更新 iframe
        updateIframeSrc();
    }, 200);
}

// === 定位屏幕区域 ===
function positionScreen() {
    const d = currentDevice;
    const s = d.screen;

    deviceScreen.style.left = s.left + '%';
    deviceScreen.style.width = (s.right - s.left) + '%';
    deviceScreen.style.top = s.top + '%';
    deviceScreen.style.height = (s.bottom - s.top) + '%';
    deviceScreen.style.borderRadius = s.radius + 'px';
}

// === 切换设备 ===
function switchDevice(id) {
    currentDevice = DEVICES.find(d => d.id === id);
    if (!currentDevice) return;

    deviceSelector.querySelectorAll('.device-thumb').forEach(thumb => {
        thumb.classList.toggle('active', thumb.dataset.device === id);
    });

    renderDevice();
}

// === 页面切换标签 ===
function setupPageTabs() {
    pageTabs.querySelectorAll('.page-tab').forEach(tab => {
        tab.addEventListener('click', () => {
            const page = tab.dataset.page;
            if (page !== currentPage) {
                switchPage(page);
            }
        });
    });
}

// === 切换页面 ===
function switchPage(page) {
    currentPage = page;
    pageTabs.querySelectorAll('.page-tab').forEach(tab => {
        tab.classList.toggle('active', tab.dataset.page === page);
    });
    updateIframeSrc();
}

// === 更新 iframe URL ===
function updateIframeSrc() {
    let url = 'index.html';
    if (currentPage === 'play') {
        url = 'index.html?demo=play';
    } else if (currentPage === 'search') {
        url = 'index.html?demo=search';
    }
    deviceIframe.src = url;
}

// === 设置面板 ===
function setupSettings() {
    // 打开
    settingsBtn.addEventListener('click', () => {
        settingsPanel.classList.add('active');
        settingsOverlay.classList.add('active');
    });

    // 关闭
    settingsClose.addEventListener('click', closeSettings);
    settingsOverlay.addEventListener('click', closeSettings);

    // 深色模式切换
    darkToggle.addEventListener('change', () => {
        const isDark = darkToggle.checked;
        document.body.classList.toggle('dark', isDark);
        document.body.setAttribute('data-color-scheme', isDark ? 'dark' : 'light');
        localStorage.setItem('nuanyang-dark', isDark ? 'on' : 'off');
        const metaTheme = document.querySelector('meta[name="theme-color"]');
        if (metaTheme) {
            const theme = localStorage.getItem('nuanyang-theme') || 'auto';
            metaTheme.content = theme === 'liquid' ? '#000000' : (isDark ? '#1A1A1A' : '#FFFFFF');
        }
    });

    // 字号切换
    fontOptions.querySelectorAll('.font-option').forEach(btn => {
        btn.addEventListener('click', () => {
            const fontClass = btn.dataset.font;
            document.body.classList.remove('font-sm', 'font-md', 'font-lg', 'font-xl', 'font-2xl');
            document.body.classList.add(fontClass);
            localStorage.setItem('nuanyang-font', fontClass);

            fontOptions.querySelectorAll('.font-option').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');
        });
    });
}

function closeSettings() {
    settingsPanel.classList.remove('active');
    settingsOverlay.classList.remove('active');
}

// === 启动 ===
init();
