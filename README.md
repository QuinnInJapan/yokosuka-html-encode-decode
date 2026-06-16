# yokosuka-html-encode-decode

Small static HTML app. Base64 encode/decode files and zip archives. GitHub Pages safe.

## Live

- **GitHub Pages**: https://quinninjapan.github.io/yokosuka-html-encode-decode/

## Preview mirrors

Same `index.html`, served through third-party CDNs straight from this repo.

- **raw.githack** (dev, fresh): https://raw.githack.com/QuinnInJapan/yokosuka-html-encode-decode/main/index.html
- **rawcdn.githack** (prod, cached): https://rawcdn.githack.com/QuinnInJapan/yokosuka-html-encode-decode/main/index.html
- **statically.io**: https://cdn.statically.io/gh/QuinnInJapan/yokosuka-html-encode-decode/main/index.html
- **htmlpreview.github.io**: https://htmlpreview.github.io/?https://github.com/QuinnInJapan/yokosuka-html-encode-decode/blob/main/index.html

## Usage

- Pick **Encode** or **Decode**, then choose or drag in one file.
- The app shows the expected output filename before processing.
- **Encode a single file**: upload any non-zip file → download `originalfilename-encoded.txt`.
- **Decode a single file**: upload a text file encoded by this app → download the original filename and bytes.
- **Encode a zip**: upload `.zip` → download `original.zip-encoded.zip`; all non-image entries become Base64 text files with `.base64-encoded.txt`, while image files stay unchanged.
- **Decode a zip**: upload a zip encoded by this app → download the restored zip with encoded entries returned to their original names and bytes.

## Implementation

- `btoa`/`atob` over raw `Uint8Array` bytes for binary-safe single-file encode/decode.
- JSZip loaded from a CDN for browser-only zip read/write; no server or build step needed.
- Whitespace stripped from Base64 input before decode.
