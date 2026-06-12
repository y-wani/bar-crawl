// src/components/Toaster.tsx
//
// Minimal toast notifications. Call `toast.success("...")` or
// `toast.error("...")` from anywhere; mount <Toaster /> once in App.

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { AnimatePresence, motion } from "framer-motion";
import "../styles/Toaster.css";

type ToastType = "success" | "error";

interface ToastItem {
  id: number;
  message: string;
  type: ToastType;
}

let pushToast: ((message: string, type: ToastType) => void) | null = null;

export const toast = {
  success: (message: string) => pushToast?.(message, "success"),
  error: (message: string) => pushToast?.(message, "error"),
};

let nextId = 1;

export const Toaster: React.FC = () => {
  const [toasts, setToasts] = useState<ToastItem[]>([]);

  useEffect(() => {
    pushToast = (message, type) => {
      const id = nextId++;
      setToasts((prev) => [...prev, { id, message, type }]);
      // Auto-dismiss; exit animation handled by AnimatePresence
      setTimeout(() => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
      }, 2700);
    };
    return () => {
      pushToast = null;
    };
  }, []);

  return createPortal(
    <div className="toaster-stack" role="status" aria-live="polite">
      <AnimatePresence mode="popLayout">
        {toasts.map((t) => (
          <motion.div
            key={t.id}
            layout
            className={`toast toast-${t.type}`}
            initial={{ opacity: 0, y: 16, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.97 }}
            transition={{ type: "spring", damping: 28, stiffness: 380 }}
          >
            <span className="toast-icon">{t.type === "success" ? "✓" : "✕"}</span>
            {t.message}
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body
  );
};
