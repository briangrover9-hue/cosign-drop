// Star glyphs shared by the header, the charts and the lab.
// Every star on the page is the same five-point path on a 24 by 24 grid.

export const STAR_PATH =
  'M12 1.8l3.05 6.52 7.13.86-5.26 4.9 1.38 7.05L12 17.6l-6.3 3.53 1.38-7.05L1.82 9.18l7.13-.86z';

// Clip ids get a random prefix so rows built at runtime never collide with
// the static rows written into index.html.
const PREFIX = 'sc' + Math.random().toString(36).slice(2, 8);
let clipCount = 0;

// One star at x, filled from the left by `fill` (0 to 1). The clip rect carries
// data-star so setStarRow can move it later without rebuilding the SVG.
function star(x, fill, size, index) {
  const scale = size / 24;
  const id = `${PREFIX}-${++clipCount}`;
  const width = Math.max(0, Math.min(1, fill)) * 24;
  return (
    `<g transform="translate(${x} 0) scale(${scale})">` +
    `<path class="star-empty" d="${STAR_PATH}"/>` +
    `<clipPath id="${id}"><rect data-star="${index}" width="${width.toFixed(2)}" height="24"/></clipPath>` +
    `<path class="star-fill" d="${STAR_PATH}" clip-path="url(#${id})"/>` +
    `<path class="star-edge" d="${STAR_PATH}" vector-effect="non-scaling-stroke"/>` +
    `</g>`
  );
}

// A row of `count` stars showing `value` (for example 4.8 of 5), as an SVG string.
// Pass a label to expose it to screen readers; otherwise it is decorative.
export function starRow(value, { count = 5, size = 16, gap = 3, label = '', className = 'stars' } = {}) {
  const width = count * size + (count - 1) * gap;
  let body = '';
  for (let i = 0; i < count; i++) body += star(i * (size + gap), value - i, size, i);
  const a11y = label
    ? `role="img" aria-label="${label}"`
    : 'aria-hidden="true" focusable="false"';
  return `<svg class="${className}" viewBox="0 0 ${width} ${size}" ${a11y}>${body}</svg>`;
}

// Update a row made by starRow to show a new value, without rebuilding it.
export function setStarRow(svg, value) {
  svg.querySelectorAll('rect[data-star]').forEach((rect) => {
    const i = Number(rect.dataset.star);
    const fill = Math.max(0, Math.min(1, value - i));
    rect.setAttribute('width', (fill * 24).toFixed(2));
  });
}
