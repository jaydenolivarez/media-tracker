import React from "react";
import styles from "./PropertyFilterToggle.module.css";

const OPTIONS = [
  { key: "new", label: "New" },
  { key: "existing", label: "Existing" },
  { key: "both", label: "All" }
];

export default function PropertyFilterToggle({ value = "both", onChange }) {
  // Dynamic slider position and width
  const btnRefs = React.useRef([]);
  const [sliderStyle, setSliderStyle] = React.useState({ left: 0, width: 0 });
  const idx = OPTIONS.findIndex(opt => opt.key === value);
  React.useEffect(() => {
    if (btnRefs.current[idx]) {
      const btn = btnRefs.current[idx];
      const container = btn.parentElement;
      const btnRect = btn.getBoundingClientRect();
      const contRect = container.getBoundingClientRect();
      setSliderStyle({
        left: btn.offsetLeft,
        width: btn.offsetWidth
      });
    }
  }, [value]);

  return (
    <div className={styles.toggleSliderContainer}>
      <div
        className={styles.toggleSlider}
        style={sliderStyle}
        aria-hidden="true"
      />
      {OPTIONS.map((opt, i) => (
        <button
          key={opt.key}
          ref={el => (btnRefs.current[i] = el)}
          className={
            value === opt.key
              ? `${styles.toggleBtn} ${styles.toggleBtnActive}`
              : styles.toggleBtn
          }
          onClick={() => onChange(opt.key)}
          type="button"
          aria-pressed={value === opt.key}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
