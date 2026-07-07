export function renderTokensCss(): string {
  return String.raw`:root {
  color-scheme: light;

  /* --- Brand & status colors --- */
  --bg: #f7f9fc;
  --bg-soft: #eef3f8;
  --accent: #1a1a2e;
  --accent-soft: rgba(26, 26, 46, 0.08);
  --cyan: #1685a7;
  --success: #1ca66a;
  --warning: #b7791f;
  --danger: #e54867;
  --text: #171923;
  --muted: #6b7280;
  --line: rgba(17, 24, 39, 0.1);
  --line-strong: rgba(26, 26, 46, 0.18);
  --panel: rgba(255, 255, 255, 0.76);
  --button-text-on-accent: #ffffff;

  /* --- Solid surface ladder (flat base) --- */
  --surface-0: #f4f6fb;
  --surface-1: #ffffff;
  --surface-2: #ffffff;
  --surface-3: #ffffff;
  --surface-inset: #f7f8fc;

  /* --- Translucent / chrome layers (glass accents only) --- */
  --panel-strong: rgba(241, 245, 249, 0.92);
  --workbench-bg: rgba(255, 255, 255, 0.86);
  --chrome-bg: rgba(248, 250, 252, 0.82);
  --control-bg: rgba(255, 255, 255, 0.82);
  --input-bg: #ffffff;
  --code-bg: #f6f7fa;
  --overlay-bg: rgba(255, 255, 255, 0.97);
  --glass-border: rgba(255, 255, 255, 0.6);

  /* --- App background: subtle, flat, not muddy --- */
  --app-bg: linear-gradient(180deg, #fbfcfe 0%, #eef2f8 100%);

  /* --- Tinted accents derived from brand --- */
  --accent-tint: rgba(26, 26, 46, 0.06);
  --accent-ring: rgba(26, 26, 46, 0.2);
  --accent-line: rgba(26, 26, 46, 0.16);
  --cyan-tint: rgba(22, 133, 167, 0.08);
  --danger-tint: rgba(229, 72, 103, 0.08);
  --danger-line: rgba(229, 72, 103, 0.24);
  --warning-tint: rgba(183, 121, 31, 0.08);
  --warning-line: rgba(183, 121, 31, 0.28);
  --success-tint: rgba(28, 166, 106, 0.1);

  /* --- Shadows (softer, layered for elevation cues) --- */
  --shadow: 0 16px 48px rgba(15, 23, 42, 0.1);
  --shadow-sm: 0 1px 2px rgba(15, 23, 42, 0.06), 0 1px 3px rgba(15, 23, 42, 0.05);
  --shadow-md: 0 4px 12px rgba(15, 23, 42, 0.08);
  --shadow-lg: 0 18px 50px rgba(15, 23, 42, 0.14);
  --shadow-pop: 0 24px 70px rgba(15, 23, 42, 0.18);
  --ring: 0 0 0 3px var(--accent-tint);

  /* --- Radius scale --- */
  --radius-xs: 4px;
  --radius-sm: 6px;
  --radius: 8px;
  --radius-lg: 12px;
  --radius-xl: 16px;
  --radius-full: 999px;

  /* --- Spacing scale (4px grid) --- */
  --sp-1: 4px;
  --sp-2: 8px;
  --sp-3: 12px;
  --gap: var(--sp-3);
  --sp-4: 16px;
  --sp-5: 20px;
  --sp-6: 24px;
  --sp-8: 32px;
  --sp-10: 40px;
  --sp-14: 56px;
  --sp-18: 72px;
  --left-rail-width: 270px;
  --right-rail-width: 360px;
  --collapsed-rail-width: 44px;

  /* --- Typography --- */
  --ui-font-size: 13px;
  --ui-line-height: 1.58;
  --text-xs: 11px;
  --text-sm: 12px;
  --text-base: 13px;
  --text-md: 14px;
  --text-lg: 16px;
  --text-xl: 18px;
  --text-2xl: 22px;
  --text-3xl: 28px;
  --weight-regular: 400;
  --weight-medium: 500;
  --weight-semibold: 600;
  --weight-bold: 700;
  --body-font:
    "Inter",
    system-ui,
    "SF Pro Text",
    "Segoe UI Variable",
    "Segoe UI",
    "Noto Sans SC",
    "PingFang SC",
    "Microsoft YaHei UI",
    sans-serif;
  --display-font:
    "Inter Display",
    "Inter",
    system-ui,
    "SF Pro Display",
    "Segoe UI Variable",
    "Segoe UI",
    "Noto Sans SC",
    "PingFang SC",
    "Microsoft YaHei UI",
    sans-serif;
  --mono-font:
    "JetBrains Mono",
    "Cascadia Code",
    "SFMono-Regular",
    "Menlo",
    monospace;
  font-family: var(--body-font);
}

body[data-theme="dark"] {
  color-scheme: dark;
  --bg: #121521;
  --bg-soft: #181727;
  --app-bg:
    radial-gradient(circle at 18% -8%, rgba(93, 214, 232, 0.1), transparent 38%),
    radial-gradient(circle at 84% -4%, rgba(169, 120, 255, 0.12), transparent 40%),
    linear-gradient(160deg, #10131f 0%, #161a29 56%, #1c1f33 100%);
  --surface-0: #0f121d;
  --surface-1: #161a28;
  --surface-2: #1b1f30;
  --surface-3: #232839;
  --surface-inset: #0c0f19;
  --panel-strong: rgba(255, 255, 255, 0.07);
  --workbench-bg: rgba(20, 24, 36, 0.86);
  --chrome-bg: rgba(255, 255, 255, 0.04);
  --control-bg: rgba(255, 255, 255, 0.05);
  --input-bg: rgba(12, 15, 25, 0.7);
  --code-bg: #0d1019;
  --overlay-bg: rgba(20, 24, 36, 0.96);
  --glass-border: rgba(255, 255, 255, 0.1);
  --line: rgba(255, 255, 255, 0.09);
  --line-strong: rgba(240, 240, 240, 0.22);
  --text: #f1eef9;
  --muted: #9b94b0;
  --accent: #f0f0f0;
  --accent-soft: rgba(240, 240, 240, 0.1);
  --cyan: #5dd6e8;
  --success: #65d99a;
  --warning: #e7b75f;
  --danger: #ef6f91;
  --button-text-on-accent: #10131e;
  --accent-tint: rgba(240, 240, 240, 0.08);
  --accent-ring: rgba(240, 240, 240, 0.2);
  --accent-line: rgba(240, 240, 240, 0.18);
  --cyan-tint: rgba(93, 214, 232, 0.1);
  --danger-tint: rgba(239, 111, 145, 0.14);
  --danger-line: rgba(239, 111, 145, 0.34);
  --warning-tint: rgba(231, 183, 95, 0.12);
  --warning-line: rgba(231, 183, 95, 0.36);
  --success-tint: rgba(101, 217, 154, 0.14);
  --shadow: 0 16px 48px rgba(2, 4, 14, 0.5);
  --shadow-sm: 0 1px 2px rgba(0, 0, 0, 0.4);
  --shadow-md: 0 6px 16px rgba(0, 0, 0, 0.4);
  --shadow-lg: 0 20px 54px rgba(2, 4, 14, 0.55);
  --shadow-pop: 0 26px 76px rgba(2, 4, 14, 0.62);
  --ring: 0 0 0 3px var(--accent-tint);
}

/* Density overrides (governed by body[data-density]) */
body[data-density="compact"] {
  --gap: 9px;
}

body[data-density="comfortable"] {
  --gap: 16px;
}

/* Font-scale overrides (governed by body[data-font-scale]) */
body[data-font-scale="compact"] {
  --ui-font-size: 12.5px;
}

body[data-font-scale="large"] {
  --ui-font-size: 14px;
}`;
}
