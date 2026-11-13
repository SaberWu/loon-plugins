// 夸克网盘签到 - 定时签到脚本（Quantumult X task 类型，每天 9:00 执行）
// 流程：GET capacity/growth/info 查签到状态 → 未签则 POST capacity/growth/sign → 通知结果
// 凭证来源：quark_cookie_qx.js 抓取并存入 $prefs（kps / sign / vcode）
// 接口依据：Liu8Can/Quark_Auto_Check_In 与 BNDou/Auto_Check_In 双源核实（2026-10-06）
// 改编自 Loon 版 quark_checkin.js：$persistentStore → $prefs，$notification → $notify

const kps = $prefs.valueForKey('quark_kps');
const sign = $prefs.valueForKey('quark_sign');
const vcode = $prefs.valueForKey('quark_vcode');

function notify(sub, body) {
  $notify('夸克网盘签到', sub, body);
}

function fmtSize(bytes) {
  const n = Number(bytes);
  if (isNaN(n) || n <= 0) return '0MB';
  return n >= 1073741824 ? (n / 1073741824).toFixed(2) + 'GB' : (n / 1048576).toFixed(1) + 'MB';
}

if (!kps || !sign || !vcode) {
  notify('缺少凭证 ⚠️', '请先保持 QX 开启，打开夸克 App 的签到页抓取凭证');
  $done();
} else {
  const query = 'pr=ucpro&fr=android'
    + '&kps=' + encodeURIComponent(kps)
    + '&sign=' + encodeURIComponent(sign)
    + '&vcode=' + encodeURIComponent(vcode);
  const base = 'https://drive-m.quark.cn/1/clouddrive/capacity/growth';

  $httpClient.get(base + '/info?' + query, (error, response, data) => {
    if (error) {
      notify('请求失败 ⚠️', String(error));
      return $done();
    }
    let info = null;
    try { info = JSON.parse(data); } catch (e) { /* 非 JSON 响应 */ }
    const capSign = info && info.data && info.data.cap_sign;

    if (!capSign) {
      notify('凭证可能失效 ⚠️', (info && info.message) || '请重新打开夸克签到页抓取');
      return $done();
    }

    if (capSign.sign_daily) {
      const total = info.data.cap_composition ? info.data.cap_composition.sign_reward : 0;
      notify('今日已签到 ✅', '累计签到奖励 ' + fmtSize(total));
      return $done();
    }

    $httpClient.post({
      url: base + '/sign?' + query,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ sign_cyclic: true })
    }, (error2, response2, data2) => {
      if (error2) {
        notify('签到请求失败 ⚠️', String(error2));
        return $done();
      }
      let result = null;
      try { result = JSON.parse(data2); } catch (e) { /* 非 JSON 响应 */ }
      if (result && result.data && typeof result.data.sign_daily_reward !== 'undefined') {
        notify('签到成功 ✅', '本次获得 ' + fmtSize(result.data.sign_daily_reward));
      } else {
        notify('签到失败 ⚠️', (result && result.message) || '未知错误');
      }
      $done();
    });
  });
}
