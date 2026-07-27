"use client";

import { useEffect } from "react";
import CardDetailView from "./CardDetailView";

export default function CardModal({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
      onClick={onClose}
    >
      <div
        className="fade-up max-h-[88vh] w-full max-w-5xl overflow-y-auto rounded-2xl border border-edge bg-background"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="sticky top-0 z-10 flex items-center justify-end border-b border-edge bg-background/90 px-5 py-3 backdrop-blur">
          <button onClick={onClose} className="text-muted hover:text-ink">
            ✕
          </button>
        </div>
        <div className="p-6">
          <CardDetailView id={id} />
        </div>
      </div>
    </div>
  );
}
