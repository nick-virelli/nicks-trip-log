// Behaviour for rendered trip articles: photo carousels, click-to-expand into the
// shared lightbox, and the sticky "which trip am I reading" header indicator.
// Used by js/map.js on the home page and self-initialises on static trip pages
// (body[data-page="trip"]), where the markup is already in the HTML.
window.TripUI = (function () {
  // Groups every trip photo (solo or within a carousel) by its data-group, so
  // clicking one opens the shared lightbox with just that group's photos as the
  // prev/next set - a carousel's siblings for a carousel image, or just itself
  // for a standalone photo.
  function initImageLightboxTriggers(root) {
    const groups = new Map();
    root.querySelectorAll(".lightbox-trigger").forEach((img) => {
      const key = img.dataset.group;
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)[parseInt(img.dataset.index, 10)] = img;
    });
    for (const imgs of groups.values()) {
      imgs.forEach((img, i) => {
        img.addEventListener("click", () => {
          window.TripLightbox.open(
            imgs.map((el) => ({ src: el.getAttribute("src"), caption: el.getAttribute("alt") })),
            i
          );
        });
      });
    }
  }

  // Manual setTimeout-stepped scroll (not native smooth-scroll or
  // requestAnimationFrame - see back-to-top button for why) for the carousel track.
  function smoothScrollTrack(track, targetLeft) {
    const startLeft = track.scrollLeft;
    const distance = targetLeft - startLeft;
    if (distance === 0) return;
    const duration = 300;
    const stepMs = 16;
    const steps = Math.max(1, Math.round(duration / stepMs));
    const easeOutCubic = (t) => 1 - Math.pow(1 - t, 3);
    let i = 0;
    (function tick() {
      i++;
      const t = Math.min(1, i / steps);
      track.scrollLeft = startLeft + distance * easeOutCubic(t);
      if (t < 1) setTimeout(tick, stepMs);
    })();
  }

  function initCarousels(root) {
    root.querySelectorAll(".carousel").forEach((carousel) => {
      const track = carousel.querySelector(".carousel-track");
      const counter = carousel.querySelector(".carousel-counter");
      const count = parseInt(carousel.dataset.count, 10);
      const prevBtn = carousel.querySelector(".carousel-prev");
      const nextBtn = carousel.querySelector(".carousel-next");

      function currentIndex() {
        return track.clientWidth ? Math.round(track.scrollLeft / track.clientWidth) : 0;
      }
      function updateCounter() {
        counter.textContent = `${Math.min(count, currentIndex() + 1)} / ${count}`;
      }
      function goTo(index) {
        const clamped = Math.max(0, Math.min(count - 1, index));
        smoothScrollTrack(track, clamped * track.clientWidth);
      }

      prevBtn.addEventListener("click", () => goTo(currentIndex() - 1));
      nextBtn.addEventListener("click", () => goTo(currentIndex() + 1));
      track.addEventListener("scroll", updateCounter, { passive: true });
    });
  }

  // Shows the trip you're currently reading in the header (desktop only - hidden
  // on mobile via CSS) once you've scrolled past its own heading, so you don't
  // have to scroll back up to remember which trip/date/place you're looking at.
  function initActiveTripIndicator() {
    const btn = document.getElementById("active-trip-indicator");
    if (!btn) return;
    const titleEl = document.getElementById("active-trip-title");
    const metaEl = document.getElementById("active-trip-meta");
    let current = null;

    function headerHeight() {
      return document.querySelector(".site-header")?.getBoundingClientRect().height || 65;
    }

    function update() {
      const headings = [...document.querySelectorAll("#post-display h2[data-trip-id]")];
      const offset = headerHeight();
      let active = null;
      for (const h of headings) {
        if (h.getBoundingClientRect().top <= offset) active = h;
      }
      if (!active) {
        btn.classList.remove("visible");
        current = null;
        return;
      }
      if (active !== current) {
        current = active;
        titleEl.textContent = active.dataset.tripTitle;
        metaEl.textContent = active.dataset.tripMeta;
      }
      btn.classList.add("visible");
    }

    // Plain throttle (not requestAnimationFrame, which is paused entirely on
    // hidden/backgrounded tabs) - cheap enough per-call that this is fine.
    let lastRun = 0;
    window.addEventListener(
      "scroll",
      () => {
        const now = Date.now();
        if (now - lastRun < 100) return;
        lastRun = now;
        update();
      },
      { passive: true }
    );
    update();

    btn.addEventListener("click", () => {
      if (!current) return;
      const y = current.getBoundingClientRect().top + window.scrollY - headerHeight() - 12;
      window.scrollTo(0, Math.max(0, y));
    });
  }

  function initStaticTripPage() {
    const root = document.getElementById("post-display");
    if (!root) return;
    initCarousels(root);
    initImageLightboxTriggers(root);
    initActiveTripIndicator();
  }

  if (document.body && document.body.dataset.page === "trip") {
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initStaticTripPage);
    else initStaticTripPage();
  }

  return { initCarousels, initImageLightboxTriggers, initActiveTripIndicator };
})();
