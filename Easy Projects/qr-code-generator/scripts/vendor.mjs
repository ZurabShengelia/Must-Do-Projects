import { copyFileSync } from 'node:fs';

const source = 'node_modules/qrcode-generator/dist';
copyFileSync(`${source}/qrcode.mjs`, 'js/vendor/qrcode.mjs');
copyFileSync(`${source}/qrcode_UTF8.mjs`, 'js/vendor/qrcode_utf8.mjs');
