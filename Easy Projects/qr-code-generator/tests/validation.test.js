import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildPayload, validateUrl, validatePhone, validateEmailAddress } from '../js/validation.js';

test('URLs without a protocol get https added', () => {
  const result = validateUrl('example.com/menu');
  assert.equal(result.value, 'https://example.com/menu');
  assert.equal(result.label, 'example.com');
});

test('http and https URLs are kept as typed', () => {
  assert.equal(validateUrl('http://example.com').value, 'http://example.com');
  assert.equal(validateUrl('HTTPS://Example.com').value, 'HTTPS://Example.com');
});

test('unsafe or unsupported schemes are rejected', () => {
  for (const input of ['javascript:alert(1)', 'data:text/html,hi', 'ftp://example.com', 'file:///etc/passwd']) {
    assert.equal(validateUrl(input).ok, false, input);
  }
});

test('invalid URLs are rejected, not rewritten', () => {
  for (const input of ['hello world', 'justaword', 'https://', 'exa mple.com']) {
    const result = validateUrl(input);
    assert.equal(result.ok, false, input);
    assert.ok(result.error);
  }
});

test('localhost is accepted', () => {
  assert.equal(validateUrl('localhost:3000').ok, true);
});

test('empty and whitespace-only input is flagged as empty, not as an error', () => {
  for (const type of ['url', 'text', 'email', 'phone', 'sms', 'wifi']) {
    const result = buildPayload(type, {});
    assert.deepEqual([result.ok, result.empty], [false, true], type);
  }
  assert.equal(validateUrl('   ').empty, true);
  assert.equal(buildPayload('text', { text: '  \n ' }).empty, true);
});

test('email validation', () => {
  assert.equal(validateEmailAddress('name@example.com').ok, true);
  for (const input of ['name', 'name@', '@example.com', 'a b@example.com', 'a@b']) {
    assert.equal(validateEmailAddress(input).ok, false, input);
  }
});

test('phone validation', () => {
  assert.equal(validatePhone('+1 555 123 4567').value, '+15551234567');
  for (const input of ['abc', '12', '+1234567890123456', '555-CALL']) {
    assert.equal(validatePhone(input).ok, false, input);
  }
});

test('Wi-Fi validation covers password rules and SSID length', () => {
  assert.equal(buildPayload('wifi', { ssid: 'Net', wifiPassword: 'short', security: 'WPA' }).ok, false);
  assert.equal(buildPayload('wifi', { ssid: 'x'.repeat(33), wifiPassword: 'longenough', security: 'WPA' }).ok, false);
  assert.equal(buildPayload('wifi', { ssid: 'Net', wifiPassword: '', security: 'WEP' }).ok, false);
  assert.equal(buildPayload('wifi', { ssid: 'Net', security: 'nopass' }).ok, true);
});

test('unknown types are rejected', () => {
  assert.equal(buildPayload('bogus', {}).ok, false);
});
