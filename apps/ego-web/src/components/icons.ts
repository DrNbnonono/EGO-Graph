export type IconName =
  | "chevronLeft"
  | "chevronRight"
  | "chevronUp"
  | "check"
  | "copy"
  | "database"
  | "plus"
  | "trash"
  | "folder"
  | "command"
  | "paperclip"
  | "palette"
  | "plug"
  | "settings"
  | "shield"
  | "sliders"
  | "sparkles"
  | "terminal"
  | "zap";

const icons: Record<IconName, string> = {
  chevronLeft: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>',
  chevronRight: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>',
  chevronUp: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4" /></svg>',
  check: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3.5 8.5 3 3 6-7" /></svg>',
  copy:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><rect x="5" y="5" width="8" height="8" rx="1.5"/><path d="M3 10.5V3h7.5"/></svg>',
  database:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><ellipse cx="8" cy="4" rx="5" ry="2"/><path d="M3 4v4c0 1.1 2.2 2 5 2s5-.9 5-2V4"/><path d="M3 8v4c0 1.1 2.2 2 5 2s5-.9 5-2V8"/></svg>',
  plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>',
  trash:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M6 4V3h4v1m-5 2 .5 7h5L11 6" /></svg>',
  folder:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5.5v7h11v-6h-6l-1.4-2h-3.6z" /></svg>',
  command:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 6H4.5a2 2 0 1 1 2-2V6Zm4 0h1.5a2 2 0 1 0-2-2V6ZM6 10H4.5a2 2 0 1 0 2 2v-2Zm4 0h1.5a2 2 0 1 1-2 2v-2ZM6 6h4v4H6z" /></svg>',
  paperclip:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m13 7.5-5.5 5.5a3 3 0 0 1-4.2-4.2l6.2-6.2a2 2 0 0 1 2.8 2.8L6.1 11.6a1 1 0 0 1-1.4-1.4L10 5" /></svg>',
  palette:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5a5.5 5.5 0 0 0 0 11h1.1c.8 0 1.2-.9.7-1.5-.5-.7 0-1.5.9-1.5H12A3.5 3.5 0 0 0 15.5 7 4.5 4.5 0 0 0 11 2.5H8Z"/><circle cx="5.5" cy="6" r=".5"/><circle cx="7.8" cy="4.8" r=".5"/><circle cx="10.2" cy="5.2" r=".5"/></svg>',
  plug:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 2v4M10 2v4M4.5 6h7v2.2A3.5 3.5 0 0 1 8 11.7v2.8M3 14.5h10"/></svg>',
  settings:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.7 2.3h2.6l.4 1.5 1.3.7 1.5-.4 1.3 2.2-1.1 1.1v1.2l1.1 1.1-1.3 2.2-1.5-.4-1.3.7-.4 1.5H6.7l-.4-1.5-1.3-.7-1.5.4-1.3-2.2 1.1-1.1V7.4L2.2 6.3l1.3-2.2 1.5.4 1.3-.7.4-1.5Z"/><circle cx="8" cy="8" r="1.8"/></svg>',
  shield:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 2.5 13 4v3.8c0 3-2 5-5 6-3-1-5-3-5-6V4l5-1.5Z"/><path d="m5.8 8 1.4 1.4 3-3"/></svg>',
  sliders:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M3 8h10M3 12h10"/><circle cx="6" cy="4" r="1.4"/><circle cx="10" cy="8" r="1.4"/><circle cx="7.5" cy="12" r="1.4"/></svg>',
  sparkles:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8.5 2.5 9.7 6l3.3 1.3-3.3 1.2-1.2 3.5-1.3-3.5L4 7.3 7.2 6l1.3-3.5ZM3.2 10.7l.5 1.4 1.3.5-1.3.5-.5 1.4-.5-1.4-1.3-.5 1.3-.5.5-1.4Z"/></svg>',
  terminal:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m3 5 3 3-3 3M7.5 11h5.5"/><rect x="1.5" y="2.5" width="13" height="11" rx="2"/></svg>',
  zap: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8.8 1.8 3.5 8.7h4l-.4 5.5 5.4-7h-4l.3-5.4Z"/></svg>',
};

export function icon(name: IconName): string {
  return `<span class="icon icon-${name}">${icons[name]}</span>`;
}
