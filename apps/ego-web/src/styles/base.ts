export function renderBaseCss(): string {
  return String.raw`* {
  box-sizing: border-box;
}

html {
  height: 100%;
  scroll-behavior: smooth;
}

body {
  height: 100%;
  margin: 0;
  overflow: hidden;
  background: var(--surface-0);
  color: var(--text);
  font-family: var(--body-font);
  font-size: var(--ui-font-size);
  line-height: var(--ui-line-height);
  letter-spacing: -0.005em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

/* The layered app background sits behind the solid workbench shell. */
body::before {
  content: "";
  position: fixed;
  inset: 0;
  z-index: -1;
  background: var(--app-bg);
}

button,
input,
textarea,
select {
  font: inherit;
  letter-spacing: inherit;
}

button {
  border: 0;
  background: transparent;
  color: inherit;
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: none;
  box-shadow: var(--ring);
  border-color: var(--accent-ring);
}

::selection {
  background: var(--accent-soft);
  color: var(--text);
}

h1,
h2,
h3,
p {
  margin: 0;
}

h1,
h2,
h3 {
  font-family: var(--display-font);
  color: var(--text);
  line-height: 1.3;
  letter-spacing: -0.014em;
}

h2 {
  font-size: var(--text-base);
  font-weight: var(--weight-semibold);
  letter-spacing: 0;
}

a {
  color: var(--accent);
}

/* Subtle decorative grid overlay. Hidden when the appearance toggle is off. */
.page-field {
  position: fixed;
  inset: 0;
  z-index: -1;
  pointer-events: none;
  background-image:
    linear-gradient(var(--accent-line) 1px, transparent 1px),
    linear-gradient(90deg, var(--accent-line) 1px, transparent 1px);
  background-size: 64px 64px;
  opacity: 0.5;
  mask-image: radial-gradient(circle at 50% 30%, black, transparent 78%);
}

body[data-grid="off"] .page-field {
  display: none;
}

/* Thin, themed scrollbars so long panels don't feel like a default browser. */
* {
  scrollbar-width: thin;
  scrollbar-color: var(--line-strong) transparent;
}

*::-webkit-scrollbar {
  width: 10px;
  height: 10px;
}

*::-webkit-scrollbar-thumb {
  border: 3px solid transparent;
  border-radius: var(--radius-full);
  background-clip: padding-box;
  background-color: var(--line-strong);
}

*::-webkit-scrollbar-thumb:hover {
  background-color: var(--accent);
}

*::-webkit-scrollbar-track {
  background: transparent;
}`;
}
