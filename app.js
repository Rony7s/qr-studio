/*
 * app.js
 * ------
 * UI logic for QR Studio: form, styling, logo upload, preview,
 * download, scanner, theme. Content encoding lives in content.js.
 */
(function () {
  'use strict';

  const $ = (id) => document.getElementById(id);

  // ---------------------------------------------------------------
  // Small helpers
  // ---------------------------------------------------------------

  // Little pop-up message at the bottom of the screen.
  function showToast(message) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('show');
    clearTimeout(showToast.timeoutId);
    showToast.timeoutId = setTimeout(() => el.classList.remove('show'), 2500);
  }

  // LocalStorage can throw (private mode, quota), so every access is wrapped.
  const storage = {
    get(key, fallback) {
      try { return JSON.parse(localStorage.getItem('qrs.' + key)) ?? fallback; }
      catch { return fallback; }
    },
    set(key, value) {
      try { localStorage.setItem('qrs.' + key, JSON.stringify(value)); } catch { /* ignore */ }
    }
  };

  // ---------------------------------------------------------------
  // State
  // ---------------------------------------------------------------

  const DEFAULT_STYLE = { dots: 'square', eye: 'square', fg: '#4f46e5', bg: '#ffffff', fg2: '#9333ea', grad: false, margin: 16 };

  const PRESETS = {
    'Minimal':         { fg: '#000000', bg: '#ffffff', dots: 'square', eye: 'square', grad: false },
    'Business':        { fg: '#1e3a5f', bg: '#ffffff', dots: 'rounded', eye: 'extra-rounded', grad: false },
    'Purple gradient': { fg: '#4f46e5', fg2: '#9333ea', bg: '#ffffff', dots: 'dots', eye: 'extra-rounded', grad: true },
    'Classroom':       { fg: '#0f5132', bg: '#fffbea', dots: 'rounded', eye: 'dot', grad: false },
    'Monochrome':      { fg: '#222222', bg: '#f2f2f2', dots: 'classy', eye: 'square', grad: false }
  };

  const style = Object.assign({}, DEFAULT_STYLE, storage.get('style', {}));
  const formValues = {};   // what the user typed, keyed by field id
  let logoImage = null;    // the uploaded <img>, or null
  let logoObjectUrl = null;
  let qrCode = null;       // the QRCodeStyling instance shown in the preview
  let currentData = null;  // the encoded string, or null if input is invalid
  let updateTimer;

  // ---------------------------------------------------------------
  // Theme + saved data
  // ---------------------------------------------------------------

  const prefs = storage.get('prefs', {});
  const prefersDark = matchMedia('(prefers-color-scheme: dark)').matches;
  document.documentElement.dataset.theme = prefs.theme || (prefersDark ? 'dark' : 'light');

  $('themeBtn').onclick = () => {
    const next = document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark';
    document.documentElement.dataset.theme = next;
    prefs.theme = next;
    storage.set('prefs', prefs);
  };

  $('clearData').onclick = () => {
    if (!confirm('Clear saved theme and style preferences?')) return;
    try {
      Object.keys(localStorage).filter((k) => k.startsWith('qrs.')).forEach((k) => localStorage.removeItem(k));
    } catch { /* ignore */ }
    showToast('Saved data cleared');
  };

  // ---------------------------------------------------------------
  // Tabs (Create / Scan)
  // ---------------------------------------------------------------

  document.querySelectorAll('[role=tab]').forEach((tab) => {
    tab.onclick = () => {
      document.querySelectorAll('[role=tab]').forEach((t) => t.setAttribute('aria-selected', t === tab));
      $('view-gen').hidden = tab.dataset.view !== 'gen';
      $('view-scan').hidden = tab.dataset.view !== 'scan';
      // Switch away from the scanner = turn the camera off.
      if (tab.dataset.view !== 'scan') stopScanner();
    };
  });

  // ---------------------------------------------------------------
  // Content form
  // ---------------------------------------------------------------

  // Build the input fields for the selected content type.
  // textContent / createElement are used (never innerHTML) so typed
  // text can never be run as HTML.
  function renderFields() {
    const container = $('fields');
    container.textContent = '';

    FIELDS[$('type').value].forEach((field) => {
      const label = document.createElement('label');
      label.htmlFor = 'f_' + field.id;
      label.textContent = field.label + (field.req ? ' *' : '');

      let input;
      if (field.opts) {
        input = document.createElement('select');
        field.opts.forEach((o) => input.add(new Option(o, o)));
      } else if (field.area) {
        input = document.createElement('textarea');
        input.rows = 4;
        input.maxLength = 1500;
      } else {
        input = document.createElement('input');
        input.type = field.type || 'text';
      }

      input.id = 'f_' + field.id;
      if (field.ph) input.placeholder = field.ph;
      if (formValues[field.id] && !field.opts) input.value = formValues[field.id];

      input.oninput = input.onchange = () => {
        formValues[field.id] = input.value;
        scheduleUpdate();
      };
      container.append(label, input);
    });

    $('filename').value = 'qr-studio-' + $('type').value;
  }

  function clearForm() {
    Object.keys(formValues).forEach((k) => delete formValues[k]);
    renderFields();
    scheduleUpdate();
  }

  $('type').onchange = clearForm;
  $('resetBtn').onclick = clearForm;

  $('pasteBtn').onclick = async () => {
    try {
      const text = await navigator.clipboard.readText();
      const firstField = document.querySelector('#fields input, #fields textarea');
      if (firstField) {
        firstField.value = text;
        firstField.dispatchEvent(new Event('input'));
      }
    } catch {
      showToast('Clipboard access was blocked. Paste with Ctrl+V instead.');
    }
  };

  // ---------------------------------------------------------------
  // Style controls
  // ---------------------------------------------------------------

  // Push the style object back into the controls (used on load and after presets).
  function syncControls() {
    ['dots', 'eye', 'fg', 'bg', 'fg2', 'margin'].forEach((k) => { $(k).value = style[k]; });
    $('grad').checked = style.grad;
    $('gradRow').hidden = !style.grad;
    $('marginOut').textContent = style.margin;
  }

  function styleChanged() {
    storage.set('style', style);
    scheduleUpdate();
  }

  ['dots', 'eye', 'fg', 'bg', 'fg2'].forEach((key) => {
    $(key).oninput = () => { style[key] = $(key).value; styleChanged(); };
  });

  $('grad').onchange = () => {
    style.grad = $('grad').checked;
    $('gradRow').hidden = !style.grad;
    styleChanged();
  };

  $('margin').oninput = () => {
    style.margin = +$('margin').value;
    $('marginOut').textContent = style.margin;
    styleChanged();
  };

  $('transp').onchange = scheduleUpdate;

  $('defaultsBtn').onclick = () => {
    Object.assign(style, DEFAULT_STYLE);
    syncControls();
    styleChanged();
  };

  Object.entries(PRESETS).forEach(([name, preset]) => {
    const button = document.createElement('button');
    button.textContent = name;
    button.onclick = () => {
      Object.assign(style, DEFAULT_STYLE, preset);
      syncControls();
      styleChanged();
    };
    $('presets').append(button);
  });

  // WCAG relative luminance, used to estimate contrast.
  function luminance(hex) {
    const [r, g, b] = [1, 3, 5]
      .map((i) => parseInt(hex.substr(i, 2), 16) / 255)
      .map((v) => (v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4)));
    return 0.2126 * r + 0.7152 * g + 0.0722 * b;
  }

  // Scanners need a dark code on a light background with decent contrast.
  function checkContrast() {
    const fg = luminance(style.fg);
    const bg = luminance(style.bg);
    const ratio = (Math.max(fg, bg) + 0.05) / (Math.min(fg, bg) + 0.05);

    let message = '';
    if (fg > bg) message = 'Foreground is lighter than the background. Many scanners cannot read inverted codes.';
    else if (ratio < 3) message = 'Low contrast (' + ratio.toFixed(1) + ':1). This code may not scan reliably.';

    $('warn').hidden = !message;
    $('warn').textContent = message;
  }

  // ---------------------------------------------------------------
  // Logo upload
  // ---------------------------------------------------------------

  const MAX_LOGO_BYTES = 2 * 1024 * 1024;
  const ALLOWED_TYPES = ['image/png', 'image/jpeg', 'image/webp'];

  function loadLogoFile(file) {
    $('fileErr').textContent = '';
    if (!file) return;

    if (!ALLOWED_TYPES.includes(file.type)) {
      $('fileErr').textContent = 'Use a PNG, JPG or WebP image.';
      return;
    }
    if (file.size > MAX_LOGO_BYTES) {
      $('fileErr').textContent = 'Image is larger than 2 MB. Choose a smaller file.';
      return;
    }

    // Object URLs keep the image in the browser; nothing is uploaded anywhere.
    const url = URL.createObjectURL(file);
    const img = new Image();

    img.onload = () => {
      if (img.width < 48 || img.height < 48) {
        URL.revokeObjectURL(url);
        $('fileErr').textContent = 'Image is too small. Use at least 48×48 px.';
        return;
      }
      if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl); // free the old one
      logoObjectUrl = url;
      logoImage = img;
      $('logoPrev').src = url;
      $('logoCtl').hidden = false;
      scheduleUpdate();
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      $('fileErr').textContent = 'This image could not be read. It may be corrupted.';
    };
    img.src = url;
  }

  $('drop').onclick = () => $('file').click();
  $('drop').onkeydown = (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('file').click(); }
  };
  $('file').onchange = (e) => { loadLogoFile(e.target.files[0]); e.target.value = ''; };
  $('drop').ondragover = (e) => { e.preventDefault(); $('drop').classList.add('over'); };
  $('drop').ondragleave = () => $('drop').classList.remove('over');
  $('drop').ondrop = (e) => {
    e.preventDefault();
    $('drop').classList.remove('over');
    loadLogoFile(e.dataTransfer.files[0]);
  };

  $('logoRemove').onclick = () => {
    if (logoObjectUrl) URL.revokeObjectURL(logoObjectUrl);
    logoObjectUrl = logoImage = null;
    $('logoCtl').hidden = true;
    scheduleUpdate();
  };

  ['lsize', 'lpad'].forEach((id) => {
    $(id).oninput = () => { $(id + 'Out').textContent = $(id).value; scheduleUpdate(); };
  });
  ['lshape', 'lbg', 'lborder', 'lbc'].forEach((id) => { $(id).onchange = $(id).oninput = scheduleUpdate; });

  /*
   * Draw the logo onto a square canvas with the chosen shape, background,
   * border and padding, and return it as a PNG data URL.
   * The image is scaled to fit (not stretched) so it never gets distorted.
   */
  function buildLogoImage() {
    const SIZE = 256;
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = SIZE;
    const ctx = canvas.getContext('2d');

    const shape = $('lshape').value;
    const radius = shape === 'circle' ? SIZE / 2 : shape === 'rounded' ? SIZE * 0.22 : 0;
    const outline = () => {
      ctx.beginPath();
      if (ctx.roundRect) ctx.roundRect(0, 0, SIZE, SIZE, radius);
      else ctx.rect(0, 0, SIZE, SIZE); // very old browsers: fall back to square
    };

    outline();
    ctx.save();
    ctx.clip();
    if ($('lbg').checked) { ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, SIZE, SIZE); }

    const padding = SIZE * (+$('lpad').value / 100);
    const box = SIZE - padding * 2;
    const scale = Math.min(box / logoImage.width, box / logoImage.height);
    const w = logoImage.width * scale;
    const h = logoImage.height * scale;
    ctx.drawImage(logoImage, (SIZE - w) / 2, (SIZE - h) / 2, w, h);
    ctx.restore();

    if ($('lborder').checked) {
      outline();
      ctx.lineWidth = SIZE * 0.04;
      ctx.strokeStyle = $('lbc').value;
      ctx.stroke();
    }
    return canvas.toDataURL('image/png');
  }

  // ---------------------------------------------------------------
  // QR generation
  // ---------------------------------------------------------------

  // Build the qr-code-styling options from the current settings.
  function buildOptions(data, size) {
    const hasLogo = !!logoImage;
    const dotColor = style.grad
      ? { gradient: { type: 'linear', rotation: Math.PI / 4,
          colorStops: [{ offset: 0, color: style.fg }, { offset: 1, color: style.fg2 }] } }
      : { color: style.fg };

    return {
      width: size,
      height: size,
      type: 'canvas',
      data,
      margin: Math.max(style.margin, 8), // never drop below a safe quiet zone
      // Level H can lose ~30% of the code and still scan, which is what a logo needs.
      qrOptions: { errorCorrectionLevel: hasLogo ? 'H' : 'M' },
      image: hasLogo ? buildLogoImage() : undefined,
      imageOptions: { hideBackgroundDots: true, imageSize: hasLogo ? +$('lsize').value / 100 : 0.2, margin: 4, crossOrigin: 'anonymous' },
      dotsOptions: Object.assign({ type: style.dots }, dotColor),
      cornersSquareOptions: { type: style.eye, color: style.fg },
      cornersDotOptions: { type: style.eye === 'square' ? 'square' : 'dot', color: style.fg },
      backgroundOptions: { color: $('transp').checked ? 'transparent' : style.bg }
    };
  }

  // Wait a moment after the last change so we don't redraw on every keystroke.
  function scheduleUpdate() {
    clearTimeout(updateTimer);
    updateTimer = setTimeout(updatePreview, 200);
  }

  function updatePreview() {
    checkContrast();

    const type = $('type').value;
    const result = encodeContent(type, formValues);
    const isValid = !!result.data;

    $('err').textContent = result.error || '';
    currentData = isValid ? result.data : null;
    $('empty').hidden = isValid;
    $('qr').hidden = !isValid;
    $('dl').disabled = !isValid;
    $('summary').textContent = isValid
      ? $('type').selectedOptions[0].text + ' · ' + result.data.length + ' characters encoded'
      : '';
    if (!isValid) return;

    try {
      const options = buildOptions(result.data, 320);
      if (!qrCode) { qrCode = new QRCodeStyling(options); qrCode.append($('qr')); }
      else qrCode.update(options);
    } catch (error) {
      $('err').textContent = 'QR generation failed: ' + error.message;
    }
  }

  // ---------------------------------------------------------------
  // Download
  // ---------------------------------------------------------------

  $('dl').onclick = async () => {
    if (!currentData) return;
    // Strip anything odd from the filename.
    const name = ($('filename').value || 'qr-studio').replace(/[^\w.-]+/g, '-').slice(0, 60);
    const format = $('fmt').value;
    try {
      // A separate instance at full size, so the on-screen preview stays small.
      const exportQr = new QRCodeStyling(buildOptions(currentData, +$('size').value));
      exportQr.update({ type: format === 'svg' ? 'svg' : 'canvas' });
      await exportQr.download({ name, extension: format });
      showToast('Download started');
    } catch (error) {
      showToast('Download failed: ' + error.message);
    }
  };

  // ---------------------------------------------------------------
  // Scanner
  // ---------------------------------------------------------------

  let scanner = null;

  function showScanResult(text) {
    $('result').hidden = false;
    $('resText').value = text; // .value, so scanned text is never parsed as HTML
    $('openRes').hidden = !isUrl(text);
  }

  async function stopScanner() {
    if (scanner) {
      try { if (scanner.isScanning) await scanner.stop(); } catch { /* already stopped */ }
    }
    $('startScan').disabled = false;
    $('stopScan').disabled = true;
  }

  // Camera permission is only requested here, when the user clicks Start.
  $('startScan').onclick = async () => {
    $('scanErr').textContent = '';
    try {
      scanner = scanner || new Html5Qrcode('reader');
      const cameras = await Html5Qrcode.getCameras();
      if (!cameras.length) throw new Error('No camera found.');

      if (!$('cams').options.length) {
        cameras.forEach((cam, i) => $('cams').add(new Option(cam.label || 'Camera ' + (i + 1), cam.id)));
      }
      await scanner.start(
        $('cams').value || cameras[0].id,
        { fps: 10, qrbox: 240 },
        (text) => { showScanResult(text); stopScanner(); },
        () => { /* called on every frame without a code; ignore */ }
      );
      $('startScan').disabled = true;
      $('stopScan').disabled = false;
    } catch (error) {
      const denied = /Permission|NotAllowed/i.test(String(error));
      $('scanErr').textContent = denied
        ? 'Camera permission was denied. Allow camera access in your browser settings, or scan an image instead.'
        : 'Could not start the camera: ' + (error.message || error) + ' (the camera needs HTTPS or localhost).';
    }
  };

  $('stopScan').onclick = stopScanner;

  $('scanFile').onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    $('scanErr').textContent = '';
    try {
      scanner = scanner || new Html5Qrcode('reader');
      showScanResult(await scanner.scanFile(file, false));
    } catch {
      $('scanErr').textContent = 'No QR code was found in that image.';
    }
    e.target.value = '';
  };

  $('copyRes').onclick = async () => {
    try {
      await navigator.clipboard.writeText($('resText').value);
      showToast('Copied');
    } catch {
      showToast('Copy failed. Select the text and copy it manually.');
    }
  };

  // Never open a scanned link silently: always ask first.
  $('openRes').onclick = () => {
    const url = $('resText').value;
    if (isUrl(url) && confirm('Open this link?\n\n' + url + '\n\nOnly continue if you trust it.')) {
      window.open(url, '_blank', 'noopener,noreferrer');
    }
  };

  // ---------------------------------------------------------------
  // Start
  // ---------------------------------------------------------------
  syncControls();
  renderFields();
  updatePreview();
})();
