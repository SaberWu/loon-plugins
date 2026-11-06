// cnc07 节点定时提醒（Loon cron 脚本，ES5 写法）
// 每 6 小时拉取快捷加速器节点源，解密后与上次比对；
// 每次运行都发通知（首次、节点变化、无变化、拉取失败），点通知复制 Loon [Proxy] 格式节点。
// 节点本身不自动进代理列表（Loon 插件无 [Proxy] 模块，脚本 API 也无加节点接口）。
// 来源：快捷指令「快捷加速器」（Telegram t.me/GieGie777 搬运）
// 链路：GET http://cnc07api.cnc07.com/api/cnc07apijm
//       -> AES-128-CBC 解密（本机 $crypto，Build 988+；失败则走 ssleye 在线解密兜底）
//       -> 解析 alias 里的 ss 节点 -> 拼 Loon [Proxy] 格式节点行

var API = "http://cnc07api.cnc07.com/api/cnc07apijm";
var DECRYPT_URL = "https://www.ssleye.com/ssltool/aes_decrypt_hander";
var KEY_STR = "1kv10h7t*C3f8c@$";
var IV_STR = "@$6l&bxb5n35c2w9";
var STORE_KEY = "cnc07_last";
var SS_RE = /SS\s*=\s*ss,\s*([\d.]+),\s*(\d+),encrypt-method=([a-z0-9\-]+),password=([^\s,\n]+)/;

// ---------- base64 / UTF-8（不依赖 atob/btoa 与 TextEncoder） ----------
var B64 = "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/";

function b64Decode(b64) {
  var clean = b64.replace(/[^A-Za-z0-9+\/=]/g, "");
  var out = [];
  var i, c0, c1, c2, c3;
  for (i = 0; i < clean.length; i += 4) {
    c0 = B64.indexOf(clean.charAt(i));
    c1 = B64.indexOf(clean.charAt(i + 1));
    c2 = clean.charAt(i + 2) === "=" ? 0 : B64.indexOf(clean.charAt(i + 2));
    c3 = clean.charAt(i + 3) === "=" ? 0 : B64.indexOf(clean.charAt(i + 3));
    if (c0 < 0 || c1 < 0) break;
    out.push((c0 << 2) | (c1 >> 4));
    if (clean.charAt(i + 2) !== "=") out.push(((c1 & 15) << 4) | (c2 >> 2));
    if (clean.charAt(i + 3) !== "=") out.push(((c2 & 3) << 6) | c3);
  }
  return new Uint8Array(out);
}

function utf8Encode(str) {
  var out = [];
  var i, c;
  for (i = 0; i < str.length; i++) {
    c = str.charCodeAt(i);
    if (c < 0x80) {
      out.push(c);
    } else if (c < 0x800) {
      out.push(0xc0 | (c >> 6), 0x80 | (c & 0x3f));
    } else if (c >= 0xd800 && c <= 0xdbff) {
      // surrogate pair
      var hi = c, lo = str.charCodeAt(++i);
      var cp = ((hi - 0xd800) << 10) + (lo - 0xdc00) + 0x10000;
      out.push(0xf0 | (cp >> 18), 0x80 | ((cp >> 12) & 0x3f), 0x80 | ((cp >> 6) & 0x3f), 0x80 | (cp & 0x3f));
    } else {
      out.push(0xe0 | (c >> 12), 0x80 | ((c >> 6) & 0x3f), 0x80 | (c & 0x3f));
    }
  }
  return out;
}

function utf8Decode(bytes) {
  var out = "", i = 0, c, c2, c3, c4;
  while (i < bytes.length) {
    c = bytes[i++];
    if (c < 0x80) {
      out += String.fromCharCode(c);
    } else if ((c & 0xe0) === 0xc0) {
      c2 = bytes[i++];
      out += String.fromCharCode(((c & 0x1f) << 6) | (c2 & 0x3f));
    } else if ((c & 0xf0) === 0xe0) {
      c2 = bytes[i++]; c3 = bytes[i++];
      out += String.fromCharCode(((c & 0x0f) << 12) | ((c2 & 0x3f) << 6) | (c3 & 0x3f));
    } else {
      c2 = bytes[i++]; c3 = bytes[i++]; c4 = bytes[i++];
      var cp = (((c & 0x07) << 18) | ((c2 & 0x3f) << 12) | ((c3 & 0x3f) << 6) | (c4 & 0x3f)) - 0x10000;
      out += String.fromCharCode(0xd800 + (cp >> 10), 0xdc00 + (cp & 0x3ff));
    }
  }
  return out;
}

// ---------- 解密 ----------
function decryptLocal(cipherB64, cb) {
  try {
    if (typeof $crypto === "undefined" || !$crypto.aes || !$crypto.aes.decrypt) return cb(null);
    var pt = $crypto.aes.decrypt(b64Decode(cipherB64), {
      mode: "cbc",
      key: new Uint8Array(utf8Encode(KEY_STR)),
      iv: new Uint8Array(utf8Encode(IV_STR)),
      padding: "pkcs7"
    });
    cb(utf8Decode(pt));
  } catch (e) {
    console.log("cnc07 本机解密失败：" + (e && e.message ? e.message : e));
    cb(null);
  }
}

function decryptRemote(cipherB64, cb) {
  var body = "text=" + encodeURIComponent(cipherB64)
    + "&encode_flag=utf8"
    + "&key=" + encodeURIComponent(KEY_STR)
    + "&iv=" + encodeURIComponent(IV_STR)
    + "&mode=CBC&padding=pkcs5&out_mode=base64&mactag=";
  $httpClient.post({
    url: DECRYPT_URL,
    timeout: 15000,
    headers: {"Content-Type": "application/x-www-form-urlencoded"},
    body: body,
    node: "DIRECT"
  }, function (error, response, data) {
    if (error) return cb(null);
    try {
      var j = JSON.parse(data);
      if (j && j.msg) return cb(j.msg);
    } catch (e) {}
    cb(null);
  });
}

// ---------- 主流程 ----------
function fail(reason) {
  $notification.post("cnc07 节点提醒", "拉取失败", reason);
  $done();
}

function handlePlain(plain) {
  var items;
  try {
    items = JSON.parse(plain);
  } catch (e) {
    return fail("解密结果不是 JSON");
  }
  if (!items || !items.length) return fail("解密结果为空");
  var lines = [], keys = [], i, m;
  for (i = 0; i < items.length; i++) {
    m = SS_RE.exec(items[i].alias || "");
    if (!m) continue;
    var name = "cnc07-" + (items[i].city_cn || items[i].country || "") + "-" + (items[i].code || "");
    lines.push(name + " = ss, " + m[1] + ", " + m[2] + ", encrypt-method=" + m[3] + ", password=" + m[4]);
    keys.push(m[1] + ":" + m[2]);
  }
  if (!lines.length) return fail("未解析出任何节点");
  var loonText = lines.join("\n");
  var prev = null;
  try {
    prev = JSON.parse($persistentStore.read(STORE_KEY) || "null");
  } catch (e) {}
  var prevKeys = (prev && prev.keys) || [];
  var added = 0, removed = 0, k;
  for (k = 0; k < keys.length; k++) if (prevKeys.indexOf(keys[k]) < 0) added++;
  for (k = 0; k < prevKeys.length; k++) if (keys.indexOf(prevKeys[k]) < 0) removed++;
  $persistentStore.write(JSON.stringify({count: lines.length, keys: keys, time: Date.now()}), STORE_KEY);
  if (!prev) {
    $notification.post("cnc07 节点提醒", "首次拉取成功", "共 " + lines.length + " 条节点，点通知复制 Loon 格式节点，粘贴到配置 [Proxy] 段", {clipboard: loonText});
  } else if (added > 0 || removed > 0) {
    $notification.post("cnc07 节点提醒", "节点有变化", "共 " + lines.length + " 条，新增 " + added + "，失效 " + removed + "，点通知复制 Loon 格式节点", {clipboard: loonText});
  } else {
    $notification.post("cnc07 节点提醒", "无变化", "共 " + lines.length + " 条，点通知复制 Loon 格式节点", {clipboard: loonText});
  }
  $done();
}

$httpClient.get({url: API, timeout: 15000, node: "DIRECT"}, function (error, response, data) {
  if (error) return fail("请求失败：" + error);
  var json;
  try {
    json = JSON.parse(data);
  } catch (e) {
    return fail("接口返回不是 JSON");
  }
  if (!json || json.errcode !== 200 || !json.servers) {
    return fail("接口返回异常 errcode=" + (json ? json.errcode : "空"));
  }
  decryptLocal(json.servers, function (plain) {
    if (plain) return handlePlain(plain);
    decryptRemote(json.servers, function (plain2) {
      if (plain2) return handlePlain(plain2);
      return fail("解密失败（本机与 ssleye 均失败）");
    });
  });
});
