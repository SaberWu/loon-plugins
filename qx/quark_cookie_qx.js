// 夸克网盘签到 - 凭证抓取脚本（Quantumult X script-request-header）
// 触发：QX 开启状态下，打开夸克 App 的「网盘 → 签到/领空间」页
// 作用：从请求 URL 中提取 kps / sign / vcode 并存入 $prefs，供定时签到脚本使用
// 注意：decodeURIComponent 不会把 + 转成空格（与 Python parse_qs 不同），
//       参数中的字面量 + 会被原样保留，正好符合夸克接口要求，不要改成其他解析方式
// 改编自 Loon 版 quark_cookie.js：$persistentStore → $prefs，$notification → $notify

const url = $request.url;

function getQuery(name) {
  const m = url.match(new RegExp('[?&]' + name + '=([^&]*)'));
  return m ? decodeURIComponent(m[1]) : null;
}

const kps = getQuery('kps');
const sign = getQuery('sign');
const vcode = getQuery('vcode');

if (kps && sign && vcode) {
  const changed = $prefs.valueForKey('quark_kps') !== kps;
  $prefs.setValueForKey(kps, 'quark_kps');
  $prefs.setValueForKey(sign, 'quark_sign');
  $prefs.setValueForKey(vcode, 'quark_vcode');
  // 只有凭证变化时才通知，避免定时任务自触发时每天打扰
  if (changed) {
    $notify('夸克网盘签到', '凭证已更新 ✅', '签到参数已保存，有效期约 1-2 个月');
  }
} else {
  $notify('夸克网盘签到', '抓取失败 ⚠️', '请求中缺少 kps/sign/vcode，请确认打开的是签到页');
}

$done({});
