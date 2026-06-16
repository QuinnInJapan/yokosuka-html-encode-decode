const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');

const {
  ENCODED_ENTRY_SUFFIX,
  encodedDownloadName,
  decodedDownloadName,
  encodedZipEntryName,
  decodedZipEntryName,
  shouldEncodeZipEntry,
  isZipFileName,
  encodeZipFile,
  decodeZipFile,
  expectedDownloadName,
  actionButtonLabel,
  downloadButtonLabel,
  formatZipSummary,
} = require('./app.js');

test('single-file encoding names downloads after the original filename', () => {
  assert.equal(encodedDownloadName('letter.txt'), 'letter.txt-encoded.txt');
  assert.equal(encodedDownloadName('archive.tar.gz'), 'archive.tar.gz-encoded.txt');
  assert.equal(encodedDownloadName('no-extension'), 'no-extension-encoded.txt');
});

test('single-file decoding restores filenames created by the app', () => {
  assert.equal(decodedDownloadName('letter.txt-encoded.txt'), 'letter.txt');
  assert.equal(decodedDownloadName('archive.tar.gz-encoded.txt'), 'archive.tar.gz');
});

test('zip entries receive and lose a distinct encoded suffix', () => {
  const encoded = encodedZipEntryName('folder/report.csv');

  assert.equal(encoded, `folder/report.csv${ENCODED_ENTRY_SUFFIX}`);
  assert.equal(decodedZipEntryName(encoded), 'folder/report.csv');
});

test('zip encoding skips image files and directories', () => {
  assert.equal(shouldEncodeZipEntry('assets/photo.jpg'), false);
  assert.equal(shouldEncodeZipEntry('assets/icon.PNG'), false);
  assert.equal(shouldEncodeZipEntry('assets/vector.svg'), false);
  assert.equal(shouldEncodeZipEntry('docs/readme.md'), true);
  assert.equal(shouldEncodeZipEntry('docs/'), false);
});

test('zip files are detected by extension', () => {
  assert.equal(isZipFileName('upload.zip'), true);
  assert.equal(isZipFileName('UPLOAD.ZIP'), true);
  assert.equal(isZipFileName('upload.txt'), false);
});

test('page loads zip support from a local vendored script for offline use', () => {
  const html = fs.readFileSync('index.html', 'utf8');

  assert.match(html, /<script src="vendor\/jszip\.min\.js"><\/script>/);
  assert.doesNotMatch(html, /cdn\.jsdelivr\.net\/npm\/jszip/);
});

test('single workflow copy previews the output filename by mode', () => {
  assert.equal(expectedDownloadName('encode', 'letter.txt'), 'letter.txt-encoded.txt');
  assert.equal(expectedDownloadName('encode', 'bundle.zip'), 'bundle.zip-encoded.zip');
  assert.equal(expectedDownloadName('decode', 'letter.txt-encoded.txt'), 'letter.txt');
  assert.equal(expectedDownloadName('decode', 'bundle.zip-encoded.zip'), 'bundle.zip');
});

test('single workflow labels match the active mode and result', () => {
  assert.equal(actionButtonLabel('encode'), 'Encode file');
  assert.equal(actionButtonLabel('decode'), 'Decode file');
  assert.equal(downloadButtonLabel('encode', 'letter.txt-encoded.txt'), 'Download encoded file');
  assert.equal(downloadButtonLabel('decode', 'letter.txt'), 'Download restored file');
  assert.equal(downloadButtonLabel('decode', 'bundle.zip'), 'Download restored zip');
});

test('zip summaries are compact result text for the UI', () => {
  assert.equal(
    formatZipSummary('encode', { encodedCount: 12, copiedCount: 4, downloadName: 'bundle.zip-encoded.zip' }),
    'Encoded 12 files. Copied 4 images. Ready: bundle.zip-encoded.zip'
  );
  assert.equal(
    formatZipSummary('decode', { decodedCount: 12, copiedCount: 4, downloadName: 'bundle.zip' }),
    'Restored 12 files. Copied 4 unchanged. Ready: bundle.zip'
  );
});

test('zip encoding base64-encodes non-images and copies images', async () => {
  const inputZip = FakeZip.from({
    'docs/readme.md': bytes('hello'),
    'assets/photo.png': new Uint8Array([1, 2, 3]),
  });
  const outputZip = await withFakeZip(inputZip, async () => {
    await encodeZipFile(new File([new Uint8Array([0])], 'sample.zip'));
    return FakeZip.lastOutput;
  });

  assert.equal(outputZip.files['docs/readme.md.base64-encoded.txt'].data, 'aGVsbG8=');
  assert.deepEqual(Array.from(outputZip.files['assets/photo.png'].data), [1, 2, 3]);
});

test('zip decoding restores files encoded by this app', async () => {
  const inputZip = FakeZip.from({
    'docs/readme.md.base64-encoded.txt': 'aGVsbG8=',
    'assets/photo.png': new Uint8Array([1, 2, 3]),
  });
  const outputZip = await withFakeZip(inputZip, async () => {
    await decodeZipFile(new File([new Uint8Array([0])], 'sample.zip-encoded.zip'));
    return FakeZip.lastOutput;
  });

  assert.deepEqual(Array.from(outputZip.files['docs/readme.md'].data), Array.from(bytes('hello')));
  assert.deepEqual(Array.from(outputZip.files['assets/photo.png'].data), [1, 2, 3]);
});

test('missing zip support error points to the local vendor script', async () => {
  const previousWindow = global.window;
  global.window = {};
  try {
    await assert.rejects(
      () => encodeZipFile(new File([new Uint8Array([0])], 'sample.zip')),
      /local JSZip/
    );
  } finally {
    global.window = previousWindow;
  }
});

function bytes(value) {
  return new TextEncoder().encode(value);
}

async function withFakeZip(inputZip, callback) {
  const previousWindow = global.window;
  FakeZip.nextInput = inputZip;
  FakeZip.lastOutput = null;
  global.window = { JSZip: FakeZip };
  try {
    return await callback();
  } finally {
    global.window = previousWindow;
  }
}

class FakeZip {
  constructor() {
    this.files = {};
    FakeZip.lastOutput = this;
  }

  static from(files) {
    const zip = Object.create(FakeZip.prototype);
    zip.files = Object.fromEntries(
      Object.entries(files).map(([name, data]) => [name, new FakeEntry(name, data)])
    );
    return zip;
  }

  static async loadAsync() {
    return FakeZip.nextInput;
  }

  forEach(callback) {
    Object.entries(this.files).forEach(([name, entry]) => callback(name, entry));
  }

  folder(path) {
    this.files[path] = new FakeEntry(path, null, true);
  }

  file(path, data) {
    this.files[path] = { data };
  }

  async generateAsync() {
    return new Blob(['zip']);
  }
}

class FakeEntry {
  constructor(name, data, dir = false) {
    this.name = name;
    this.data = data;
    this.dir = dir;
  }

  async async(type) {
    if (type === 'string') return this.data;
    return this.data.buffer.slice(this.data.byteOffset, this.data.byteOffset + this.data.byteLength);
  }
}
