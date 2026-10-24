<div align="center">

# QR Studio

**Create, style and scan QR codes, right in your browser.**

No sign-up. No server. Nothing you type or upload ever leaves your device.

[**Live demo**](https://rony7s.github.io/qr-studio/) · [Report a bug](https://github.com/rony7s/qr-studio/issues)

![HTML5](https://img.shields.io/badge/HTML5-e34f26?logo=html5&logoColor=white)
![CSS3](https://img.shields.io/badge/CSS3-1572b6?logo=css3&logoColor=white)
![JavaScript](https://img.shields.io/badge/JavaScript-f7df1e?logo=javascript&logoColor=black)

</div>

---

## Why I built this

Most free QR generators want an account, add watermarks, or send your data to a server. I wanted one that is fast, private and lets me put my own logo in the middle without breaking the code. QR Studio is a plain HTML/CSS/JS project with no build step.

## Features

- **8 content types:** website, text, email, phone, SMS, Wi-Fi, contact card (vCard) and map location, each validated and encoded in the format phones expect
- **Live preview** that updates as you type
- **Custom look:** module shapes, finder-eye shapes, colors, optional gradient, quiet-zone control, transparent background, and style presets
- **Contrast warnings** when a color combination might not scan
- **Center logo:** drag and drop a PNG, JPG or WebP, then choose size, shape, background, border and padding. Error correction switches to level H automatically
- **Export** as PNG or SVG at 256, 512, 1024 or 2048 px with your own file name
- **Scanner:** read codes with your camera or from an image. Links are never opened without asking you first
- **Dark mode** and locally saved style preferences

## Tech

| Part | What I used |
|---|---|
| Structure, styling, logic | HTML5, CSS3, vanilla JavaScript (ES6+) |
| QR generation and export | [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) |
| Scanning | [html5-qrcode](https://github.com/mebjas/html5-qrcode) |
| Logo shaping | Canvas API |

## Run it locally

```bash
git clone https://github.com/rony7s/qr-studio.git
cd qr-studio
python3 -m http.server 8000
```

Open http://localhost:8000. You can also open `index.html` directly, but the camera scanner needs HTTPS or localhost.

## Deploy to GitHub Pages

1. Push the project to a GitHub repository named `qr-studio`.
2. Go to **Settings → Pages**.
3. Under **Build and deployment**, choose **Deploy from a branch**, then select `main` and `/ (root)`.
4. After a minute your site is live at `https://rony7s.github.io/qr-studio/`.

## Project structure

```
qr-studio/
├── index.html
├── assets/
│   ├── css/style.css
│   ├── js/
│   │   ├── content.js   # content types, validation, encoding
│   │   └── app.js       # UI, styling, logo, preview, export, scanner
│   └── images/logo.svg
└── README.md
```

## Privacy

Everything runs in your browser. Only your theme and style choices are saved in LocalStorage. Wi-Fi passwords, contact details and uploaded images are never stored. Use the **Clear saved data** button in the footer to wipe it.

## Testing checklist

- [ ] Each content type scans correctly on a phone
- [ ] Logo shows in the preview and in the downloaded PNG
- [ ] SVG export with a logo opens correctly
- [ ] Low contrast shows a warning
- [ ] Wrong file types and images over 2 MB are rejected
- [ ] Denying camera permission shows a clear message
- [ ] Scanned links ask for confirmation before opening

## Troubleshooting

- **Blank preview:** open the browser console and look for CDN errors. The libraries load from the internet.
- **Camera won't start:** use HTTPS or localhost and allow camera permission.
- **Logo missing in SVG:** export as PNG instead.
- **Code won't scan:** shrink the logo, raise contrast, or keep the quiet zone larger.

## Known limitations

- No image cropping yet
- No branded card layouts or scan history yet
- SVG export with an embedded logo can vary between browsers

## Credits

Built with [qr-code-styling](https://github.com/kozakdenys/qr-code-styling) and [html5-qrcode](https://github.com/mebjas/html5-qrcode). Parts of the code were written with AI assistance and then reviewed and tested by me.

## License

MIT
