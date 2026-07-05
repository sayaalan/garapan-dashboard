// Single source of truth for this site's theme.
//
// Edit `src/theme.json` to restyle the whole site. These tokens both (1)
// generate the site's CSS custom properties (`:root` light + `.dark`) and (2)
// are published as an inline <script type="application/zo-theme+json"> so the Zo
// app shell — the chat chrome rendered around this site in the Zo web app —
// mirrors the exact same look. One file, no drift between the two surfaces.
//
// Token names are the shadcn token set (background, foreground, primary, …),
// without the leading `--`. Light and dark each carry the full palette.

import theme from "../theme.json";

type TokenMap = Record<string, string>;

function cssVars(map: TokenMap): string {
  return Object.entries(map)
    .map(([name, value]) => `--${name}: ${value};`)
    .join("");
}

// Generate the variable blocks the app reads. `.dark` is toggled by the app's
// existing theme provider (it adds/removes the class on <html>).
const style = document.createElement("style");
style.id = "zo-theme-vars";
style.textContent = `:root{${cssVars(theme.light)}}\n.dark{${cssVars(theme.dark)}}`;
document.head.appendChild(style);

// Publish the spec for the Zo app shell's bridge to read. This is the same
// object that generated the CSS above, so the shell can't fall out of sync.
const declared = document.createElement("script");
declared.type = "application/zo-theme+json";
declared.textContent = JSON.stringify(theme);
document.head.appendChild(declared);
