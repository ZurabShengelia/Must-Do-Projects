const fail = (error) => ({ ok: false, empty: false, error });
const ok = (value, label) => ({ ok: true, empty: false, value, label });
const EMPTY = Object.freeze({ ok: false, empty: true, error: '' });

const EMAIL_PATTERN = /^[^\s@,;]+@[^\s@,;]+\.[^\s@,;]+$/;
const BLOCKED_SCHEME = /^(javascript|data|vbscript|file|blob):/i;
const SCHEME_WITH_SLASHES = /^[a-z][a-z0-9+.-]*:\/\//i;
const HTTP_URL = /^https?:\/\//i;

export function validateUrl(raw) {
  const input = raw.trim();
  if (!input) return EMPTY;
  if (/\s/.test(input)) return fail('Web addresses cannot contain spaces.');
  if ((BLOCKED_SCHEME.test(input) || SCHEME_WITH_SLASHES.test(input)) && !HTTP_URL.test(input)) {
    return fail('Only http:// and https:// addresses are supported.');
  }

  const candidate = HTTP_URL.test(input) ? input : `https://${input}`;
  let url;
  try {
    url = new URL(candidate);
  } catch {
    return fail('That does not look like a valid web address. Try something like example.com.');
  }
  if (!url.hostname.includes('.') && url.hostname !== 'localhost') {
    return fail('That does not look like a valid web address. Try something like example.com.');
  }
  return ok(candidate, url.hostname);
}

export function validateText(raw) {
  if (!raw.trim()) return EMPTY;
  return ok(raw, raw.trim().slice(0, 24));
}

export function validateEmailAddress(raw) {
  const input = raw.trim();
  if (!input) return EMPTY;
  if (!EMAIL_PATTERN.test(input)) return fail('Enter an email address like name@example.com.');
  return ok(input, input);
}

export function validatePhone(raw) {
  const input = raw.trim();
  if (!input) return EMPTY;
  const digits = input.replace(/[\s().-]/g, '');
  if (!/^\+?\d{5,15}$/.test(digits)) {
    return fail('Enter a phone number with 5 to 15 digits. Start with + for an international number.');
  }
  return ok(digits, digits);
}

const withQuery = (base, params) => {
  const query = Object.entries(params)
    .filter(([, value]) => value)
    .map(([key, value]) => `${key}=${encodeURIComponent(value)}`)
    .join('&');
  return query ? `${base}?${query}` : base;
};

const escapeWifi = (value) => value.replace(/([\\;,:"])/g, '\\$1');

function buildEmail({ emailAddress = '', emailSubject = '', emailBody = '' }) {
  const address = validateEmailAddress(emailAddress);
  if (!address.ok) return address;
  return ok(withQuery(`mailto:${address.value}`, { subject: emailSubject, body: emailBody }), address.value);
}

function buildPhone({ phone = '' }) {
  const result = validatePhone(phone);
  return result.ok ? ok(`tel:${result.value}`, result.label) : result;
}

function buildSms({ smsPhone = '', smsBody = '' }) {
  const result = validatePhone(smsPhone);
  if (!result.ok) return result;
  return ok(withQuery(`sms:${result.value}`, { body: smsBody }), result.label);
}

function buildWifi({ ssid = '', wifiPassword = '', security = 'WPA', hidden = false }) {
  if (!ssid) return EMPTY;
  if (ssid.length > 32) return fail('Network names can be at most 32 characters.');
  if (!['WPA', 'WEP', 'nopass'].includes(security)) return fail('Choose a security type.');
  if (security === 'WPA' && (wifiPassword.length < 8 || wifiPassword.length > 63)) {
    return fail('WPA passwords must be 8 to 63 characters long.');
  }
  if (security === 'WEP' && !wifiPassword) return fail('Enter the network password.');

  const password = security === 'nopass' ? '' : `P:${escapeWifi(wifiPassword)};`;
  const hiddenFlag = hidden ? 'H:true;' : '';
  return ok(`WIFI:T:${security};S:${escapeWifi(ssid)};${password}${hiddenFlag};`, ssid);
}

const builders = {
  url: ({ url = '' }) => validateUrl(url),
  text: ({ text = '' }) => validateText(text),
  email: buildEmail,
  phone: buildPhone,
  sms: buildSms,
  wifi: buildWifi,
};

export const QR_TYPES = Object.keys(builders);

export function buildPayload(type, fields) {
  const builder = builders[type];
  if (!builder) return fail('Unknown QR code type.');
  return builder(fields);
}
