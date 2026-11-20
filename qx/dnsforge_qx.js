/**
 * DNSForge / AdGuard Home 签到脚本 for Quantumult X
 * 账号密码只存在手机本地（QX $prefs），不写进脚本文件、不上传。
 * 首次使用：先跑一次 dnsforge_setup.js（见附件，另发你），把账号密码写入本地存储。
 * 注意：下面 4 个签到端点是推测的（原作者未给出真实接口），AdGuard Home 官方
 * 并没有 checkin 接口；脚本会按顺序逐个尝试，哪个返回 2xx 就用哪个并通知你。
 * 如果 4 个全失败（常见是 404），说明端点猜错了，需要拿到真实签到接口地址再改。
 */

const $ = new Env("DNSForge 签到");

// QX 的 JS 环境不一定自带 btoa，没有就用下面这个顶上（必须放在签到逻辑之前）
if (typeof btoa === "undefined") {
    var btoa = function (str) {
        const chars = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/=";
        let out = "";
        for (let i = 0; i < str.length; i += 3) {
            const a = str.charCodeAt(i);
            const b = str.charCodeAt(i + 1);
            const c = str.charCodeAt(i + 2);
            const n = (a << 16) | ((b || 0) << 8) | (c || 0);
            out += chars[(n >> 18) & 63] + chars[(n >> 12) & 63] + (isNaN(b) ? "=" : chars[(n >> 6) & 63]) + (isNaN(c) ? "=" : chars[n & 63]);
        }
        return out;
    };
}

// ================= 用户配置区 =================
const config = {
    host: "https://adguardhome.lv10.ren",
    username: $prefs.valueForKey("dnsforge_username") || "",
    password: $prefs.valueForKey("dnsforge_password") || "",
    // 推测的签到端点列表，按顺序尝试，遇到 2xx 即视为成功
    endpoints: [
        "/control/checkin",
        "/control/check_in",
        "/api/v1/user/checkin",
        "/checkin"
    ]
};
// =============================================

!(async () => {
    if (!config.username || !config.password) {
        $.msg($.name, "❌ 未配置账号", "请先运行 dnsforge_setup.js 写入账号密码（只存手机本地）");
        return $.done();
    }

    const authHeader = "Basic " + btoa(config.username + ":" + config.password);
    let success = false;
    let lastError = "";

    for (const path of config.endpoints) {
        const url = config.host + path;
        $.log(`🔎 尝试请求: ${url}`);
        try {
            const response = await $.fetch(url, {
                method: "POST", // 签到通常是 POST，少数可能是 GET
                headers: {
                    "Authorization": authHeader,
                    "Content-Type": "application/json"
                },
                body: JSON.stringify({}) // 部分接口需要空 body
            });

            // QX 的 $task.fetch 返回 { statusCode, headers, body }，没有 .status / .text()
            const status = response.statusCode;
            const body = response.body || "";

            $.log(`📡 响应 [${status}]: ${body.substring(0, 200)}`);

            if (status >= 200 && status < 300) {
                // 尝试解析 JSON，提取可能的消息
                let msg = "签到成功";
                try {
                    const data = JSON.parse(body);
                    msg = data.message || data.msg || data.result || "签到成功";
                } catch (e) { /* 非 JSON 响应，忽略 */ }
                $.msg($.name, "✅ 签到成功", `端点: ${path}\n${msg}`);
                success = true;
                break; // 成功一个就不再尝试后续端点
            } else if (status === 401) {
                lastError = "认证失败，请检查用户名和密码";
                break; // 认证失败就没必要试其他端点了
            } else {
                lastError = `HTTP ${status}`;
            }
        } catch (e) {
            lastError = e.message || "网络请求异常";
            $.log(`⚠️ 请求 ${path} 异常: ${lastError}`);
        }
    }

    if (!success) {
        $.msg($.name, "❌ 签到失败", `所有端点均未成功。\n最后错误: ${lastError}`);
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
