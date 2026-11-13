// fanqie_checkin_qx.js
// 番茄小说每日自动签到（Quantumult X task，每天 9:00）
// 逻辑：重放 fanqie_cookie_qx.js 抓到的签到请求；结果用通知告知
// 若连续失败（多为字节签名过期），请重新打开 App 手动签到一次以刷新凭证
// 改编自 Loon 版 fanqie_checkin.js：$persistentStore → $prefs，$notification → $notify
// 修正（2026-11-14）：QX 的 task 里没有 $httpClient，改用 $task.fetch
// 修正：原版无凭证时只 notify 不 return，会继续往下跑空请求；QX 版改为无凭证直接结束

const KEY_PREFIX = "fanqie_checkin_";

function notify(title, sub, body) {
  $notify(title, sub || "", (body || "").slice(0, 300));
}

function finish() { $done(); }

const url = $prefs.valueForKey(KEY_PREFIX + "url");
if (!url) {
  notify("番茄小说签到", "未找到凭证", "请先：QX 开启 MITM -> 打开番茄小说 App -> 手动签到一次，凭证会自动保存");
  finish();
} else {
  const method = ($prefs.valueForKey(KEY_PREFIX + "method") || "GET").toUpperCase();
  let headers = {};
  try {
    headers = JSON.parse($prefs.valueForKey(KEY_PREFIX + "headers") || "{}");
  } catch (e) { headers = {}; }
  // 重放时去掉长度类请求头，让 fetch 自行计算
  ["Content-Length", "content-length"].forEach(function (k) { delete headers[k]; });
  const body = $prefs.valueForKey(KEY_PREFIX + "body") || "";

  const opts = { url: url, method: method, headers: headers };
  if (method !== 'GET' && body) opts.body = body;

  $task.fetch(opts).then(
    (resp) => {
      const status = resp && resp.statusCode ? resp.statusCode : -1;
      let text = String(resp.body || "");
      let summary = "HTTP " + status;
      try {
        const j = JSON.parse(text);
        // 尽量给出人类可读的结果摘要
        summary = JSON.stringify(j).slice(0, 220);
      } catch (e) {
        if (text) summary = text.slice(0, 220);
      }
      if (status === 200) {
        notify("番茄小说签到", "已执行（请看 App 内是否到账）", summary);
      } else {
        notify("番茄小说签到", "异常，HTTP " + status, summary + "｜若连续异常请重抓凭证");
      }
      finish();
    },
    (err) => {
      notify("番茄小说签到", "请求失败", "网络错误：" + String(err).slice(0, 120));
      finish();
    }
  );
}
