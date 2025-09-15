// UploadManagerContext.js
// Provides upload progress and control for all file uploads in the app
import React, { createContext, useContext, useState, useRef, useCallback } from 'react';
import { uploadFileToDropboxChunked } from '../utils/dropboxChunkedUpload';

const UploadManagerContext = createContext();

export function useUploadManager() {
  return useContext(UploadManagerContext);
}

export function UploadManagerProvider({ children }) {
  const [uploads, setUploads] = useState([]); // [{id, file, progress, status, control, error, dropboxPath}]
  const uploadIdRef = useRef(0);

  // Start a new upload (returns upload id)
  const startUpload = useCallback(async (file, dropboxPath, accessToken, onComplete) => {
    const id = ++uploadIdRef.current;
    const control = { paused: false, cancelled: false };
    setUploads(prev => [...prev, { id, file, progress: 0, status: 'uploading', control, error: null, dropboxPath }]);
    try {
      await uploadFileToDropboxChunked(
        file,
        dropboxPath,
        accessToken,
        (percent) => {
          setUploads(prev => prev.map(u => u.id === id ? { ...u, progress: percent } : u));
        },
        control
      );
      setUploads(prev => prev.map(u => u.id === id ? { ...u, progress: 100, status: 'done' } : u));
      if (onComplete) onComplete(null);
    } catch (e) {
      setUploads(prev => prev.map(u => u.id === id ? { ...u, status: 'error', error: e.message } : u));
      if (onComplete) onComplete(e);
    }
  }, []);

  // Pause, resume, cancel
  const pauseUpload = id => setUploads(prev => prev.map(u => u.id === id ? (u.control.paused = true, { ...u }) : u));
  const resumeUpload = id => setUploads(prev => prev.map(u => u.id === id ? (u.control.paused = false, { ...u }) : u));
  const cancelUpload = id => setUploads(prev => prev.map(u => u.id === id ? (u.control.cancelled = true, { ...u }) : u));

  // Remove upload from list (after done/error)
  const removeUpload = id => setUploads(prev => prev.filter(u => u.id !== id));

  return (
    <UploadManagerContext.Provider value={{ uploads, startUpload, pauseUpload, resumeUpload, cancelUpload, removeUpload }}>
      {children}
    </UploadManagerContext.Provider>
  );
}
