import { lotusLogoPath } from "../assets/brand.js";

export function renderLotusLogo(): string {
  return String.raw`<div class="lotus-mark" aria-hidden="true">
          <img class="lotus-image" src="${lotusLogoPath}" alt="EGO-Graph 紫莲花 logo" />
        </div>`;
}
