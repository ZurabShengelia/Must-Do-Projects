import { DEFAULTS, QrError, checkColors, createMatrix, normalizeSettings, toSvg } from './qr-generator.js';
import { buildPayload } from './validation.js';
import { buildFilename, pngDimension, renderPng, saveBlob, svgBlob } from './downloads.js';

const STATUS_TIMEOUT_MS = 4000;

export function initApp(doc) {
  const $ = (id) => doc.getElementById(id);
  const form = $('qr-form');
  const panels = [...doc.querySelectorAll('[data-panel]')];
  const els = {
    preview: $('preview'),
    empty: $('empty'),
    error: $('error'),
    meta: $('meta'),
    status: $('status'),
    foreground: $('foreground'),
    background: $('background'),
    size: $('size'),
    margin: $('margin'),
    level: $('level'),
    sizeOutput: $('size-output'),
    marginOutput: $('margin-output'),
    actions: ['download-png', 'download-svg', 'copy-content'].map($),
  };
  const parser = new doc.defaultView.DOMParser();
  let current = null;
  let statusTimer = 0;

  const selectedType = () => form.elements.type.value;
  const activePanel = () => panels.find((panel) => panel.dataset.panel === selectedType());

  function readFields() {
    const fields = {};
    for (const input of activePanel().querySelectorAll('[name]')) {
      fields[input.name] = input.type === 'checkbox' ? input.checked : input.value;
    }
    return fields;
  }

  const readSettings = () =>
    normalizeSettings({
      foreground: els.foreground.value,
      background: els.background.value,
      size: els.size.value,
      margin: els.margin.value,
      level: els.level.value,
    });

  function writeSettings(settings) {
    els.foreground.value = settings.foreground;
    els.background.value = settings.background;
    els.size.value = settings.size;
    els.margin.value = settings.margin;
    els.level.value = settings.level;
  }

  function show(state, message = '') {
    els.empty.hidden = state !== 'empty';
    els.error.hidden = state !== 'error';
    els.preview.hidden = state !== 'ready';
    els.meta.hidden = state !== 'ready';
    els.error.textContent = message;
    for (const button of els.actions) button.disabled = state !== 'ready';
    if (state !== 'ready') {
      current = null;
      els.preview.replaceChildren();
    }
  }

  function announce(message, kind = 'info') {
    clearTimeout(statusTimer);
    els.status.textContent = message;
    els.status.dataset.kind = kind;
    statusTimer = setTimeout(() => {
      els.status.textContent = '';
    }, STATUS_TIMEOUT_MS);
  }

  function render() {
    els.sizeOutput.textContent = els.size.value;
    els.marginOutput.textContent = els.margin.value;

    const type = selectedType();
    const payload = buildPayload(type, readFields());
    if (!payload.ok) {
      return payload.empty ? show('empty') : show('error', payload.error);
    }

    const settings = readSettings();
    const colorProblem = checkColors(settings.foreground, settings.background);
    if (colorProblem) return show('error', colorProblem);

    let matrix;
    try {
      matrix = createMatrix(payload.value, settings.level);
    } catch (error) {
      if (error instanceof QrError) return show('error', error.message);
      throw error;
    }

    current = { type, payload, matrix, settings };
    show('ready');
    const svg = parser.parseFromString(toSvg(matrix, settings), 'image/svg+xml').documentElement;
    els.preview.replaceChildren(doc.importNode(svg, true));
    els.preview.setAttribute('aria-label', `QR code for ${type}: ${payload.label}`);
    els.meta.textContent =
      `${payload.value.length} characters encoded. PNG downloads at ` +
      `${pngDimension(matrix, settings)} px square.`;
  }

  async function download(format) {
    if (!current) return;
    const { type, payload, matrix, settings } = current;
    const filename = buildFilename(type, payload.label, format);
    try {
      const blob = format === 'svg' ? svgBlob(matrix, settings) : await renderPng(matrix, settings);
      saveBlob(blob, filename, doc);
      announce(`Saved ${filename}`);
    } catch {
      announce('The download failed. Try again or use the other format.', 'error');
    }
  }

  async function copyContent() {
    if (!current) return;
    try {
      await doc.defaultView.navigator.clipboard.writeText(current.payload.value);
      announce('Copied the QR content to your clipboard.');
    } catch {
      announce('Your browser blocked copying. Select the text in the form instead.', 'error');
    }
  }

  form.addEventListener('submit', (event) => event.preventDefault());
  form.addEventListener('input', render);
  form.addEventListener('change', (event) => {
    if (event.target.name === 'type') {
      for (const panel of panels) panel.hidden = panel.dataset.panel !== selectedType();
    }
    render();
  });

  $('clear-input').addEventListener('click', () => {
    for (const input of activePanel().querySelectorAll('[name]')) {
      if (input.type === 'checkbox') input.checked = false;
      else if (input.tagName === 'SELECT') input.selectedIndex = 0;
      else input.value = '';
    }
    render();
    activePanel().querySelector('[name]').focus();
  });

  $('reset-settings').addEventListener('click', () => {
    writeSettings(DEFAULTS);
    render();
    announce('Appearance reset to the defaults.');
  });

  $('download-png').addEventListener('click', () => download('png'));
  $('download-svg').addEventListener('click', () => download('svg'));
  $('copy-content').addEventListener('click', copyContent);

  render();
}
