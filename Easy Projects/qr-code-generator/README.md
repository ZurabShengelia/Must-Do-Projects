# qr-code-generator

A QR code generator that runs entirely in your browser. Pick a type, fill in the details, and download a PNG or SVG. Nothing is sent anywhere.

Project #4 in the Must Do Projects portfolio.

## Features

- Six content types: website, plain text, email (with subject and message), phone number, SMS (with message), and Wi-Fi (SSID, password, security type, hidden network).
- Live preview that updates as you type, with an empty state and clear validation messages.
- Customization: code color, background color, size, margin, and error correction level, with a reset button.
- Blocks color choices that scanners usually cannot read (low contrast or inverted colors).
- PNG and SVG downloads with meaningful file names, plus copy of the encoded content.
- Keyboard accessible, visible focus states, reduced-motion support, responsive layout.

## Screenshots

Screenshots have not been captured yet. Add them to a `docs/` folder and link them here.

## Technology stack

- HTML5, CSS3, and vanilla JavaScript (ES modules). No framework, no build step.
- [qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator) 2.0.4 by Kazuhiko Arase, MIT license. Two of its files are copied into `js/vendor/` so the app works without a bundler.
- Dev only: Node's built-in test runner, [jsdom](https://github.com/jsdom/jsdom) (MIT) for DOM tests, and [jsQR](https://github.com/cozmo/jsQR) (Apache-2.0) to decode generated codes in tests.
- Fonts are system fonts. No font files or icon libraries are downloaded. Icons are inline SVG.

## Installation and development

Requires Node.js 20 or newer for the tests. The app itself needs only a static file server, because browsers do not load ES modules from `file://`.

```bash
npm install
python3 -m http.server 8080   # or: npx serve .
```

Open http://localhost:8080.

To refresh the vendored library after upgrading it: `npm run vendor`.

## Testing

```bash
npm test
```

The tests cover payload formats for every type, validation, decoding generated codes with jsQR, customization and reset, SVG validity, PNG export (with a stubbed canvas), filenames, and the UI behavior in jsdom.

## Project structure

```
index.html            page markup and Content Security Policy
css/styles.css        design tokens and layout
js/main.js            entry point
js/app.js             DOM wiring and rendering
js/qr-generator.js    QR matrix, SVG output, settings, color checks
js/validation.js      per-type validation and payload formats
js/downloads.js       PNG and SVG export, filenames, saving
js/vendor/            qrcode-generator (MIT), unmodified
scripts/vendor.mjs    copies the library into js/vendor/
tests/                automated tests
```

## Privacy and security

- All encoding happens on your device. The Content Security Policy sets `connect-src 'none'`, so the page cannot make network requests.
- No cookies, storage, analytics, or accounts. Entered values are never saved, including Wi-Fi passwords.
- User input is rendered with `textContent` and a parsed SVG, never with `innerHTML`. Only `http` and `https` addresses are accepted for website codes.
- A Wi-Fi code contains the password as plain text. Anyone who scans it can read it.

## Limitations

- Tests do not run in a real browser. The PNG export is tested with a stubbed canvas, and the layout and downloads were not checked on real devices.
- Codes are checked by a software decoder, not by physical phone scans.
- Maximum content length is about 4,000 characters, and less at higher error correction levels.
- No logos or custom dot shapes.

## License

MIT. See `LICENSE`. The bundled qrcode-generator library is MIT licensed by Kazuhiko Arase; its notice is kept in the vendored files. "QR Code" is a registered trademark of DENSO WAVE INCORPORATED.
