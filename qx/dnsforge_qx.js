/**
 * DNSForge 签到脚本 for Quantumult X v2
 * 真实接口（从官网前端 JS 核实，2026-11-20）：
 *   POST /api/v1/auth/login     账号密码登录，返回 { tokens: { access_token, refresh_token } }
 *   GET  /api/v1/me/checkin     查签到状态（checked_today / streak / total_days）
 *   POST /api/v1/me/checkin     签到（无 body，Bearer 认证）
 *   POST /api/v1/auth/refresh   401 时用 refresh_token 换新 Token
 * 验证码已确认关闭（/api/v1/public/config：captcha.enabled=false，全场景关闭），
 * 脚本登录不需要验证码。
 * 账号密码与 Token 只存在手机本地（QX $prefs），不写进脚本文件、不上传。
 * 首次使用：先跑一次 dnsforge_setup.js（见附件，另发你），把账号密码写入本地存储。
 */

const $ = new Env("DNSForge 签到");

// ================= 用户配置区 =================
const config = {
    api: "https://adguardhome.lv10.ren/api/v1",
    username: $prefs.valueForKey("dnsforge_username") || "",
    password: $prefs.valueForKey("dnsforge_password") || "",
};
// =============================================

// ---------- Token 存取（只存手机本地） ----------
function getAccess() { return $prefs.valueForKey("dnsforge_access_token") || ""; }
function getRefresh() { return $prefs.valueForKey("dnsforge_refresh_token") || ""; }
function saveTokens(t) {
    if (!t) return;
    if (t.access_token) $prefs.setValueForKey(t.access_token, "dnsforge_access_token");
    if (t.refresh_token) $prefs.setValueForKey(t.refresh_token, "dnsforge_refresh_token");
}
function clearTokens() {
    $prefs.removeValueForKey("dnsforge_access_token");
    $prefs.removeValueForKey("dnsforge_refresh_token");
}

// ---------- 登录：POST /auth/login ----------
async function login() {
    const resp = await $.fetch(config.api + "/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username: config.username, password: config.password, agree_terms: true })
    });
    const data = parseBody(resp);
    if (resp.statusCode >= 200 && resp.statusCode < 300 && data && data.tokens) {
        saveTokens(data.tokens);
        return data.tokens.access_token;
    }
    throw new Error("登录失败：" + errMsg(resp, data));
}

// ---------- 刷新 Token：POST /auth/refresh ----------
async function refresh() {
    const rt = getRefresh();
    if (!rt) throw new Error("没有 refresh_token");
    const resp = await $.fetch(config.api + "/auth/refresh", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refresh_token: rt })
    });
    const data = parseBody(resp);
    if (resp.statusCode >= 200 && resp.statusCode < 300 && data && data.tokens) {
        saveTokens(data.tokens);
        return data.tokens.access_token;
    }
    throw new Error("刷新 Token 失败：" + errMsg(resp, data));
}

// ---------- 带 Bearer 的请求，401 自动刷新/重登一次 ----------
async function api(path, method, retried) {
    let token = getAccess();
    if (!token) token = await login();
    let resp = await $.fetch(config.api + path, {
        method: method,
        headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }
    });
    if (resp.statusCode === 401 && !retried) {
        try { token = await refresh(); }
        catch (e) { clearTokens(); token = await login(); }
        resp = await $.fetch(config.api + path, {
            method: method,
            headers: { "Authorization": "Bearer " + token, "Content-Type": "application/json" }
        });
    }
    return resp;
}

function parseBody(resp) {
    try { return JSON.parse(resp.body || ""); } catch (e) { return null; }
}
function errMsg(resp, data) {
    if (data && data.error && data.error.message) return data.error.message;
    if (data && data.message) return data.message;
    return "HTTP " + resp.statusCode;
}

!(async () => {
    if (!config.username || !config.password) {
        $.msg($.name, "❌ 未配置账号", "请先运行 dnsforge_setup.js 写入账号密码（只存手机本地）");
        return $.done();
    }
    try {
        // 1. 先查状态：GET /me/checkin
        const stResp = await api("/me/checkin", "GET", false);
        const st = parseBody(stResp);
        if (stResp.statusCode !== 200 || !st) {
            $.msg($.name, "❌ 查询状态失败", errMsg(stResp, st));
            return $.done();
        }
        if (st.checked_today) {
            $.msg($.name, "✅ 今日已签到", `连续签到 ${st.streak || 0} 天，累计 ${st.total_days || 0} 天`);
            return $.done();
        }
        // 2. 未签到：POST /me/checkin
        const ckResp = await api("/me/checkin", "POST", false);
        const ck = parseBody(ckResp);
        if (ckResp.statusCode >= 200 && ckResp.statusCode < 300 && ck) {
            const title = ck.granted > 0 ? `签到成功，+${ck.granted} 天会员` : "签到成功";
            const sub = ck.bonus > 0 ? (ck.bonus_message || "有额外奖励") : `已连续签到 ${ck.streak || 0} 天`;
            $.msg($.name, "✅ " + title, sub);
        } else {
            $.msg($.name, "❌ 签到失败", errMsg(ckResp, ck));
        }
    } catch (e) {
        $.msg($.name, "❌ 签到异常", e.message || "网络请求异常");
    }
    $.done();
})();

// ================= 圈X 环境适配层 =================
function Env(name) {
    this.name = name;
    this.log = (...args) => console.log(...args);
    this.msg = (title, subtitle, body) => {
        $notify(title, subtitle, body);
    };
    this.fetch = (url, opts) => {
        return new Promise((resolve, reject) => {
            $task.fetch({ url, ...opts }).then(resolve, reject);
        });
    };
    this.done = () => $done();
    return this;
}
