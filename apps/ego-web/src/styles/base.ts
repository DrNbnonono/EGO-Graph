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
  background: var(--app-bg);
  color: var(--text);
  font-family: var(--body-font);
  font-size: var(--ui-font-size);
  line-height: var(--ui-line-height);
  letter-spacing: 0;
}

button,
input,
textarea,
select {
  font: inherit;
}

button {
  border: 0;
}

button:focus-visible,
input:focus-visible,
textarea:focus-visible,
select:focus-visible {
  outline: 2px solid var(--cyan);
  outline-offset: 2px;
}

h1,
h2,
h3,
p {
  margin: 0;
}

h2 {
  font-size: 13px;
  letter-spacing: 0;
}

.page-field {
  position: fixed;
  inset: 0;
  pointer-events: none;
  background-image:
    linear-gradient(rgba(107, 79, 216, 0.045) 1px, transparent 1px),
    linear-gradient(90deg, rgba(22, 133, 167, 0.035) 1px, transparent 1px);
  background-size: 56px 56px;
  mask-image: linear-gradient(180deg, black, transparent 82%);
}`;
}
