// The notes page: four parts that stay closed until a reader opens one, a link into a closed part
// that opens it, and two hidden vouch cards that flip at the same moment, once both are in.

// iOS Safari has needed a touch listener on the page before it shows :active on a tap, which
// the buttons use for press feedback. The listener is passive and does nothing else.
document.addEventListener('touchstart', () => {}, { passive: true });

const reveal = document.getElementById('reveal');
const revealBtn = document.getElementById('reveal-btn');
const revealNote = document.getElementById('reveal-note');

if (reveal && revealBtn) {
  const fronts = reveal.querySelectorAll('.card-front');
  const backs = reveal.querySelectorAll('.card-back');
  const setOpen = (open) => {
    reveal.classList.toggle('is-open', open);
    fronts.forEach((el) => el.setAttribute('aria-hidden', String(open)));
    backs.forEach((el) => el.setAttribute('aria-hidden', String(!open)));
    // The label names the next action, so the button carries no aria-pressed state:
    // "Seal them again, pressed" would contradict itself.
    revealBtn.textContent = open ? 'Seal them again' : 'Both are in. Reveal them.';
    if (revealNote) {
      revealNote.textContent = open
        ? 'Both opened at the same moment, so neither could be written to match the other.'
        : 'An example. Neither person could read the other’s before writing.';
    }
  };
  setOpen(false);
  revealNote?.setAttribute('aria-live', 'polite'); // after the first setOpen, so load is silent
  revealBtn.addEventListener('click', () => setOpen(!reveal.classList.contains('is-open')));
}

// The header's hairline shows once anything has scrolled under it.
const header = document.querySelector('.site-header');
if (header) {
  const mark = () => header.classList.toggle('is-scrolled', window.scrollY > 0);
  window.addEventListener('scroll', mark, { passive: true });
  mark();
}

// A link to something inside a closed part opens that part first, then goes to it.
function openTarget() {
  let id = '';
  try {
    id = decodeURIComponent(location.hash.slice(1));
  } catch {
    return;
  }
  const target = id && document.getElementById(id);
  if (!target) return;
  const fold = target.closest('details');
  if (fold && !fold.open) fold.open = true;
  target.scrollIntoView();
}
openTarget();
window.addEventListener('hashchange', openTarget);
