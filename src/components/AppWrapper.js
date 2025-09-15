import React, { useEffect, useState } from "react";
import "../App.css";

function useMobileOrientation() {
  const [isMobile, setIsMobile] = useState(false);
  const [isPortrait, setIsPortrait] = useState(window.innerHeight > window.innerWidth);

  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(/Mobi|Android|iPhone|iPad|iPod|Opera Mini|IEMobile|WPDesktop/i.test(navigator.userAgent));
    };
    const handleResize = () => {
      setIsPortrait(window.innerHeight > window.innerWidth);
    };
    checkMobile();
    window.addEventListener("resize", handleResize);
    window.addEventListener("orientationchange", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      window.removeEventListener("orientationchange", handleResize);
    };
  }, []);

  return { isMobile, isPortrait };
}

export default function AppWrapper({ children }) {
  const { isMobile, isPortrait } = useMobileOrientation();

  React.useEffect(() => {
    if (isMobile && isPortrait) {
      document.body.style.position = "fixed";
      document.body.style.overflow = "hidden";
      document.body.style.width = "100vw";
      document.body.style.height = "100vh";
    } else {
      document.body.style.position = "";
      document.body.style.overflow = "";
      document.body.style.width = "";
      document.body.style.height = "";
    }
    return () => {
      document.body.style.position = "";
      document.body.style.overflow = "";
      document.body.style.width = "";
      document.body.style.height = "";
    };
  }, [isMobile, isPortrait]);

  return (
    <>{children}</>
  );
}

