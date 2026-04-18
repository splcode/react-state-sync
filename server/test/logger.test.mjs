import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecord } from '../src/logger.mjs';

// Strip the dynamic timestamp for stable assertions.
const stripTs = (r) => { const { ts, ...rest } = r; return rest; };
const hasIso = (r) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(r.ts);

test('buildRecord: string-only message', () => {
  const r = buildRecord('info', { driver: 'SACNLightingDriver' }, ['Session ended']);
  assert.ok(hasIso(r));
  assert.deepEqual(stripTs(r), { level: 'info', driver: 'SACNLightingDriver', msg: 'Session ended' });
});

test('buildRecord: trailing colon stripped from msg', () => {
  const r = buildRecord('info', {}, ['Sending:', { host: '1.2.3.4', port: 22 }]);
  assert.deepEqual(stripTs(r), { level: 'info', host: '1.2.3.4', port: 22, msg: 'Sending' });
});

test('buildRecord: primitive trailing args concatenated into msg', () => {
  const r = buildRecord('info', { driver: 'TestPluginVanilla' }, ['SET', 'master', 100]);
  assert.deepEqual(stripTs(r), { level: 'info', driver: 'TestPluginVanilla', msg: 'SET master 100' });
});

test('buildRecord: Error promoted to err+err_stack', () => {
  const e = new Error('OSC error');
  const r = buildRecord('error', { driver: 'SARHLightingDriver' }, ['OSC error:', e]);
  assert.equal(r.level, 'error');
  assert.equal(r.driver, 'SARHLightingDriver');
  assert.equal(r.err, 'OSC error');
  assert.ok(r.err_stack);
  assert.equal(r.msg, 'OSC error');
});

test('buildRecord: first-arg Error', () => {
  const e = new Error('boom');
  const r = buildRecord('error', {}, [e]);
  assert.equal(r.err, 'boom');
  assert.ok(r.err_stack);
  assert.equal(r.msg, 'boom');
});

test('buildRecord: object-only call (no msg)', () => {
  const r = buildRecord('info', {}, [{ appName: 'recorder', appVersion: '2.0.1' }]);
  assert.equal(r.level, 'info');
  assert.equal(r.appName, 'recorder');
  assert.equal(r.appVersion, '2.0.1');
  assert.equal(r.msg, undefined);
});

test('buildRecord: nested objects preserved (not flattened)', () => {
  const r = buildRecord('debug', {}, ['Request', { method: 'GET', headers: { host: 'x', 'user-agent': 'Chrome' } }]);
  assert.equal(r.method, 'GET');
  assert.deepEqual(r.headers, { host: 'x', 'user-agent': 'Chrome' });
  assert.equal(r.msg, 'Request');
});

test('buildRecord: JSON round-trip valid', () => {
  const r = buildRecord('info', { driver: 'X' }, ['hello', { a: 'b"c', b: 'line1\nline2' }]);
  const line = JSON.stringify(r);
  const parsed = JSON.parse(line);
  assert.equal(parsed.a, 'b"c');
  assert.equal(parsed.b, 'line1\nline2');
});

test('buildRecord: undefined args skipped', () => {
  const r = buildRecord('info', {}, ['hi', undefined, 'there']);
  assert.equal(r.msg, 'hi there');
});

test('buildRecord: defaults merged first, call-site fields override', () => {
  const r = buildRecord('info', { driver: 'Base' }, [{ driver: 'Override', extra: 1 }]);
  assert.equal(r.driver, 'Override');
  assert.equal(r.extra, 1);
});
