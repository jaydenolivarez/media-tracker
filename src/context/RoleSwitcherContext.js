import React, { createContext, useContext, useState, useCallback } from "react";

const RoleSwitcherContext = createContext();

export function useRoleSwitcher() {
  return useContext(RoleSwitcherContext);
}

export function RoleSwitcherProvider({ children }) {
  const [showRoleSwitcher, setShowRoleSwitcher] = useState(false);

  const openRoleSwitcher = useCallback(() => setShowRoleSwitcher(true), []);
  const closeRoleSwitcher = useCallback(() => setShowRoleSwitcher(false), []);

  return (
    <RoleSwitcherContext.Provider value={{ showRoleSwitcher, openRoleSwitcher, closeRoleSwitcher }}>
      {children}
    </RoleSwitcherContext.Provider>
  );
}
