// fanqie_cookie_qx.js
// 番茄小说签到凭证抓取（Quantumult X script-request-body）
// 用法：装好配置并开启 MITM 后，打开番茄小说 App，手动点一次"签到"/"福利"
// 命中签到相关接口时，完整请求（方法/URL/请求头/Body）会自动存入 QX $prefs
// 注意：字节系 App 请求带签名，直接重放可能次日失效，属已知风险，需实测
// 改编自 Loon 版 fanqie_cookie.js：$persistentStore → $prefs，$notification → $notify
// QX 注意：本脚本需配 script-request-body（要读 $request.body），不是 script-request-header

const KEY_PREFIX = "fanqie_checkin_";
const url = $request.url || "";

function save() {
  $prefs.setValueForKey($request.method || "GET", KEY_PREFIX + "method");
  $prefs.setValueForKey(url, KEY_PREFIX + "url");
  try {
    $prefs.setValueForKey(JSON.stringify($request.headers || {}), KEY_PREFIX + "headers");
  } catch (e) {
    $prefs.setValueForKey("{}", KEY_PREFIX + "headers");
  }
  $prefs.setValueForKey($request.body || "", KEY_PREFIX + "body");
  $prefs.setValueForKey(Date.now() + "", KEY_PREFIX + "saved_at");
  $notify("番茄小说", "签到凭证已保存", "明早 9 点定时任务将自动试签到");
}

// 只保存疑似签到/任务接口的请求，避免存下无关接口
if (/(checkin|check_in|signin|sign_in|sign|task|welfare|fuli)/i.test(url)) {
  save();
} else {
  // 非目标接口：静默放行，不打扰
}

$done({});
