import React, { createContext, useContext, useState, useCallback } from "react";

const BannerContext = createContext();

export function BannerProvider({ children }) {
  const [banner, setBanner] = useState({ visible: false, message: "", type: "success" });

  const showBanner = useCallback((message, type = "success") => {
    setBanner({ visible: true, message, type });
  }, []);

  const hideBanner = useCallback(() => {
    setBanner(b => ({ ...b, visible: false }));
  }, []);

  return (
    <BannerContext.Provider value={{ banner, showBanner, hideBanner }}>
      {children}
    </BannerContext.Provider>
  );
}

export function useBanner() {
  return useContext(BannerContext);
}
