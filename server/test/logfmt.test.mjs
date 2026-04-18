import { test } from 'node:test';
import assert from 'node:assert/strict';
import { format, encodeValue, coerceArgs } from '../src/logfmt.mjs';

// Strip the dynamic timestamp prefix for stable assertions.
const TS_RE = /^ts=\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z /;
const stripTs = (line) => line.replace(TS_RE, '');

test('encodeValue: bare vs quoted values', () => {
  assert.equal(encodeValue('SACNLightingDriver'), 'SACNLightingDriver');
  assert.equal(encodeValue('hello world'), '"hello world"');
  assert.equal(encodeValue(''), '""');
  assert.equal(encodeValue(42), '42');
  assert.equal(encodeValue(true), 'true');
  assert.equal(encodeValue(null), 'null');
  assert.equal(encodeValue(undefined), undefined);
  assert.equal(encodeValue(NaN), '"NaN"');
});

test('encodeValue: escaping', () => {
  assert.equal(encodeValue('a"b'), '"a\\"b"');
  assert.equal(encodeValue('a\\b'), '"a\\\\b"');
  assert.equal(encodeValue('line1\nline2'), '"line1\\nline2"');
  assert.equal(encodeValue('tab\there'), '"tab\\there"');
});

test('encodeValue: objects and arrays JSON-serialized', () => {
  assert.equal(encodeValue({ a: 1 }), '"{\\"a\\":1}"');
  assert.equal(encodeValue([1, 2, 3]), '"[1,2,3]"');
});

test('encodeValue: Error uses message', () => {
  const e = new Error('boom');
  assert.equal(encodeValue(e), '"boom"');
});

test('coerceArgs: string message with trailing colon stripped', () => {
  const { fields, msg } = coerceArgs(['Sending:']);
  assert.equal(msg, 'Sending');
  assert.deepEqual(fields, {});
});

test('coerceArgs: string + object merges keys and keeps msg', () => {
  const { fields, msg } = coerceArgs(['Sending:', { host: '1.2.3.4', port: 22 }]);
  assert.equal(msg, 'Sending');
  assert.deepEqual(fields, { host: '1.2.3.4', port: 22 });
});

test('coerceArgs: primitives after string fold into msg', () => {
  const { fields, msg } = coerceArgs(['SET', 'master', 100]);
  assert.equal(msg, 'SET master 100');
  assert.deepEqual(fields, {});
});

test('coerceArgs: Error promoted to err+err_stack', () => {
  const e = new Error('OSC error');
  const { fields, msg } = coerceArgs(['OSC error:', e]);
  assert.equal(msg, 'OSC error');
  assert.equal(fields.err, 'OSC error');
  assert.ok(fields.err_stack);
});

test('coerceArgs: object-first call merges to fields, no msg', () => {
  const { fields, msg } = coerceArgs([{ appName: 'recorder', appVersion: '2.0.1' }]);
  assert.equal(msg, '');
  assert.deepEqual(fields, { appName: 'recorder', appVersion: '2.0.1' });
});

test('coerceArgs: nested object flattened one level', () => {
  const { fields } = coerceArgs([{ a: 1, b: { c: 2, d: 3 } }]);
  assert.deepEqual(fields, { a: 1, b_c: 2, b_d: 3 });
});

test('format: plugin corpus patterns pinned', () => {
  // Representative plugin call: `this.log.info('Session ended...')` with driver=SACN
  const line1 = stripTs(format('info', { driver: 'SACNLightingDriver' }, ['Session ended, setting master intensity to 0']));
  assert.equal(line1, 'level=info driver=SACNLightingDriver msg="Session ended, setting master intensity to 0"');

  // `this.log.info('SET', meterName, value)`
  const line2 = stripTs(format('info', { driver: 'TestPluginVanilla' }, ['SET', 'colorTemp', 4000]));
  assert.equal(line2, 'level=info driver=TestPluginVanilla msg="SET colorTemp 4000"');

  // Directional arrow
  const line3 = stripTs(format('info', { driver: 'SARHLightingDriver' }, ['→ GoCue 1.100']));
  assert.equal(line3, 'level=info driver=SARHLightingDriver msg="→ GoCue 1.100"');

  // Startup log
  const line4 = stripTs(format('info', { component: 'state-server' }, ['Drivers validated']));
  assert.equal(line4, 'level=info component=state-server msg="Drivers validated"');

  // Socket connect
  const line5 = stripTs(format('info', { component: 'socket-server' }, ['Connected', { socket_id: 'abc123' }]));
  assert.equal(line5, 'level=info component=socket-server socket_id=abc123 msg=Connected');
});

test('format: undefined fields skipped, null emitted bare', () => {
  const line = stripTs(format('info', { a: undefined, b: null, c: 1 }, ['hi']));
  assert.equal(line, 'level=info b=null c=1 msg=hi');
});

test('format: key characters normalized', () => {
  const line = stripTs(format('info', { 'bad.key-name': 'x' }, []));
  assert.equal(line, 'level=info bad_key_name=x');
});
