/**
 * finTB Worker v3 — adaptér pre Enable Banking (api.enablebanking.com).
 * Navonok drží ROVNAKÝ kontrakt ako v2 (Tatra Premium API tvar), takže finTB sa nemení.
 *
 * Enable Banking flow: JWT (RS256, privátny kľúč aplikácie) v Authorization hlavičke
 * každého volania → POST /auth (výber banky) → redirect PSU → /callback?code →
 * POST /sessions → uid účtov → GET /accounts/{uid}/balances|transactions (continuation_key).
 *
 * Nastavenia (Settings → Variables & Secrets):
 *   Secrets:   EB_APP_ID       — ID aplikácie z Control Panelu (= kid, aj názov .pem súboru)
 *              EB_PRIVATE_KEY  — obsah stiahnutého .pem súboru (celý, vrátane BEGIN/END riadkov)
 *              APP_KEY         — tvoje heslo pre finTB (ostáva z v2)
 *   Variables: EB_ASPSP_NAME   — presný názov banky (default "Tatra banka"; sandbox test: "Nordea")
 *              EB_ASPSP_COUNTRY— krajina banky (default "SK"; sandbox test: "FI")
 *              EB_VALID_DAYS   — dĺžka žiadaného súhlasu v dňoch (default 89)
 *   KV binding: TOKENS (ostáva z v2)
 */

const EB = 'https://api.enablebanking.com';
const ALLOWED_ORIGINS = ['https://johnmarkinson33.github.io', 'https://localhost'];

const json = (d, status = 200, extra = {}) => new Response(JSON.stringify(d, null, 2), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...extra } });
const html = (b, status = 200) => new Response(`<!doctype html><meta charset="utf-8"><body style="font-family:system-ui;background:#0d1117;color:#cdd9e5;display:grid;place-items:center;min-height:90vh"><div style="max-width:480px;text-align:center">${b}</div>`, { status, headers: { 'content-type': 'text/html; charset=utf-8' } });
function corsHeaders(req){ const o=req.headers.get('Origin')||''; const ok=ALLOWED_ORIGINS.includes(o); return {'Access-Control-Allow-Origin':ok?o:ALLOWED_ORIGINS[0],'Access-Control-Allow-Headers':'x-app-key,content-type','Access-Control-Allow-Methods':'GET,OPTIONS'}; }
const checkKey=(req,env,url)=>{ const k=(req.headers.get('x-app-key')||url.searchParams.get('k')||'').trim(); return env.APP_KEY && k===String(env.APP_KEY).trim(); };

// ── JWT (presne podľa EB quick-startu: iss/aud fixné, kid = app id) ──────────
const b64u = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf))).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
const b64uJson = (o) => b64u(new TextEncoder().encode(JSON.stringify(o)));
async function importPrivateKey(pem){
  if (/BEGIN RSA PRIVATE KEY/.test(pem)) throw new Error('kľúč je PKCS#1 — konvertuj: openssl pkcs8 -topk8 -nocrypt -in kluc.pem');
  const der = Uint8Array.from(atob(pem.replace(/-----[^-]+-----/g,'').replace(/\s+/g,'')), c=>c.charCodeAt(0));
  return crypto.subtle.importKey('pkcs8', der.buffer, { name:'RSASSA-PKCS1-v1_5', hash:'SHA-256' }, false, ['sign']);
}
async function ebJwt(env){
  if (!env.EB_APP_ID) throw new Error('chýba secret EB_APP_ID (Settings → Variables & Secrets → pridať → Deploy)');
  if (!env.EB_PRIVATE_KEY) throw new Error('chýba secret EB_PRIVATE_KEY (obsah stiahnutého .pem súboru)');
  const iat = Math.floor(Date.now()/1000);
  const data = b64uJson({ typ:'JWT', alg:'RS256', kid: env.EB_APP_ID }) + '.' + b64uJson({ iss:'enablebanking.com', aud:'api.enablebanking.com', iat, exp: iat+3600 });
  const key = await importPrivateKey(env.EB_PRIVATE_KEY || '');
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(data));
  return data + '.' + b64u(sig);
}
async function eb(env, path, method='GET', bodyObj=null){
  const r = await fetch(EB + path, { method, headers: { 'Authorization': 'Bearer ' + await ebJwt(env), ...(bodyObj?{'content-type':'application/json'}:{}) }, body: bodyObj?JSON.stringify(bodyObj):undefined });
  const data = await r.json().catch(()=>({ _raw:'non-json', _status:r.status }));
  if (!r.ok) throw new Error(`eb_error ${r.status} on ${path.split('?')[0]}: ${JSON.stringify(data).slice(0,300)}`);
  return data;
}

// ── mapovanie EB → tvar Premium API (finTB kontrakt) ─────────────────────────
const BT_MAP = { ITAV:'interimAvailable', ITBD:'interimBooked', CLBD:'closingBooked', CLAV:'closingAvailable', XPCD:'expected', OPBD:'openingBooked' };
function mapBalances(list){ return (list||[]).map(b=>({ balanceAmount:{ amount: parseFloat(b.balance_amount?.amount ?? 0), currency: b.balance_amount?.currency||'EUR' }, balanceType: BT_MAP[b.balance_type] || b.balance_type || b.name || '', referenceDate: b.reference_date })); }
async function hashId(parts){ const d = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(parts.join('|'))); return 'eb_' + [...new Uint8Array(d)].slice(0,12).map(x=>x.toString(16).padStart(2,'0')).join(''); }
async function mapTx(t, seen){
  const rawAmt = parseFloat(t.transaction_amount?.amount ?? 0);
  const amount = Math.abs(rawAmt) * ((t.credit_debit_indicator === 'DBIT') ? -1 : 1);
  const st = (t.status === 'PDNG') ? 'PENDING' : 'BOOKED';
  const remit = Array.isArray(t.remittance_information) ? t.remittance_information.join(' ') : (t.remittance_information || '');
  let id = t.entry_reference || t.transaction_id;
  if (!id) { // deterministický fallback; kolízie rovnakých tx v ten istý deň rozlíši poradové číslo
    const base = await hashId([t.booking_date||'', String(amount), t.creditor?.name||'', t.debtor?.name||'', remit]);
    const n = (seen.get(base) || 0) + 1; seen.set(base, n);
    id = n > 1 ? base + '_' + n : base;
  }
  const btc = t.bank_transaction_code || {};
  const btcTxt = [btc.description, btc.code, btc.sub_code].filter(Boolean).join('-');
  return {
    transactionId: String(id), transactionState: st,
    bookingDate: t.booking_date || t.value_date, valueDate: t.value_date,
    transactionAmount: { amount, currency: t.transaction_amount?.currency || 'EUR' },
    // mená protistrán: EB má nested objekty, ale banky ich plnia nekonzistentne → viacero fallbackov
    creditorName: t.creditor?.name || t.creditor_name || undefined,
    creditorAccount: { iban: t.creditor_account?.iban },
    debtorName: t.debtor?.name || t.debtor_name || undefined,
    debtorAccount: { iban: t.debtor_account?.iban },
    remittanceInformationUnstructured: remit || undefined,
    // POZOR: bank_transaction_code je KÓD typu platby (napr. PMNT), nie obchodník → nikdy ako merchant
    bankTransactionCode: btcTxt || undefined,
    additionalInformation: t.note || t.creditor?.name || undefined,
    merchantCategoryCode: t.merchant_category_code || undefined,
    variableSymbol: t.reference_number || undefined,
  };
}

export default {
  async fetch(req, env){
    const url = new URL(req.url);
    const path = url.pathname.replace(/\/+$/,'') || '/';
    const cors = corsHeaders(req);
    if (req.method === 'OPTIONS') return new Response(null, { status:204, headers:cors });

    try {
      const ASPSP = { name: env.EB_ASPSP_NAME || 'Tatra banka', country: env.EB_ASPSP_COUNTRY || 'SK' };

      if (path === '/') {
        const pem = env.EB_PRIVATE_KEY || '';
        const pemState = !pem ? '✗ chýba' : (/BEGIN RSA PRIVATE KEY/.test(pem) ? '⚠ PKCS#1 — treba konvertovať' : (/BEGIN PRIVATE KEY/.test(pem) ? '✓' : '⚠ nevyzerá ako PEM'));
        return html(`<h2>finTB Worker v3 <span style="font-size:12px;color:#8b949e">(Enable Banking)</span></h2>
          <p>banka: <b>${ASPSP.name}</b> (${ASPSP.country})</p>
          <p style="font-size:12px;color:#8b949e">EB_APP_ID: <b style="color:${env.EB_APP_ID?'#5bc17c':'#e05c5c'}">${env.EB_APP_ID?'✓ ('+String(env.EB_APP_ID).length+' znakov)':'✗ chýba'}</b> · EB_PRIVATE_KEY: <b style="color:${pemState==='✓'?'#5bc17c':'#e05c5c'}">${pemState}</b> · APP_KEY: <b style="color:${env.APP_KEY?'#5bc17c':'#e05c5c'}">${env.APP_KEY?'✓':'✗'}</b></p>
          <p><a href="/connect" style="color:#5ea8d8">▶ Pripojiť banku (/connect)</a></p>
          <p style="font-size:13px;color:#8b949e">/status, /accounts, /sync, /banks vyžadujú <code>?k=APP_KEY</code>.</p>`);
      }

      if (path === '/connect') {
        const state = crypto.randomUUID();
        await env.TOKENS.put('eb_state', state, { expirationTtl: 900 });
        // dĺžka súhlasu: chcené EB_VALID_DAYS (default 179), ale nikdy viac než maximum banky (inak /auth spadne)
        let days = parseInt(env.EB_VALID_DAYS || '179', 10);
        try {
          const reg = await eb(env, '/aspsps?country=' + encodeURIComponent(ASPSP.country));
          const bank = (reg.aspsps || []).find(a => a.name === ASPSP.name);
          if (bank && bank.maximum_consent_validity) days = Math.min(days, Math.floor(bank.maximum_consent_validity / 86400) - 1);
        } catch (e) {}
        const validUntil = new Date(Date.now() + days * 864e5).toISOString();
        const d = await eb(env, '/auth', 'POST', {
          access: { valid_until: validUntil },
          aspsp: ASPSP,
          state,
          redirect_url: url.origin + '/callback',
          psu_type: 'personal',
        });
        return Response.redirect(d.url, 302);
      }

      if (path === '/callback') {
        const code = url.searchParams.get('code');
        const state = url.searchParams.get('state');
        const saved = await env.TOKENS.get('eb_state');
        if (!code) return html(`<h2>✗ Chýba code</h2><p>${url.searchParams.get('error_description')||url.searchParams.get('error')||'Banka nevrátila autorizačný kód.'}</p>`, 400);
        if (saved && state !== saved) return html('<h2>✗ Neplatný state</h2><p>Skús /connect znova.</p>', 400);
        const s = await eb(env, '/sessions', 'POST', { code });
        // niektoré info príde LEN raz → uložíme hneď (uid + iban + detail účtov)
        const accounts = (s.accounts_data || s.accounts || []).map(a => {
          const uid = a.uid || a;
          return { accountId: uid,
            accountReference: { iban: a.account_id?.iban || '', currency: a.currency || 'EUR' },
            bankName: ASPSP.name, product: a.product, name: a.name, cashAccountType: a.cash_account_type,
            consentExpirationDate: s.access?.valid_until };
        });
        await env.TOKENS.put('eb_session', JSON.stringify({ session_id: s.session_id, valid_until: s.access?.valid_until, accounts }));
        await env.TOKENS.delete('eb_state');
        return html('<h2 style="color:#5bc17c">✓ Banka pripojená</h2><p>Toto okno môžeš zavrieť.</p>');
      }

      if (!checkKey(req, env, url)) {
        const k=(req.headers.get('x-app-key')||url.searchParams.get('k')||'');
        return json({ error:'unauthorized', hint:'pridaj ?k=APP_KEY alebo hlavičku x-app-key',
          debug:{ app_key_nastaveny: !!env.APP_KEY, dlzka_ulozeneho: String(env.APP_KEY||'').length, dlzka_zadaneho: k.length } }, 401, cors);
      }

      if (path === '/banks') { // pomôcka: presné názvy bánk pre EB_ASPSP_NAME
        const country = url.searchParams.get('country') || ASPSP.country;
        const d = await eb(env, '/aspsps?country=' + encodeURIComponent(country));
        return json({ country, banks: (d.aspsps||[]).map(a=>({ name:a.name, country:a.country, maximum_consent_validity:a.maximum_consent_validity })) }, 200, cors);
      }

      const sesRaw = await env.TOKENS.get('eb_session');
      const ses = sesRaw ? JSON.parse(sesRaw) : null;

      if (path === '/status') {
        if (!ses) return json({ connected:false }, 200, cors);
        const left = ses.valid_until ? Math.round((new Date(ses.valid_until) - Date.now())/864e5) : null;
        return json({ connected:true, bank:ASPSP.name, consent_valid_until: ses.valid_until, consent_days_left:left, accounts: ses.accounts.map(a=>a.accountReference.iban) }, 200, cors);
      }

      if (!ses) throw new Error('not_connected');

      if (path === '/accounts') {
        const out = [];
        for (const a of ses.accounts) {
          let balances = [];
          try { const b = await eb(env, `/accounts/${a.accountId}/balances`); balances = mapBalances(b.balances); } catch(e) {}
          out.push({ ...a, balances });
        }
        return json({ accounts: out }, 200, cors);
      }

      if (path === '/sync') {
        let accountId = url.searchParams.get('account');
        const iban = url.searchParams.get('iban');
        if (!accountId) {
          if (!iban) return json({ error:'missing_account', hint:'/sync?k=…&iban=SK… alebo &account=UID' }, 400, cors);
          const hit = ses.accounts.find(a => (a.accountReference.iban||'').replace(/\s/g,'') === iban.replace(/\s/g,''));
          if (!hit) return json({ error:'iban_not_found', available: ses.accounts.map(a=>a.accountReference.iban) }, 404, cors);
          accountId = hit.accountId;
        }
        const from = url.searchParams.get('from') || new Date(Date.now()-90*864e5).toISOString().slice(0,10);
        const to = url.searchParams.get('to');
        const rawMode = url.searchParams.get('raw') === '1';
        let cont = null, all = [], raw = [], pages = 0; const seen = new Map();
        while (pages < 40) {
          const qs = new URLSearchParams({ date_from: from }); if (to) qs.set('date_to', to); if (cont) qs.set('continuation_key', cont);
          const d = await eb(env, `/accounts/${accountId}/transactions?${qs}`);
          for (const t of (d.transactions||[])) { if (rawMode && raw.length < 5) raw.push(t); all.push(await mapTx(t, seen)); }
          pages++;
          cont = d.continuation_key || null;
          if (!cont || (rawMode && raw.length >= 5)) break;
        }
        if (rawMode) return json({ hint: 'surové dáta z Enable Banking (prvých 5) — na ladenie mapovania', raw }, 200, cors);
        return json({ accountId, iban: iban||null, from, to: to||null, pages, count: all.length, transactions: all }, 200, cors);
      }

      if (path === '/disconnect') {
        try { if (ses.session_id) await eb(env, `/sessions/${ses.session_id}`, 'DELETE'); } catch(e) {}
        await env.TOKENS.delete('eb_session');
        return json({ disconnected:true }, 200, cors);
      }

      return json({ error:'not_found', endpoints:['/','/connect','/callback','/status','/accounts','/sync','/banks','/disconnect'] }, 404, cors);
    } catch (e) {
      const msg = String(e && e.message || e);
      const status = msg === 'not_connected' ? 409 : 502;
      return json({ error: msg, hint: msg==='not_connected' ? 'otvor /connect a pripoj banku' : 'pozri Worker Logs' }, status, cors);
    }
  },
};