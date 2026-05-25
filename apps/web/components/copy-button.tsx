"use client";

import { useState } from "react";

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  async function copy() {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <button
      type="button"
      onClick={copy}
      style={{
        fontSize: 12,
        padding: "4px 10px",
        borderRadius: 6,
        border: "1px solid #d4d4d8",
        background: copied ? "#ecfdf5" : "#fff",
        cursor: "pointer",
      }}
    >
      {copied ? "Copied" : label}
    </button>
  );
}
