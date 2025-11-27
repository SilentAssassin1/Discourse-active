// ==UserScript==
// @name         NodeLoc 自动刷帖子（活跃）
// @namespace    http://tampermonkey.net/
// @version      0.6
// @description  自动浏览 NodeLoc 帖子增加活跃度（无重复、动态停留3-5秒）
// @author       You
// @match        https://www.nodeloc.com/*
// @grant        none
// @run-at       document-idle
// ==/UserScript==

(function() {
    'use strict';

    // 配置项
    const config = {
        minStayTime: 3000,    // 最小停留时间（毫秒）
        maxStayTime: 5000,    // 最大停留时间（毫秒）
        maxPosts: 50,         // 单次运行最大浏览数
        nextPageDelay: 3000,  // 翻页延迟
        storageExpireHours: 24 // 已访问记录过期时间（小时）
    };

    let currentPosts = 0;
    const siteKey = 'nodeloc_visited_posts'; // 站点专属存储键

    // ========== 持久化存储工具函数 ==========
    // 获取本地存储的已访问帖子（自动清理过期）
    function getVisitedPosts() {
        const stored = localStorage.getItem(siteKey);
        if (!stored) return {};
        
        const data = JSON.parse(stored);
        const now = Date.now();
        const validData = {};

        // 清理过期记录（超过24小时的）
        Object.keys(data).forEach(url => {
            if (now - data[url] < config.storageExpireHours * 3600 * 1000) {
                validData[url] = data[url];
            }
        });

        // 保存清理后的数据
        localStorage.setItem(siteKey, JSON.stringify(validData));
        return validData;
    }

    // 添加已访问帖子到本地存储
    function addVisitedPost(url) {
        const visited = getVisitedPosts();
        visited[url] = Date.now(); // 记录访问时间戳
        localStorage.setItem(siteKey, JSON.stringify(visited));
    }

    // 检查帖子是否已访问过
    function isPostVisited(url) {
        const visited = getVisitedPosts();
        return !!visited[url];
    }

    // ========== 核心逻辑 ==========
    // 生成3-5秒随机停留时间
    function getRandomStayTime() {
        return Math.floor(Math.random() * (config.maxStayTime - config.minStayTime + 1)) + config.minStayTime;
    }

    // 随机延迟
    function randomDelay(base) {
        return base + Math.random() * 1500;
    }

    // 跳转到下一个未访问的帖子
    function goToNextPost() {
        if (currentPosts >= config.maxPosts) {
            console.log('已达到单次最大浏览数量，停止脚本');
            return;
        }

        // 获取当前页所有帖子链接，过滤已访问的
        const postLinks = document.querySelectorAll('a.title.raw-link.raw-topic-link');
        const unvisited = Array.from(postLinks).filter(link => !isPostVisited(link.href));

        if (unvisited.length === 0) {
            // 无未访问帖子，跳下一页
            const nextPageBtn = document.querySelector('a.next.page-link');
            if (nextPageBtn) {
                console.log('当前页无未访问帖子，跳转到下一页');
                setTimeout(() => nextPageBtn.click(), randomDelay(config.nextPageDelay));
            } else {
                console.log('已到最后一页且无新帖子，停止脚本');
            }
            return;
        }

        // 随机选一个未访问帖子
        const randomPost = unvisited[Math.floor(Math.random() * unvisited.length)];
        const postUrl = randomPost.href;
        
        // 标记为已访问（持久化）
        addVisitedPost(postUrl);
        currentPosts++;
        
        const stayTime = getRandomStayTime();
        console.log(`正在浏览第 ${currentPosts} 个帖子，停留${stayTime/1000}秒: ${randomPost.textContent}`);
        
        // 跳转帖子
        setTimeout(() => {
            window.location.href = postUrl;
        }, randomDelay(1000));
    }

    // 帖子内停留后返回列表页
    function stayInPostThenReturn() {
        if (window.location.pathname.includes('/t/')) {
            const stayTime = getRandomStayTime();
            setTimeout(() => {
                window.history.back();
                setTimeout(goToNextPost, randomDelay(config.nextPageDelay));
            }, stayTime);
        } else {
            goToNextPost();
        }
    }

    // 启动脚本
    stayInPostThenReturn();
})();
