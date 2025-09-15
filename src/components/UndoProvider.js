import React, { createContext, useContext, useRef, useState } from "react";

const UndoContext = createContext();

export function UndoProvider({ children }) {
  const [undoActions, setUndoActions] = useState([]); // Each action: {description, onUndo, onFinalize, duration}
  const timersRef = useRef({});

  // Add a new undo action
  const addUndoAction = (action) => {
    if (!action || typeof action.onFinalize !== 'function') return;
    const id = Date.now() + Math.random();
    setUndoActions((prev) => [...prev, { ...action, id }]);
    // Start timer for this undo action
    timersRef.current[id] = setTimeout(() => {
      setUndoActions((prev) => {
        const found = prev.find(a => a.id === id);
        if (found && typeof found.onFinalize === 'function') found.onFinalize();
        return prev.filter(a => a.id !== id);
      });
      delete timersRef.current[id];
    }, action.duration || 10000);
  };

  // Undo/cancel the latest action
  const handleUndo = (id) => {
    setUndoActions((prev) => {
      const found = prev.find(a => a.id === id);
      if (found && typeof found.onUndo === 'function') found.onUndo();
      if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
      delete timersRef.current[id];
      return prev.filter(a => a.id !== id);
    });
  };

  // Render the latest undo action as a snackbar/banner
  const latest = undoActions.length > 0 ? undoActions[undoActions.length - 1] : null;

  return (
    <UndoContext.Provider value={{ addUndoAction }}>
      {children}
      {latest && (
        <div
          style={{
            position: 'fixed',
            bottom: 30,
            left: '50%',
            transform: 'translateX(-50%)',
            background: 'var(--bg-card, #fff)',
            color: 'var(--text-main, #223)',
            border: '1.5px solid #ccc',
            borderRadius: 9,
            boxShadow: '0 2px 12px rgba(0,0,0,0.13)',
            padding: '14px 20px 14px 20px',
            zIndex: 99999999,
            display: 'flex',
            alignItems: 'center',
            gap: 18,
            fontSize: 16,
            fontWeight: 500,
            minWidth: 220,
            maxWidth: '90vw',
          }}
        >
          <span>{latest.description || 'Action undone.'}</span>
          <button
            style={{
              marginLeft: 10,
              background: '#3b82f6',
              color: '#fff',
              border: 'none',
              borderRadius: 6,
              padding: '7px 18px',
              fontWeight: 600,
              fontSize: 15,
              cursor: 'pointer',
              boxShadow: '0 1px 4px rgba(60,120,200,0.10)',
              transition: 'background 0.18s',
            }}
            onClick={() => handleUndo(latest.id)}
          >
            Undo
          </button>
        </div>
      )}
    </UndoContext.Provider>
  );
}

export function useUndo() {
  return useContext(UndoContext) || {};
}