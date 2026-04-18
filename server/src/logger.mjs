const LEVELS = { error: 10, warn: 20, info: 30, debug: 40 };

function buildRecord(level, defaults, args) {
  const record = {
    ts: new Date().toISOString(),
    level,
    ...defaults,
  };
  const msgParts = [];

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];
    if (arg instanceof Error) {
      if (record.err === undefined) {
        record.err = arg.message;
        if (arg.stack) record.err_stack = arg.stack;
      }
      if (i === 0 && arg.message) msgParts.push(arg.message);
    } else if (arg && typeof arg === 'object' && !Array.isArray(arg)) {
      Object.assign(record, arg);
    } else if (arg !== undefined) {
      msgParts.push(String(arg));
    }
  }

  if (msgParts.length > 0) {
    let msg = msgParts.join(' ');
    if (msg.endsWith(':')) msg = msg.slice(0, -1);
    record.msg = msg;
  }

  return record;
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
    const line = JSON.stringify(buildRecord(lvl, defaults, args)) + '\n';
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

export { buildRecord };
