"use client";

export function AddToClaudeButton({
  deepLink,
  installerUrl,
}: {
  deepLink: string;
  installerUrl: string;
}) {
  function tryOpen() {
    window.location.href = deepLink;
    setTimeout(() => {
      if (confirm("Claude Desktop did not open. Open the web installer page instead?")) {
        window.open(installerUrl, "_blank");
      }
    }, 800);
  }

  return (
    <button
      type="button"
      onClick={() => tryOpen()}
      style={{
        padding: "10px 18px",
        borderRadius: 8,
        border: "none",
        background: "#d97706",
        color: "#fff",
        fontWeight: 600,
        cursor: "pointer",
        fontSize: 14,
      }}
    >
      Add to Claude Desktop
    </button>
  );
}
