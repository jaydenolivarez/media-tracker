// Dropbox Chunked Upload Utility for React (with progress, pause, resume)
// Usage: import and call uploadFileToDropboxChunked(...)

/**
 * @param {File|Blob} file - The file/blob to upload
 * @param {string} dropboxPath - Dropbox path (including filename)
 * @param {string} accessToken - Dropbox OAuth token
 * @param {function} onProgress - Callback(percent, uploadedBytes, totalBytes)
 * @param {object} [control] - Pass in { paused: false } to allow pausing/resuming
 * @returns {Promise<object>} Dropbox file metadata on success
 */
export async function uploadFileToDropboxChunked(file, dropboxPath, accessToken, onProgress, control = { paused: false, cancelled: false }) {
  const CHUNK_SIZE = 8 * 1024 * 1024; // 8MB per chunk (Dropbox max is 150MB)
  const totalSize = file.size;
  let uploaded = 0;
  let sessionId = null;
  let offset = 0;
  let finished = false;

  // Helper to wait if paused
  async function waitIfPaused() {
    while (control.paused) {
      await new Promise(r => setTimeout(r, 250));
    }
    if (control.cancelled) throw new Error('Upload cancelled');
  }

  // Get upload endpoint from env or fallback
  const uploadEndpoint = process.env.REACT_APP_UPLOAD_ENDPOINT || 'https://chunkeddropboxupload-owwuszp6nq-uc.a.run.app';

  // Helper to convert Blob to base64
  async function blobToBase64(blob) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result.split(',')[1]);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  }

  // Start session (first chunk)
  const firstChunk = file.slice(0, CHUNK_SIZE);
  const firstChunkBase64 = await blobToBase64(firstChunk);
  let response = null;
  let payload = {
    chunk: firstChunkBase64,
    offset: 0,
    path: dropboxPath,
    accessToken,
    isLast: file.size <= CHUNK_SIZE,
  };
  console.log('Uploading first chunk to:', uploadEndpoint, payload);
  response = await fetch(uploadEndpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(await response.text());
  const respData = await response.json();
  sessionId = respData.sessionId || respData.session_id;
  uploaded = firstChunk.size;
  offset = firstChunk.size;
  if (onProgress) onProgress(Math.min((uploaded / totalSize) * 100, 100), uploaded, totalSize);

  // Upload remaining chunks
  console.log('After first chunk:', {offset, totalSize, finished});
  while (offset < totalSize) {
    await waitIfPaused();
    const chunk = file.slice(offset, offset + CHUNK_SIZE);
    const isLast = (offset + CHUNK_SIZE) >= totalSize;
    const chunkBase64 = await blobToBase64(chunk);
    payload = {
      chunk: chunkBase64,
      offset,
      path: dropboxPath,
      accessToken,
      sessionId,
      isLast,
    };
    console.log('Uploading chunk to:', uploadEndpoint, payload);
    response = await fetch(uploadEndpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!response.ok) throw new Error(await response.text());
    offset += chunk.size;
    uploaded = offset;
    if (onProgress) onProgress(Math.min((uploaded / totalSize) * 100, 100), uploaded, totalSize);
    if (isLast) {
      finished = true;
      return await response.json();
    }
  }
  throw new Error('Upload did not finish');
}
