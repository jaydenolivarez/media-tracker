import React, { createContext, useContext, useState, useCallback } from "react";

const SettingsModalContext = createContext();

export function useSettingsModal() {
  return useContext(SettingsModalContext);
}

export function SettingsModalProvider({ children }) {
  const [showSettings, setShowSettings] = useState(false);

  const openSettings = useCallback(() => setShowSettings(true), []);
  const closeSettings = useCallback(() => setShowSettings(false), []);

  return (
    <SettingsModalContext.Provider value={{ showSettings, openSettings, closeSettings }}>
      {children}
    </SettingsModalContext.Provider>
  );
}
