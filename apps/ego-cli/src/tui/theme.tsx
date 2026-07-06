/** @jsxImportSource @opentui/solid */
import { RGBA } from "@opentui/core";
import { createContext, useContext, type JSX } from "solid-js";

export type EgoTheme = {
  primary: RGBA;
  secondary: RGBA;
  accent: RGBA;
  error: RGBA;
  warning: RGBA;
  success: RGBA;
  info: RGBA;
  text: RGBA;
  textMuted: RGBA;
  selectedListItemText: RGBA;
  background: RGBA;
  backgroundPanel: RGBA;
  backgroundElement: RGBA;
  backgroundMenu: RGBA;
  border: RGBA;
  borderActive: RGBA;
  borderSubtle: RGBA;
  diffAdded: RGBA;
  diffRemoved: RGBA;
  diffContext: RGBA;
  diffHunkHeader: RGBA;
  diffHighlightAdded: RGBA;
  diffHighlightRemoved: RGBA;
  diffAddedBg: RGBA;
  diffRemovedBg: RGBA;
  diffContextBg: RGBA;
  diffLineNumber: RGBA;
  diffAddedLineNumberBg: RGBA;
  diffRemovedLineNumberBg: RGBA;
  markdownText: RGBA;
  markdownHeading: RGBA;
  markdownLink: RGBA;
  markdownLinkText: RGBA;
  markdownCode: RGBA;
  markdownBlockQuote: RGBA;
  markdownEmph: RGBA;
  markdownStrong: RGBA;
  markdownHorizontalRule: RGBA;
  markdownListItem: RGBA;
  markdownListEnumeration: RGBA;
  markdownImage: RGBA;
  markdownImageText: RGBA;
  markdownCodeBlock: RGBA;
  syntaxComment: RGBA;
  syntaxKeyword: RGBA;
  syntaxFunction: RGBA;
  syntaxVariable: RGBA;
  syntaxString: RGBA;
  syntaxNumber: RGBA;
  syntaxType: RGBA;
  syntaxOperator: RGBA;
  syntaxPunctuation: RGBA;
  thinkingOpacity: number;

  panel: RGBA;
  panelAlt: RGBA;
  primaryDim: RGBA;
  muted: RGBA;
  danger: RGBA;
};

function hex(value: string): RGBA {
  const normalized = value.replace("#", "");
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return RGBA.fromInts(r, g, b, 255);
}

export function tint(color: RGBA, alpha: number): RGBA {
  return RGBA.fromValues(color.r, color.g, color.b, Math.max(0, Math.min(1, color.a * alpha)));
}

export function selectedForeground(theme: EgoTheme, bg?: RGBA): RGBA {
  const target = bg ?? theme.primary;
  const luminance = target.r * 0.299 + target.g * 0.587 + target.b * 0.114;
  return luminance > 0.5 ? theme.background : theme.text;
}

export const EmptyBorder = {
  topLeft: "",
  bottomLeft: "",
  vertical: "",
  topRight: "",
  bottomRight: "",
  horizontal: " ",
  bottomT: "",
  topT: "",
  cross: "",
  leftT: "",
  rightT: "",
};

export const SplitBorder = {
  border: ["left" as const, "right" as const],
  customBorderChars: {
    ...EmptyBorder,
    vertical: "┃",
  },
};

export const egoOpencodeTheme: EgoTheme = (() => {
  const darkStep1 = hex("#0a0a0a");
  const darkStep2 = hex("#141414");
  const darkStep3 = hex("#1e1e1e");
  const darkStep6 = hex("#3c3c3c");
  const darkStep7 = hex("#484848");
  const darkStep8 = hex("#606060");
  const darkStep9 = hex("#fab283");
  const darkStep11 = hex("#808080");
  const darkStep12 = hex("#eeeeee");
  const theme = {
    primary: darkStep9,
    secondary: hex("#5c9cf5"),
    accent: hex("#9d7cd8"),
    error: hex("#e06c75"),
    warning: hex("#f5a742"),
    success: hex("#7fd88f"),
    info: hex("#56b6c2"),
    text: darkStep12,
    textMuted: darkStep11,
    selectedListItemText: darkStep1,
    background: darkStep1,
    backgroundPanel: darkStep2,
    backgroundElement: darkStep3,
    backgroundMenu: darkStep2,
    border: darkStep7,
    borderActive: darkStep8,
    borderSubtle: darkStep6,
    diffAdded: hex("#4fd6be"),
    diffRemoved: hex("#c53b53"),
    diffContext: hex("#828bb8"),
    diffHunkHeader: hex("#828bb8"),
    diffHighlightAdded: hex("#b8db87"),
    diffHighlightRemoved: hex("#e26a75"),
    diffAddedBg: hex("#20303b"),
    diffRemovedBg: hex("#37222c"),
    diffContextBg: darkStep2,
    diffLineNumber: hex("#8f8f8f"),
    diffAddedLineNumberBg: hex("#1b2b34"),
    diffRemovedLineNumberBg: hex("#2d1f26"),
    markdownText: darkStep12,
    markdownHeading: hex("#9d7cd8"),
    markdownLink: darkStep9,
    markdownLinkText: hex("#56b6c2"),
    markdownCode: hex("#7fd88f"),
    markdownBlockQuote: hex("#e5c07b"),
    markdownEmph: hex("#e5c07b"),
    markdownStrong: hex("#f5a742"),
    markdownHorizontalRule: darkStep11,
    markdownListItem: darkStep9,
    markdownListEnumeration: hex("#56b6c2"),
    markdownImage: darkStep9,
    markdownImageText: hex("#56b6c2"),
    markdownCodeBlock: hex("#7fd88f"),
    syntaxComment: darkStep11,
    syntaxKeyword: hex("#9d7cd8"),
    syntaxFunction: hex("#5c9cf5"),
    syntaxVariable: darkStep12,
    syntaxString: hex("#7fd88f"),
    syntaxNumber: hex("#e5c07b"),
    syntaxType: hex("#56b6c2"),
    syntaxOperator: darkStep12,
    syntaxPunctuation: darkStep11,
    thinkingOpacity: 0.6,
  };
  return {
    ...theme,
    panel: theme.backgroundPanel,
    panelAlt: theme.backgroundElement,
    primaryDim: theme.borderActive,
    muted: theme.textMuted,
    danger: theme.error,
  };
})();

export type EgoTuiTheme = EgoTheme;

const ThemeContext = createContext<EgoTheme>();

export function TuiThemeProvider(props: { children: JSX.Element }): JSX.Element {
  return <ThemeContext.Provider value={egoOpencodeTheme}>{props.children}</ThemeContext.Provider>;
}

export function useTuiTheme(): EgoTheme {
  const value = useContext(ThemeContext);
  if (!value) {
    throw new Error("TuiThemeProvider is missing");
  }
  return value;
}
