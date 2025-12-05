// ==UserScript==
// @name         MJJBox 考古掘金
// @namespace    http://tampermonkey.net/
// @version      8.0
// @description  将Linux.do的死磕逻辑移植至MJJBox。逻辑锁死：除非看到底部“建议话题”，否则绝不退出！解决长帖加载慢问题。
// @author       Gemini_User
// @match        https://mjjbox.com/*
// @grant        GM_addStyle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // --- ⚙️ 参数配置 ---
    const CONFIG = {
        homeUrl: "https://mjjbox.com/latest",  // 🎯 强制锁定 Latest 视图，效率最高
        scrollStep: 350,                     // 滚动步长
        scrollInterval: 800,                 // 滚动间隔 (0.8秒)
        bottomStay: 2000,                    // ⏱️ 到底后停留 2秒 (严格执行)
        maxWaitTime: 120,                    // ⚠️ 单个帖子最长死磕 120秒 (防止MJJBox服务器抽风卡死)
        maxSearchScroll: 60,                 // 列表页下钻次数
        storageKey: 'mjjbox_history_v8',     // 历史库升级 V8
        statusKey: 'mjjbox_running_v8'
    };

    // --- 📊 状态记录 ---
    let state = {
        isRunning: localStorage.getItem(CONFIG.statusKey) === '1',
        searchAttempts: 0,
        visited: new Set()
    };

    // --- 🖥️ UI 控制面板 ---
    const UI = {
        init: function() {
            const div = document.createElement('div');
            div.style.cssText = `
                position: fixed; bottom: 20px; right: 20px; z-index: 10000;
                background: #2c3e50; color: #fff; padding: 15px; border-radius: 8px;
                font-family: sans-serif; font-size: 12px; box-shadow: 0 4px 15px rgba(0,0,0,0.3);
                border: 1px solid #34495e; min-width: 160px; text-align: center;
            `;
            
            const btnColor = state.isRunning ? "#c0392b" : "#27ae60";
            const btnText = state.isRunning ? "停止死磕" : "开始死磕";
            const statusText = state.isRunning ? "🔨 掘金中..." : "📦 已就绪";

            div.innerHTML = `
                <div style="font-weight:bold; color:#f1c40f; margin-bottom:8px; display:flex; justify-content:space-between; align-items:center;">
                    <span>📦 MJJBox V8.0</span>
                    <span id="mjj-clear" style="cursor:pointer; font-size:14px;" title="清除历史">🗑️</span>
                </div>
                <div id="mjj-msg" style="margin-bottom:8px; color:#bdc3c7;">${statusText}</div>
                <div id="mjj-debug" style="margin-bottom:10px; color:#95a5a6; font-size:10px;">等待指令...</div>
                <button id="mjj-btn" style="width:100%; padding:8px; cursor:pointer; background:${btnColor}; border:none; color:#fff; border-radius:4px; font-weight:bold;">${btnText}</button>
                <div style="margin-top:5px; font-size:10px; color:#7f8c8d;">去重库: <span id="mjj-v-count">0</span></div>
            `;
            document.body.appendChild(div);

            const btn = document.getElementById('mjj-btn');
            const clearBtn = document.getElementById('mjj-clear');
            
            setInterval(() => {
                const el = document.getElementById('mjj-v-count');
                if(el) el.innerText = state.visited.size;
            }, 2000);

            clearBtn.onclick = () => {
                if(confirm('清除所有已读记录？下次运行将重新扫描。')) {
                    state.visited.clear();
                    localStorage.removeItem(CONFIG.storageKey);
                    UI.log("🗑️ 记录已清空");
                }
            };

            btn.onclick = () => {
                state.isRunning = !state.isRunning;
                localStorage.setItem(CONFIG.statusKey, state.isRunning ? '1' : '0');

                if(state.isRunning) {
                    btn.innerText = "停止死磕";
                    btn。style。background = "#c0392b";
                    UI.log("🚀 启动引擎...");
                    Core.start();
                } else {
                    btn。innerText = "开始死磕";
                    btn。style。background = "#27ae60";
                    UI.log("🛑 已停止");
                    setTimeout(() => location.reload(), 500); 
                }
            };
        }，
        log: function(msg) {
            const el = document.getElementById('mjj-msg');
            if(el) el.innerText = msg;
        }，
        debug: function(msg) {
            const el = document.getElementById('mjj-debug');
            if(el) el.innerText = msg;
        }
    };

    // --- 💾 存储管理 ---
    const Storage = {
        load: function() {
            try {
                const raw = localStorage.getItem(CONFIG.storageKey);
                if(raw) {
                    const data = JSON。parse(raw);
                    const now = Date.now();
                    Object.keys(data)。forEach(u => {
                        // 3天有效期
                        if(now - data[u] < 259200000) state.visited.add(u);
                    });
                }
            } catch(e){}
        },
        save: function(url) {
            state。visited。add(url);
            const data = {};
            if(state。visited。size > 2500) state。visited.clear();
            state.visited。forEach(u => data[u] = Date。当前());
            localStorage.setItem(CONFIG.storageKey, JSON.stringify(data));
        }
    };

    // --- 🚀 核心逻辑 ---
    const Core = {
        start: function() {
            Storage.load();
            this.router();
        },
        
        router: function() {
            if(!state.isRunning) return;

            // 1. 帖子页
            if(/\/t\/.*?\/\d+$/。test(window。location.pathname)) {
                this。readPost();
                return;
            } 
            
            // 2. 强制 Latest (防止在首页分类视图找不到帖子)
            // MJJBox 是 Discourse，所以 /latest 是最稳的
            if(!window.location.pathname.includes('/latest') && !window.location.pathname.includes('/top')) {
                UI.log("🔄 前往Latest...");
                window.location.href = CONFIG.homeUrl;
                return;
            }

            this.scanList();
        },

        // 🟢 扫描列表 (无限下钻)
        scanList: async function() {
            UI.log("🔍 扫描中...");
            await new Promise(r => setTimeout(r, 2000)); 

            const checkAndScroll = async () => {
                if(!state.isRunning) return;
                
                // Discourse 通用选择器
                const links = Array.from(document.querySelectorAll('.topic-list-item .raw-topic-link'));
                const unread = links.filter(l => !state.visited.has(l.href));
                
                UI.debug(`发现:${links.length} | 未读:${unread.length} | 尝试:${state.searchAttempts}`);

                if(unread.length > 0) {
                    state.searchAttempts = 0;
                    const target = unread[0]; 
                    UI.log(`进入: ${target.innerText.trim().substring(0,8)}...`);
                    Storage.save(target.href);
                    window.location.href = target.href; 
                    return;
                }

                state.searchAttempts++;
                if(state.searchAttempts > CONFIG.maxSearchScroll) {
                    UI.log("⚠️ 找不到新帖，刷新重置");
                    setTimeout(() => location.reload(), 5000);
                    return;
                }

                UI.log(`下钻寻找中... (${state.searchAttempts})`);
                window.scrollTo(0, document.body.scrollHeight);
                setTimeout(checkAndScroll, 2000); 
            };
            checkAndScroll();
        },

        // 🔵 阅读帖子 (终极死磕逻辑)
        readPost: function() {
            UI.log("📖 正在爬楼...");
            
            let lastScrollTime = Date.now();
            let lastHeight = document.documentElement.scrollHeight;

            const timer = setInterval(() => {
                if(!state.isRunning) { clearInterval(timer); return; }

                // 1. 滚动
                window.scrollBy(0, CONFIG.scrollStep);

                // 2. 监测
                const currentHeight = document.documentElement.scrollHeight;
                const scrollPos = window.scrollY + window.innerHeight;
                
                // --- 🛡️ 核心判定：必须看到页脚组件 🛡️ ---
                // Discourse 底部通常是 #suggested-topics (建议话题) 或 .topic-map (帖子统计)
                const footer = document.querySelector('#suggested-topics') || document.querySelector('#topic-footer-buttons') || document.querySelector('.topic-map--bottom');
                const isRealFooterVisible = footer && (footer.getBoundingClientRect().top <= window.innerHeight + 80);

                // 3. 状态反馈
                if(currentHeight > lastHeight) {
                    lastHeight = currentHeight;
                    lastScrollTime = Date.now(); // 重置等待计时
                    UI.log("📦 加载新楼层...");
                } else if (!isRealFooterVisible) {
                    let waitTime = Math.floor((Date.now() - lastScrollTime) / 1000);
                    UI.debug(`等待加载... ${waitTime}s`);
                }

                // 4. 退出条件
                // A: 看到底部组件 -> 完美退出
                // B: 卡住超过 120秒 -> 强制退出
                if (isRealFooterVisible) {
                    clearInterval(timer);
                    UI.log(`✅ 到底！停留${CONFIG.bottomStay/1000}s`);
                    setTimeout(() => { window.location.href = CONFIG.homeUrl; }, CONFIG.bottomStay);
                } 
                else if ((Date.now() - lastScrollTime) > (CONFIG.maxWaitTime * 1000)) {
                    clearInterval(timer);
                    UI.log("⚠️ 超时强退 (防卡死)");
                    setTimeout(() => { window.location.href = CONFIG.homeUrl; }, 1000);
                }

            }, CONFIG.scrollInterval);
        }
    };

    // --- 初始化 ---
    window.addEventListener('load', () => {
        UI.init();
        if(state.isRunning) {
            setTimeout(() => Core.start(), 1500);
        }
    });

    let lastUrl = window.location.href;
    setInterval(() => {
        if(state.isRunning && window.location.href !== lastUrl) {
            lastUrl = window.location.href;
            setTimeout(() => Core.router(), 2000);
        }
    }, 1000);

})();
