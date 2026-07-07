export function renderTokensCss(): string {
  return String.raw`:root {
  color-scheme: light;
  --bg: #f7f9fc;
  --bg-soft: #eef3f8;
  --app-bg:
    linear-gradient(180deg, #f8fafc 0%, #eef3f8 100%);
  --workbench-bg: rgba(255, 255, 255, 0.86);
  --chrome-bg: rgba(248, 250, 252, 0.9);
  --panel: rgba(255, 255, 255, 0.76);
  --panel-strong: rgba(241, 245, 249, 0.92);
  --control-bg: rgba(255, 255, 255, 0.82);
  --input-bg: rgba(255, 255, 255, 0.94);
  --code-bg: rgba(245, 247, 250, 0.94);
  --line: rgba(17, 24, 39, 0.1);
  --line-strong: rgba(93, 75, 138, 0.22);
  --text: #171923;
  --muted: #6b7280;
  --accent: #6b4fd8;
  --accent-soft: rgba(107, 79, 216, 0.1);
  --cyan: #1685a7;
  --success: #1ca66a;
  --warning: #b7791f;
  --danger: #e54867;
  --shadow: 0 20px 64px rgba(15, 23, 42, 0.1);
  --button-text-on-accent: #ffffff;
  --radius: 8px;
  --radius-sm: 6px;
  --gap: 12px;
  --left-rail-width: 270px;
  --right-rail-width: 360px;
  --collapsed-rail-width: 44px;
  --ui-font-size: 13px;
  --ui-line-height: 1.58;
  --body-font:
    system-ui,
    "SF Pro Text",
    "Segoe UI Variable",
    "Segoe UI",
    "Noto Sans SC",
    "PingFang SC",
    "Microsoft YaHei UI",
    sans-serif;
  --display-font: var(--body-font);
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
    radial-gradient(circle at 20% -10%, rgba(93, 214, 232, 0.18), transparent 34%),
    radial-gradient(circle at 82% 0%, rgba(169, 120, 255, 0.2), transparent 35%),
    linear-gradient(135deg, var(--bg) 0%, var(--bg-soft) 54%, #202134 100%);
  --workbench-bg: rgba(18, 21, 33, 0.86);
  --chrome-bg: rgba(255, 255, 255, 0.035);
  --panel: rgba(255, 255, 255, 0.055);
  --panel-strong: rgba(255, 255, 255, 0.085);
  --control-bg: rgba(255, 255, 255, 0.045);
  --input-bg: rgba(14, 16, 28, 0.82);
  --code-bg: rgba(9, 11, 20, 0.72);
  --line: rgba(172, 139, 255, 0.28);
  --line-strong: rgba(172, 139, 255, 0.46);
  --text: #f2eff8;
  --muted: #b8b0c8;
  --accent: #a978ff;
  --accent-soft: rgba(169, 120, 255, 0.16);
  --cyan: #5dd6e8;
  --success: #65d99a;
  --warning: #e7b75f;
  --danger: #ef6f91;
  --shadow: 0 18px 60px rgba(4, 6, 18, 0.38);
  --button-text-on-accent: #10131e;
}`;
}
