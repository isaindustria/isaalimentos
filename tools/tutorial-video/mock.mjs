// Simulador do Supabase (PostgREST + Auth + Storage) dentro do Playwright: nada chega ao banco real.
import { makeDb } from './fixtures.mjs';
const HOST = 'exbhhwrutvzpwcjxqikp.supabase.co';
const b64 = (o) => Buffer.from(JSON.stringify(o)).toString('base64url');

const singular = (t) => t.replace(/ies$/, 'y').replace(/s$/, '');
function splitTop(s) { const out = []; let d = 0, cur = ''; for (const ch of s) { if (ch === '(') d++; if (ch === ')') d--; if (ch === ',' && !d) { out.push(cur.trim()); cur = ''; } else cur += ch; } if (cur.trim()) out.push(cur.trim()); return out; }
function cast(v) { if (v === 'null') return null; if (v === 'true') return true; if (v === 'false') return false; return v; }
const eqv = (a, b) => a === b || String(a) === String(b);
function test(row, col, expr) {
  let neg = false; if (expr.startsWith('not.')) { neg = true; expr = expr.slice(4); }
  const i = expr.indexOf('.'), op = expr.slice(0, i); let v = decodeURIComponent(expr.slice(i + 1)); const x = row[col]; let r = true;
  if (op === 'eq') r = eqv(x, cast(v)); else if (op === 'neq') r = !eqv(x, cast(v));
  else if (op === 'in') { const l = v.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')); r = l.some((y) => eqv(x, y)); }
  else if (op === 'is') r = v === 'null' ? x == null : x === cast(v);
  else if (op === 'gt') r = x > v || +x > +v; else if (op === 'gte') r = x >= v || +x >= +v; else if (op === 'lt') r = x < v || +x < +v; else if (op === 'lte') r = x <= v || +x <= +v;
  else if (op === 'like' || op === 'ilike') { const re = new RegExp('^' + v.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/[%*]/g, '.*') + '$', op === 'ilike' ? 'i' : ''); r = re.test(String(x ?? '')); }
  return neg ? !r : r;
}
export function installMock(page, opts = {}) {
  const { D, ME } = makeDb();
  const jwt = `${b64({ alg: 'HS256', typ: 'JWT' })}.${b64({ sub: ME.id, email: ME.email, role: 'authenticated', aal: 'aal1', amr: [{ method: 'password', timestamp: 1 }], exp: Math.floor(Date.now() / 1000) + 3600 * 24 * 30, iat: Math.floor(Date.now() / 1000), session_id: 'demo' })}.c2ln`;
  const user = { id: ME.id, aud: 'authenticated', role: 'authenticated', email: ME.email, email_confirmed_at: ME.created_at, app_metadata: { provider: 'email' }, user_metadata: { name: ME.name }, factors: [], created_at: ME.created_at, updated_at: ME.created_at };
  const session = { access_token: jwt, token_type: 'bearer', expires_in: 3600 * 24 * 30, expires_at: Math.floor(Date.now() / 1000) + 3600 * 24 * 30, refresh_token: 'demo-refresh', user };
  const log = opts.log || (() => {});

  function embed(row, table, spec) {
    let m = spec.match(/^(?:(\w+):)?(\w+)(?:!\w+)?\((.*)\)$/s); if (!m) return;
    const [, alias, tgt, inner] = m, key = alias || tgt, rows = D[tgt] || [], s = singular(tgt);
    let fk = row[`${s}_id`] !== undefined ? [`${s}_id`, 'id'] : null;
    if (!fk && tgt === 'products' && 'product_code' in row) fk = ['product_code', 'code'];
    if (!fk && tgt === 'profiles') fk = ['created_by', 'id'];
    if (fk) { const r = rows.find((x) => eqv(x[fk[1]], row[fk[0]])); row[key] = r ? project(r, tgt, inner) : null; return; }
    const ps = singular(table); row[key] = rows.filter((x) => eqv(x[`${ps}_id`], row.id)).map((r) => project(r, tgt, inner));
  }
  function project(r, table, sel) {
    const parts = splitTop(sel || '*'); let out = {};
    for (const p of parts) {
      if (p.includes('(')) continue;
      if (p === '*') out = { ...out, ...r }; else { const [a, c] = p.includes(':') ? p.split(':') : [p, p]; out[a] = r[c.split('::')[0]]; }
    }
    for (const p of parts) if (p.includes('(')) embed(out, table, p);
    return out;
  }
  function query(table, url) {
    let rows = [...(D[table] || [])];
    const sp = url.searchParams;
    for (const [k, v] of sp) { if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(k) || k.includes('.')) continue; if (k === 'or') continue; rows = rows.filter((r) => test(r, k, v)); }
    const ord = sp.get('order');
    if (ord) { const keys = ord.split(',').map((o) => o.split('.')); rows.sort((a, b) => { for (const [c, dir] of keys) { const x = a[c], y = b[c]; if (x === y) continue; const r = x == null ? 1 : y == null ? -1 : (typeof x === 'number' ? x - y : String(x).localeCompare(String(y), 'pt')); return dir === 'desc' ? -r : r; } return 0; }); }
    const total = rows.length, off = +(sp.get('offset') || 0); if (sp.get('limit')) rows = rows.slice(off, off + +sp.get('limit'));
    return { rows, total };
  }
  const defaults = (table, r) => ({ ...(D[table]?.[0] && 'id' in D[table][0] && !r.id ? { id: crypto.randomUUID() } : {}), ...(D[table]?.[0] && 'created_at' in D[table][0] && !r.created_at ? { created_at: new Date().toISOString() } : {}), ...r });

  page.routeWebSocket(/supabase\.co\/realtime/, () => {});
  page.route((u) => u.hostname === HOST, async (route) => {
    const req = route.request(), url = new URL(req.url()), method = req.method(), path = url.pathname;
    const H = { 'content-type': 'application/json', 'access-control-allow-origin': '*', 'access-control-allow-headers': '*', 'access-control-allow-methods': '*', 'access-control-expose-headers': 'content-range' };
    const send = (status, body, extra = {}) => route.fulfill({ status, headers: { ...H, ...extra }, body: body === undefined ? '' : JSON.stringify(body) });
    if (method === 'OPTIONS') return send(200);
    try {
      if (path.startsWith('/auth/v1/')) {
        const p = path.slice(9);
        if (p.startsWith('token')) return send(200, session);
        if (p === 'user') return send(200, user);
        if (p === 'logout') return send(204);
        if (p === 'factors' || p.startsWith('factors')) return send(200, []);
        if (p === 'recover') return send(200, {});
        return send(200, {});
      }
      if (path.startsWith('/storage/v1/object/list/backups')) {
        const body = JSON.parse(req.postData() || '{}');
        if (!body.prefix) return send(200, [0, 1, 2, 3, 4].map((d) => ({ name: new Date(Date.now() - d * 864e5).toISOString().slice(0, 10), id: null, metadata: null })));
        return send(200, [{ name: 'isa-backup.json', id: 'x', metadata: { size: 4800000 + Math.round(Math.random() * 3e5) }, created_at: new Date().toISOString() }]);
      }
      if (path.startsWith('/storage/')) return send(200, []);
      if (path.startsWith('/functions/')) return send(200, { ok: true });
      if (path.startsWith('/rest/v1/rpc/')) {
        const fn = path.split('/').pop();
        if (fn === 'db_stats') return send(200, { db_bytes: 61_400_000, audit_rows: D.audit_log.length * 120, activities_rows: 840, tables: Object.keys(D).filter((k) => Array.isArray(D[k])).map((k) => ({ name: k, rows: D[k].length * 7, bytes: D[k].length * 7 * 900 })) });
        return send(200, null);
      }
      if (path.startsWith('/rest/v1/')) {
        const table = path.slice(9), acc = req.headers()['accept'] || '', prefer = req.headers()['prefer'] || '';
        const single = acc.includes('vnd.pgrst.object');
        if (method === 'GET' || method === 'HEAD') {
          const { rows, total } = query(table, url);
          const out = rows.map((r) => project(r, table, url.searchParams.get('select')));
          const cr = { 'content-range': `${out.length ? 0 : '*'}-${Math.max(0, out.length - 1)}/${total}` };
          if (method === 'HEAD') return send(200, undefined, cr);
          if (single) return out.length ? send(200, out[0], cr) : send(406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: 'The result contains 0 rows' });
          return send(200, out, cr);
        }
        log(`${method} ${table}`);
        D[table] = D[table] || [];
        let changed = [];
        if (method === 'POST') {
          let body = JSON.parse(req.postData() || '[]'); if (!Array.isArray(body)) body = [body];
          const oc = url.searchParams.get('on_conflict');
          for (const r of body) {
            const keys = oc ? oc.split(',') : D[table][0] && 'code' in D[table][0] && !('id' in D[table][0]) ? ['code'] : ['id'];
            const hit = prefer.includes('merge-duplicates') || oc ? D[table].find((x) => keys.every((k) => r[k] !== undefined && eqv(x[k], r[k]))) : null;
            if (hit) { Object.assign(hit, r); changed.push(hit); } else { const nr = defaults(table, r); D[table].push(nr); changed.push(nr); }
          }
        } else if (method === 'PATCH') {
          const patch = JSON.parse(req.postData() || '{}'); const { rows } = query(table, url); rows.forEach((r) => Object.assign(r, patch)); changed = rows;
        } else if (method === 'DELETE') {
          const { rows } = query(table, url); D[table] = D[table].filter((r) => !rows.includes(r)); changed = rows;
        }
        const cr = { 'content-range': `*/${changed.length}` };
        if (prefer.includes('return=representation')) { const out = changed.map((r) => project(r, table, url.searchParams.get('select'))); return send(201, single ? out[0] : out, cr); }
        return send(method === 'POST' ? 201 : 204, undefined, cr);
      }
      return send(404, { message: 'mock: rota desconhecida' });
    } catch (e) { console.log('MOCK ERR', path, e.message); return send(500, { message: e.message }); }
  });
  return { D, ME };
}
