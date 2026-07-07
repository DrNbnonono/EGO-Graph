export type IconName =
  | "chevronLeft"
  | "chevronRight"
  | "chevronUp"
  | "plus"
  | "trash"
  | "folder"
  | "command"
  | "settings";

const icons: Record<IconName, string> = {
  chevronLeft: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M10 3 5 8l5 5" /></svg>',
  chevronRight: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m6 3 5 5-5 5" /></svg>',
  chevronUp: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="m4 10 4-4 4 4" /></svg>',
  plus: '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" /></svg>',
  trash:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M3 4h10M6 4V3h4v1m-5 2 .5 7h5L11 6" /></svg>',
  folder:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M2.5 5.5v7h11v-6h-6l-1.4-2h-3.6z" /></svg>',
  command:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6 6H4.5a2 2 0 1 1 2-2V6Zm4 0h1.5a2 2 0 1 0-2-2V6ZM6 10H4.5a2 2 0 1 0 2 2v-2Zm4 0h1.5a2 2 0 1 1-2 2v-2ZM6 6h4v4H6z" /></svg>',
  settings:
    '<svg viewBox="0 0 16 16" aria-hidden="true"><path d="M6.7 2.3h2.6l.4 1.5 1.3.7 1.5-.4 1.3 2.2-1.1 1.1v1.2l1.1 1.1-1.3 2.2-1.5-.4-1.3.7-.4 1.5H6.7l-.4-1.5-1.3-.7-1.5.4-1.3-2.2 1.1-1.1V7.4L2.2 6.3l1.3-2.2 1.5.4 1.3-.7.4-1.5Z"/><circle cx="8" cy="8" r="1.8"/></svg>',
};

export function icon(name: IconName): string {
  return `<span class="icon icon-${name}">${icons[name]}</span>`;
}
