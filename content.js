/*
 * content.js
 * ----------
 * Everything about *what* goes inside the QR code:
 *   - which input fields each content type needs
 *   - validating those fields
 *   - turning them into the exact string a phone expects to read
 */

// Field definitions per content type. The form in the page is built from this,
// so adding a new type later only means adding an entry here and a case below.
const FIELDS = {
  url:   [{ id: 'v', label: 'Website URL', type: 'url', ph: 'https://example.com', req: true }],
  text:  [{ id: 'v', label: 'Text', area: true, req: true }],
  email: [{ id: 'v', label: 'Email address', type: 'email', req: true },
          { id: 'subject', label: 'Subject (optional)' }],
  phone: [{ id: 'v', label: 'Phone number', type: 'tel', ph: '+8801700000000', req: true }],
  sms:   [{ id: 'v', label: 'Phone number', type: 'tel', req: true },
          { id: 'msg', label: 'Message', area: true }],
  wifi:  [{ id: 'ssid', label: 'Network name (SSID)', req: true },
          { id: 'pass', label: 'Password' },
          { id: 'enc', label: 'Encryption', opts: ['WPA', 'WEP', 'nopass'] }],
  vcard: [{ id: 'name', label: 'Full name', req: true },
          { id: 'org', label: 'Organization' },
          { id: 'tel', label: 'Phone', type: 'tel' },
          { id: 'mail', label: 'Email', type: 'email' },
          { id: 'web', label: 'Website', type: 'url' }],
  geo:   [{ id: 'v', label: 'Maps URL or "lat,lng"', ph: '23.8103,90.4125', req: true }]
};

// --- small validators ------------------------------------------------------

const isEmail = (s) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
const isPhone = (s) => /^\+?[0-9 ()-]{5,20}$/.test(s);

// Only http(s) links count. This also blocks things like "javascript:..."
function isUrl(s) {
  try {
    const u = new URL(s);
    return u.protocol === 'http:' || u.protocol === 'https:';
  } catch {
    return false;
  }
}

// Wi-Fi format reserves  \ ; , : "  so they must be escaped with a backslash.
const escapeWifi = (s) => s.replace(/([\\;,:"])/g, '\\$1');

// vCard reserves  \ ; ,  and newlines.
const escapeVcard = (s) => s.replace(/([\\;,])/g, '\\$1').replace(/\n/g, '\\n');

/*
 * Main entry point.
 * Returns { data } when the input is valid,
 * or { error } when it is not. An empty error string means
 * "user hasn't finished typing yet", so the UI stays quiet.
 */
function encodeContent(type, values) {
  const get = (key) => (values[key] || '').trim();

  // Required fields first: no point validating half-empty forms.
  for (const field of FIELDS[type]) {
    if (field.req && !get(field.id)) return { error: '' };
  }

  switch (type) {
    case 'url':
      return isUrl(get('v'))
        ? { data: get('v') }
        : { error: 'Enter a full URL starting with http:// or https://' };

    case 'text':
      // Keep the original text untouched (including line breaks).
      return { data: values.v };

    case 'email': {
      if (!isEmail(get('v'))) return { error: 'Enter a valid email address.' };
      const subject = get('subject') ? '?subject=' + encodeURIComponent(get('subject')) : '';
      return { data: 'mailto:' + get('v') + subject };
    }

    case 'phone':
      if (!isPhone(get('v'))) return { error: 'Enter a valid phone number.' };
      return { data: 'tel:' + get('v').replace(/[ ()-]/g, '') };

    case 'sms':
      if (!isPhone(get('v'))) return { error: 'Enter a valid phone number.' };
      return { data: 'SMSTO:' + get('v').replace(/[ ()-]/g, '') + ':' + get('msg') };

    case 'wifi': {
      const enc = get('enc') || 'WPA';
      if (enc !== 'nopass' && !get('pass')) {
        return { error: 'Enter the Wi-Fi password, or choose "nopass".' };
      }
      const pass = enc === 'nopass' ? '' : escapeWifi(get('pass'));
      return { data: `WIFI:T:${enc};S:${escapeWifi(get('ssid'))};P:${pass};;` };
    }

    case 'vcard': {
      // These three are optional, but if filled in they must be valid.
      if (get('mail') && !isEmail(get('mail'))) return { error: 'Enter a valid email address.' };
      if (get('web') && !isUrl(get('web'))) return { error: 'Website must start with http:// or https://' };
      if (get('tel') && !isPhone(get('tel'))) return { error: 'Enter a valid phone number.' };

      const lines = [
        'BEGIN:VCARD',
        'VERSION:3.0',
        'FN:' + escapeVcard(get('name')),
        get('org') && 'ORG:' + escapeVcard(get('org')),
        get('tel') && 'TEL:' + get('tel'),
        get('mail') && 'EMAIL:' + get('mail'),
        get('web') && 'URL:' + get('web'),
        'END:VCARD'
      ];
      return { data: lines.filter(Boolean).join('\n') };
    }

    case 'geo': {
      const input = get('v');
      if (isUrl(input)) return { data: input };
      // Plain "lat,lng" gets turned into a Google Maps link.
      if (/^-?\d{1,2}(\.\d+)?\s*,\s*-?\d{1,3}(\.\d+)?$/.test(input)) {
        return { data: 'https://www.google.com/maps?q=' + input.replace(/\s/g, '') };
      }
      return { error: 'Enter a Maps URL or coordinates like 23.81,90.41' };
    }
  }
}
