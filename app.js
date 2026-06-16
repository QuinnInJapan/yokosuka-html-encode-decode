(function (root, factory) {
  const app = factory(root);
  root.HtmlBase64App = app;
  if (typeof module === 'object' && module.exports) {
    module.exports = app;
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  const ENCODED_ENTRY_SUFFIX = '.base64-encoded.txt';
  const TEXT_MIME = 'text/plain;charset=utf-8';
  const IMAGE_EXTENSION_RE = /\.(avif|bmp|gif|heic|heif|ico|jpe?g|png|svg|tiff?|webp)$/i;

  function encodedDownloadName(fileName) {
    return `${fileName}-encoded.txt`;
  }

  function encodedZipDownloadName(fileName) {
    return `${fileName}-encoded.zip`;
  }

  function decodedDownloadName(fileName) {
    if (fileName.toLowerCase().endsWith('-encoded.txt')) {
      return fileName.slice(0, -'-encoded.txt'.length);
    }
    if (fileName.toLowerCase().endsWith('-encoded.zip')) {
      return fileName.slice(0, -'-encoded.zip'.length);
    }
    return 'decoded.txt';
  }

  function encodedZipEntryName(entryName) {
    return `${entryName}${ENCODED_ENTRY_SUFFIX}`;
  }

  function isEncodedZipEntryName(entryName) {
    return entryName.endsWith(ENCODED_ENTRY_SUFFIX);
  }

  function decodedZipEntryName(entryName) {
    return isEncodedZipEntryName(entryName)
      ? entryName.slice(0, -ENCODED_ENTRY_SUFFIX.length)
      : entryName;
  }

  function isZipFileName(fileName) {
    return /\.zip$/i.test(fileName);
  }

  function isImageFileName(fileName) {
    return IMAGE_EXTENSION_RE.test(fileName);
  }

  function shouldEncodeZipEntry(entryName) {
    return !entryName.endsWith('/') && !isImageFileName(entryName);
  }

  function expectedDownloadName(mode, fileName) {
    if (!fileName) return '';
    if (mode === 'encode') {
      return isZipFileName(fileName) ? encodedZipDownloadName(fileName) : encodedDownloadName(fileName);
    }
    return decodedDownloadName(fileName);
  }

  function actionButtonLabel(mode) {
    return mode === 'decode' ? 'Decode file' : 'Encode file';
  }

  function downloadButtonLabel(mode, fileName) {
    const fileType = isZipFileName(fileName) ? 'zip' : 'file';
    return mode === 'decode' ? `Download restored ${fileType}` : `Download encoded ${fileType}`;
  }

  function formatZipSummary(mode, result) {
    if (mode === 'decode') {
      return `Restored ${result.decodedCount} files. Copied ${result.copiedCount} unchanged. Ready: ${result.downloadName}`;
    }
    return `Encoded ${result.encodedCount} files. Copied ${result.copiedCount} images. Ready: ${result.downloadName}`;
  }

  function requireZipSupport() {
    if (typeof window === 'undefined' || typeof window.JSZip === 'undefined') {
      throw new Error('Zip support could not be loaded. Check your connection and try again.');
    }
  }

  function bytesToBase64(bytes) {
    let binary = '';
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    return btoa(binary);
  }

  function base64ToBytes(base64) {
    const cleaned = base64.replace(/\s+/g, '');
    const binary = atob(cleaned);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
      bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
  }

  function previewBytes(bytes) {
    try {
      return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
    } catch (_) {
      return `[binary file: ${bytes.length} bytes]`;
    }
  }

  async function encodeZipFile(file) {
    requireZipSupport();
    const inputZip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const outputZip = new window.JSZip();
    let encodedCount = 0;
    let copiedCount = 0;

    const jobs = [];
    inputZip.forEach((path, entry) => {
      if (entry.dir) {
        outputZip.folder(path);
        return;
      }

      jobs.push((async () => {
        const bytes = new Uint8Array(await entry.async('arraybuffer'));
        if (shouldEncodeZipEntry(path)) {
          outputZip.file(encodedZipEntryName(path), bytesToBase64(bytes));
          encodedCount += 1;
        } else {
          outputZip.file(path, bytes);
          copiedCount += 1;
        }
      })());
    });

    await Promise.all(jobs);
    const blob = await outputZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    return {
      blob,
      downloadName: encodedZipDownloadName(file.name),
      encodedCount,
      copiedCount,
      preview: formatZipSummary('encode', {
        encodedCount,
        copiedCount,
        downloadName: encodedZipDownloadName(file.name),
      }),
      status: `Created ${blob.size} byte zip from ${file.name}.`,
    };
  }

  async function decodeZipFile(file) {
    requireZipSupport();
    const inputZip = await window.JSZip.loadAsync(await file.arrayBuffer());
    const outputZip = new window.JSZip();
    let decodedCount = 0;
    let copiedCount = 0;

    const jobs = [];
    inputZip.forEach((path, entry) => {
      if (entry.dir) {
        outputZip.folder(path);
        return;
      }

      jobs.push((async () => {
        if (isEncodedZipEntryName(path)) {
          const base64 = await entry.async('string');
          outputZip.file(decodedZipEntryName(path), base64ToBytes(base64));
          decodedCount += 1;
        } else {
          outputZip.file(path, new Uint8Array(await entry.async('arraybuffer')));
          copiedCount += 1;
        }
      })());
    });

    await Promise.all(jobs);
    const blob = await outputZip.generateAsync({ type: 'blob', compression: 'DEFLATE' });
    return {
      blob,
      downloadName: decodedDownloadName(file.name),
      decodedCount,
      copiedCount,
      preview: formatZipSummary('decode', {
        decodedCount,
        copiedCount,
        downloadName: decodedDownloadName(file.name),
      }),
      status: `Created ${blob.size} byte restored zip from ${file.name}.`,
    };
  }

  async function initApp(doc = document) {
    const modeInputs = Array.from(doc.querySelectorAll('input[name="mode"]'));
    const fileInput = doc.getElementById('fileInput');
    const dropZone = doc.getElementById('dropZone');
    const fileName = doc.getElementById('fileName');
    const fileMeta = doc.getElementById('fileMeta');
    const expectedOutput = doc.getElementById('expectedOutput');
    const actionBtn = doc.getElementById('actionBtn');
    const downloadBtn = doc.getElementById('downloadBtn');
    const status = doc.getElementById('status');
    const resultSummary = doc.getElementById('resultSummary');
    const outputGroup = doc.getElementById('outputGroup');
    const output = doc.getElementById('output');

    let selectedFile = null;
    let selectedMode = currentMode();
    let resultBlob = null;
    let resultName = '';

    modeInputs.forEach((input) => {
      input.addEventListener('change', () => {
        selectedMode = currentMode();
        resetResult();
        updateControls();
      });
    });

    fileInput.addEventListener('change', () => {
      setSelectedFile(fileInput.files[0] || null);
    });

    ['dragenter', 'dragover'].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.add('is-dragging');
      });
    });

    ['dragleave', 'drop'].forEach((eventName) => {
      dropZone.addEventListener(eventName, (event) => {
        event.preventDefault();
        dropZone.classList.remove('is-dragging');
      });
    });

    dropZone.addEventListener('drop', (event) => {
      setSelectedFile(event.dataTransfer.files[0] || null);
    });

    actionBtn.addEventListener('click', async () => {
      if (!selectedFile) return;

      try {
        actionBtn.disabled = true;
        downloadBtn.disabled = true;
        status.className = 'status';
        status.textContent = `${selectedMode === 'decode' ? 'Decoding' : 'Encoding'} ${selectedFile.name}...`;

        const result = selectedMode === 'decode'
          ? await decodeSelectedFile(selectedFile)
          : await encodeSelectedFile(selectedFile);

        resultBlob = result.blob;
        resultName = result.downloadName;
        renderResult(result);
        status.textContent = result.status;
        downloadBtn.textContent = downloadButtonLabel(selectedMode, resultName);
        downloadBtn.disabled = false;
      } catch (e) {
        resultBlob = null;
        resultName = '';
        status.className = 'status error';
        status.textContent = `${selectedMode === 'decode' ? 'Decode' : 'Encode'} failed: ${e.message}`;
        downloadBtn.disabled = true;
      } finally {
        actionBtn.disabled = !selectedFile;
      }
    });

    downloadBtn.addEventListener('click', () => {
      if (resultBlob) downloadBlob(resultBlob, resultName);
    });

    updateControls();

    function currentMode() {
      return modeInputs.find((input) => input.checked)?.value || 'encode';
    }

    function setSelectedFile(file) {
      selectedFile = file;
      resetResult();
      updateControls();
    }

    function resetResult() {
      resultBlob = null;
      resultName = '';
      downloadBtn.disabled = true;
      downloadBtn.textContent = 'Download result';
      resultSummary.hidden = true;
      resultSummary.textContent = '';
      outputGroup.hidden = true;
      output.value = '';
      status.className = 'status';
    }

    function updateControls() {
      actionBtn.textContent = actionButtonLabel(selectedMode);
      actionBtn.disabled = !selectedFile;
      fileInput.accept = selectedMode === 'decode'
        ? '.txt,.b64,.base64,.zip,text/*,application/zip'
        : '.zip,*/*';

      if (!selectedFile) {
        fileName.textContent = 'Choose or drop a file';
        fileMeta.textContent = selectedMode === 'decode'
          ? 'Use a Base64 text file or an encoded zip from this app.'
          : 'Use any file, or a zip archive with mixed contents.';
        expectedOutput.textContent = 'Output name appears after you choose a file.';
        return;
      }

      fileName.textContent = selectedFile.name;
      fileMeta.textContent = `${formatBytes(selectedFile.size)} selected for ${selectedMode}.`;
      expectedOutput.textContent = `Will download: ${expectedDownloadName(selectedMode, selectedFile.name)}`;
      status.textContent = `Ready to ${selectedMode} ${selectedFile.name}.`;
    }

    async function encodeSelectedFile(file) {
      if (isZipFileName(file.name)) return encodeZipFile(file);

      const bytes = new Uint8Array(await file.arrayBuffer());
      const encoded = bytesToBase64(bytes);
      return {
        blob: new Blob([encoded], { type: TEXT_MIME }),
        downloadName: encodedDownloadName(file.name),
        preview: encoded,
        status: `Encoded ${bytes.length} bytes to ${encoded.length} Base64 characters.`,
        isTextPreview: true,
      };
    }

    async function decodeSelectedFile(file) {
      if (isZipFileName(file.name)) return decodeZipFile(file);

      const text = await file.text();
      const bytes = base64ToBytes(text);
      return {
        blob: new Blob([bytes], { type: 'application/octet-stream' }),
        downloadName: decodedDownloadName(file.name),
        preview: previewBytes(bytes),
        status: `Decoded ${text.replace(/\s+/g, '').length} Base64 characters to ${bytes.length} bytes.`,
        isTextPreview: true,
      };
    }

    function renderResult(result) {
      if (isZipFileName(result.downloadName)) {
        resultSummary.hidden = false;
        resultSummary.textContent = result.preview;
        outputGroup.hidden = true;
        output.value = '';
        return;
      }

      resultSummary.hidden = true;
      outputGroup.hidden = false;
      output.value = result.preview;
    }
  }

  function formatBytes(size) {
    if (size < 1024) return `${size} bytes`;
    if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
    return `${(size / 1024 / 1024).toFixed(1)} MB`;
  }

  function downloadBlob(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = name;
    a.click();
    URL.revokeObjectURL(url);
  }

  if (typeof window !== 'undefined' && typeof document !== 'undefined') {
    window.addEventListener('DOMContentLoaded', () => initApp());
  }

  return {
    ENCODED_ENTRY_SUFFIX,
    encodedDownloadName,
    encodedZipDownloadName,
    decodedDownloadName,
    encodedZipEntryName,
    isEncodedZipEntryName,
    decodedZipEntryName,
    isZipFileName,
    isImageFileName,
    shouldEncodeZipEntry,
    expectedDownloadName,
    actionButtonLabel,
    downloadButtonLabel,
    formatZipSummary,
    bytesToBase64,
    base64ToBytes,
    encodeZipFile,
    decodeZipFile,
    initApp,
  };
});
