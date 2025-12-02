// ==UserScript==
// @name         mjjbox.com 自动刷帖子（活跃）
// @namespace    http://tampermonkey.net/
// @version      1.0
// @description  mjjbox.com 自动浏览帖子（无新页面+去重+稳定启动）
// @author       你的用户名
// @match        https://mjjbox.com/*
// @match        https://mjjbox.com/c/*
// @match        https://mjjbox.com/t/*
// @match        https://mjjbox.com/new
// @match        https://mjjbox.com/top
// @grant        none
// @run-at       document-idle
// @license      MIT
// ==/UserScript==

(function() {
    'use strict';

    // 配置项（可按需调整）
    const config = {
        maxPosts: 15,         // 单次最大浏览数
        postStayMin: 3000,    // 帖子最小停留时间（毫秒）
        postStayMax: 5000,    // 帖子最大停留时间（毫秒）
        nextPageDelay: 2000,  // 翻页延迟
        storageKey: 'mjjbox_visited_posts' // 去重存储键（站点专属）
    };

    let currentPosts = 0;
    const visitedPosts = new Set();
    let isRunning = true;

    // ========== 1. 去重记录管理（持久化） ==========
    function initVisited() {
        const stored = localStorage.getItem(config.storageKey);
        if (stored) {
            const parsed = JSON.parse(stored);
            const now = Date.now();
            // 清理24小时前的过期记录
            Object.keys(parsed).forEach(url => {
                if (now - parsed[url] < 24 * 3600 * 1000) {
                    visitedPosts.add(url);
                }
            });
        }
    }

    function saveVisited(url) {
        const stored = JSON.parse(localStorage.getItem(config.storageKey) || '{}');
        stored[url] = Date.now();
        localStorage.setItem(config.storageKey, JSON.stringify(stored));
        visitedPosts.add(url);
    }

    // ========== 2. 适配 mjjbox 的帖子链接选择器 ==========
    function getPostLinks() {
        // 针对 mjjbox 调整的备选选择器（覆盖Discourse可能的结构）
        const selectors = [
            'a.title.raw-link.raw-topic-link', // Discourse标准标题链接
            '.topic-list-item a[href^="/t/"]', // 带/t/路径的帖子链接
            '.topic-title a.title',            // 标题区域的链接
            'a[data-topic-id].title-link'      // 带topic-id属性的链接
        ];

        for (const sel of selectors) {
            const links = Array.from(document.querySelectorAll(sel))
                .filter(link => link.href && link.textContent.trim() !== ''); // 过滤空链接
            if (links.length > 0) {
                console.log(`[mjjbox脚本] 找到${links.length}个帖子（选择器：${sel}）`);
                return links;
            }
        }
        console.log('[mjjbox脚本] 暂未找到帖子，将重试...');
        return [];
    }

    // ========== 3. 随机停留时间（模拟真人） ==========
    function randomStayTime() {
        return Math.floor(Math.random() * (config.postStayMax - config.postStayMin + 1)) + config.postStayMin;
    }

    // ========== 4. 核心逻辑（单页面跳转） ==========
    function processPost() {
        // 停止条件
        if (!isRunning || currentPosts >= config.maxPosts) {
            console.log(`[mjjbox脚本] 停止运行（已浏览${currentPosts}个帖子）`);
            return;
        }

        // 情况1：当前在帖子详情页 → 停留后返回列表页
        if (window.location.pathname.includes('/t/')) {
            const stayTime = randomStayTime();
            console.log(`[mjjbox脚本] 帖子内停留${stayTime/1000}秒`);
            setTimeout(() => {
                window.history.back(); // 返回上一页（列表页）
                setTimeout(processPost, config.nextPageDelay);
            }, stayTime);
            return;
        }

        // 情况2：当前在列表页 → 找未访问帖子
        const postLinks = getPostLinks();
        // 没找到链接 → 2秒后重试（适配动态加载）
        if (postLinks.length === 0) {
            setTimeout(processPost, 2000);
            return;
        }

        // 过滤已访问帖子
        const unvisited = postLinks.filter(link => !visitedPosts.has(link.href));
        if (unvisited.length === 0) {
            // 无新帖 → 跳转到下一页
            const nextPageBtn = document.querySelector('a.next.page-link') || document.querySelector('.pagination-next a');
            if (nextPageBtn) {
                console.log('[mjjbox脚本] 无未访问帖子，跳转到下一页');
                nextPageBtn.click();
                setTimeout(processPost, config.nextPageDelay);
            } else {
                console.log('[mjjbox脚本] 已到最后一页，停止');
                isRunning = false;
            }
            return;
        }

        // 情况3：跳转到未访问帖子（当前页面替换，不弹新标签）
        const randomPost = unvisited[Math.floor(Math.random() * unvisited.length)];
        saveVisited(randomPost.href);
        currentPosts++;

        console.log(`[mjjbox脚本] 浏览第${currentPosts}个帖子：${randomPost.textContent.trim()}`);
        window.location.href = randomPost.href;
    }

    // ========== 5. 适配 Discourse SPA 翻页（页面变化监听） ==========
    function watchPageChange() {
        let lastUrl = window.location.href;
        // 每隔1秒检查URL变化（翻页/切换板块时触发）
        setInterval(() => {
            if (window.location.href !== lastUrl && isRunning) {
                lastUrl = window.location.href;
                console.log('[mjjbox脚本] 页面变化，重新扫描帖子');
                setTimeout(processPost, 1500); // 延迟扫描，等内容加载
            }
        }, 1000);
    }

    // ========== 6. 启动入口（确保稳定启动） ==========
    function initScript() {
        initVisited();          // 初始化去重记录
        watchPageChange();      // 启动页面监听
        setTimeout(processPost, 1200); // 延迟启动，等mjjbox加载完成
        console.log('[mjjbox脚本] 已启动（单页面模式，无新标签）');
    }

    // 页面完全加载后启动（避免动态内容未渲染）
    if (document.readyState === 'complete') {
        initScript();
    } else {
        window.addEventListener('load', initScript);
    }

    // ========== 7. 手动停止（ESC键） ==========
    document.addEventListener('keydown', (e) => {
        if (e.key === 'Escape') {
            isRunning = false;
            alert('[mjjbox脚本] 已手动停止');
        }
    });
})();
