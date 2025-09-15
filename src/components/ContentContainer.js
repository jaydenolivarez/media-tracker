import React from "react";
import { motion } from "framer-motion";

/**
 * Responsive global content container for all main app pages.
 * Handles desktop (flex row), tablet (stacked), and mobile (drawer/stack) layouts.
 * Usage: Wrap all main content (excluding sidebar) in this container.
 */
export default function ContentContainer({ children }) {
  return (
    <div
    className="content-container">
      {children}
    </div>
  );
}
