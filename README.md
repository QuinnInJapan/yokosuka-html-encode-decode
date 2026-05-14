# yokosuka-html-encode-decode

Small single-file HTML app. Base64 encode/decode files. UTF-8 safe.

## Live

- **GitHub Pages**: https://quinninjapan.github.io/yokosuka-html-encode-decode/

## Preview mirrors

Same `index.html`, served through third-party CDNs straight from this repo.

- **raw.githack** (dev, fresh): https://raw.githack.com/QuinnInJapan/yokosuka-html-encode-decode/main/index.html
- **rawcdn.githack** (prod, cached): https://rawcdn.githack.com/QuinnInJapan/yokosuka-html-encode-decode/main/index.html
- **statically.io**: https://cdn.statically.io/gh/QuinnInJapan/yokosuka-html-encode-decode/main/index.html
- **htmlpreview.github.io**: https://htmlpreview.github.io/?https://github.com/QuinnInJapan/yokosuka-html-encode-decode/blob/main/index.html

## Usage

- **Decode**: upload file containing Base64 text → decoded UTF-8 output.
- **Encode**: upload any file (text or binary) → Base64 output.
- Both outputs downloadable as `.txt`.

## Implementation

- `atob` + `decodeURIComponent(escape(...))` for Unicode-safe decode.
- `btoa` over Latin-1 string built from raw `Uint8Array` bytes for encode.
- Whitespace stripped from Base64 input before decode.
