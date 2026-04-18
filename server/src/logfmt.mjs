const LEVELS = { error: 10, warn: 20, info: 30, debug: 40 };
const BARE = /^[A-Za-z0-9_\-./:@]+$/;
const MAX_VAL = 8192;

function quote(s) {
  let out = s
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\r/g, '\\r')
    .replace(/\t/g, '\\t');
  if (out.length > MAX_VAL) out = out.slice(0, MAX_VAL) + '…[truncated]';
  return `"${out}"`;
}

function safeJson(v) {
  try { return JSON.stringify(v); } catch { return '[unserializable]'; }
}

export function encodeValue(v) {
  if (v === undefined) return undefined;
  if (v === null) return 'null';
  if (typeof v === 'boolean') return String(v);
  if (typeof v === 'number') return Number.isFinite(v) ? String(v) : quote(String(v));
  if (v instanceof Error) return quote(v.message ?? String(v));
  if (Array.isArray(v)) return quote(safeJson(v));
  if (typeof v === 'object') return quote(safeJson(v));
  const s = String(v);
  if (s === '') return '""';
  return BARE.test(s) ? s : quote(s);
}

function normalizeKey(k) {
  return String(k).replace(/[^a-zA-Z0-9_]/g, '_');
}

function flatten(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj)) {
    if (v instanceof Error) {
      out[k] = v.message;
      if (v.stack) out[`${k}_stack`] = v.stack;
    } else if (v && typeof v === 'object' && !Array.isArray(v)) {
      for (const [k2, v2] of Object.entries(v)) out[`${k}_${k2}`] = v2;
    } else {
      out[k] = v;
    }
  }
  return out;
}

export function coerceArgs(args) {
  const fields = {};
  const msgParts = [];
  let hasErr = false;
  const attachErr = (e) => {
    if (hasErr) return false;
    fields.err = e.message;
    if (e.stack) fields.err_stack = e.stack;
    hasErr = true;
    return true;
  };

  if (args.length === 0) return { fields, msg: '' };

  const [first, ...rest] = args;
  if (first instanceof Error) {
    attachErr(first);
    if (first.message) msgParts.push(first.message);
  } else if (typeof first === 'string') {
    msgParts.push(first.endsWith(':') ? first.slice(0, -1) : first);
  } else if (first && typeof first === 'object' && !Array.isArray(first)) {
    Object.assign(fields, flatten(first));
  } else if (first !== undefined) {
    msgParts.push(String(first));
  }

  let i = 2;
  for (const arg of rest) {
    if (arg instanceof Error) {
      if (!attachErr(arg)) fields[`arg${i}`] = safeJson({ message: arg.message, stack: arg.stack });
    } else if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      Object.assign(fields, flatten(arg));
    } else if (arg === undefined) {
      // skip
    } else {
      msgParts.push(String(arg));
    }
    i++;
  }

  return { fields, msg: msgParts.join(' ') };
}

export function format(level, defaultFields, args) {
  const { fields, msg } = coerceArgs(args);
  const parts = [
    `ts=${new Date().toISOString()}`,
    `level=${level}`,
  ];
  const all = { ...defaultFields, ...fields };
  for (const [k, v] of Object.entries(all)) {
    const enc = encodeValue(v);
    if (enc === undefined) continue;
    parts.push(`${normalizeKey(k)}=${enc}`);
  }
  if (msg) parts.push(`msg=${encodeValue(msg)}`);
  return parts.join(' ');
}

function resolveThreshold(configLevel) {
  const env = process.env.LOG_LEVEL?.toLowerCase();
  const level = (env && LEVELS[env]) ? env : (configLevel && LEVELS[configLevel]) ? configLevel : 'info';
  return LEVELS[level];
}

export function createLogger(options = {}) {
  const { level: configLevel, ...defaults } = options;
  const threshold = resolveThreshold(configLevel);
  const write = (lvl, args) => {
    if (LEVELS[lvl] > threshold) return;
    const line = format(lvl, defaults, args) + '\n';
    if (lvl === 'error' || lvl === 'warn') process.stderr.write(line);
    else process.stdout.write(line);
  };
  return {
    info: (...args) => write('info', args),
    warn: (...args) => write('warn', args),
    error: (...args) => write('error', args),
    debug: (...args) => write('debug', args),
  };
}

function normalizeKind(kind) {
  return kind.replace(/([a-z])([A-Z])/g, '$1_$2').toLowerCase();
}

export function winstonPrintf({ prefixPattern } = {}) {
  const SKIP = new Set(['level', 'message', 'timestamp', 'splat']);
  return (info) => {
    const fields = {};
    let msg = info.message;

    if (prefixPattern && typeof msg === 'string') {
      const m = msg.match(prefixPattern);
      if (m) {
        const { kind, id } = m.groups || {};
        if (kind) {
          if (id) fields[normalizeKind(kind)] = id;
          else fields.component = kind;
        }
        msg = msg.slice(m[0].length);
      }
    }

    for (const k of Object.keys(info)) {
      if (SKIP.has(k)) continue;
      fields[k] = info[k];
    }

    const parts = [
      `ts=${info.timestamp || new Date().toISOString()}`,
      `level=${info.level}`,
    ];
    for (const [k, v] of Object.entries(fields)) {
      const enc = encodeValue(v);
      if (enc === undefined) continue;
      parts.push(`${normalizeKey(k)}=${enc}`);
    }
    if (msg) parts.push(`msg=${encodeValue(msg)}`);
    return parts.join(' ');
  };
}
