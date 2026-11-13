import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createMatrix, QrError } from '../js/qr-generator.js';
import { buildPayload } from '../js/validation.js';
import { decode } from './helpers.js';

const roundTrip = (type, fields) => {
  const payload = buildPayload(type, fields);
  assert.ok(payload.ok, payload.error);
  assert.equal(decode(createMatrix(payload.value)), payload.value);
  return payload.value;
};

test('URL codes decode to the address', () => {
  assert.equal(roundTrip('url', { url: 'https://example.com/menu?a=1' }), 'https://example.com/menu?a=1');
});

test('plain text codes decode, including non-Latin characters', () => {
  assert.equal(roundTrip('text', { text: 'Hello, world' }), 'Hello, world');
  assert.equal(roundTrip('text', { text: 'გამარჯობა 👋' }), 'გამარჯობა 👋');
});

test('email codes use mailto with encoded subject and body', () => {
  const value = roundTrip('email', { emailAddress: 'a@b.co', emailSubject: 'Hi there', emailBody: 'Line & more' });
  assert.equal(value, 'mailto:a@b.co?subject=Hi%20there&body=Line%20%26%20more');
});

test('email codes without extras are a bare mailto link', () => {
  assert.equal(roundTrip('email', { emailAddress: 'a@b.co' }), 'mailto:a@b.co');
});

test('phone codes use tel and strip formatting', () => {
  assert.equal(roundTrip('phone', { phone: '+995 (555) 123-456' }), 'tel:+995555123456');
});

test('SMS codes include an encoded body when given', () => {
  assert.equal(roundTrip('sms', { smsPhone: '+15551234567', smsBody: 'On my way!' }), 'sms:+15551234567?body=On%20my%20way!');
  assert.equal(roundTrip('sms', { smsPhone: '+15551234567' }), 'sms:+15551234567');
});

test('Wi-Fi codes follow the WIFI: format and escape special characters', () => {
  const value = roundTrip('wifi', { ssid: 'My;Net', wifiPassword: 'pa:ss,word1', security: 'WPA', hidden: true });
  assert.equal(value, 'WIFI:T:WPA;S:My\\;Net;P:pa\\:ss\\,word1;H:true;;');
});

test('open Wi-Fi networks omit the password', () => {
  assert.equal(roundTrip('wifi', { ssid: 'Cafe', wifiPassword: 'ignored', security: 'nopass' }), 'WIFI:T:nopass;S:Cafe;;');
});

test('every error correction level produces a decodable code', () => {
  for (const level of ['L', 'M', 'Q', 'H']) {
    assert.equal(decode(createMatrix('level test', level)), 'level test');
  }
});

test('very long input is rejected with a helpful error', () => {
  assert.throws(() => createMatrix('x'.repeat(5000)), QrError);
  assert.throws(() => createMatrix('x'.repeat(3500), 'H'), /too long/);
});

test('large but valid input still works', () => {
  const text = 'a'.repeat(1000);
  assert.equal(decode(createMatrix(text, 'L')), text);
});

test('empty input is rejected', () => {
  assert.throws(() => createMatrix(''), QrError);
});
