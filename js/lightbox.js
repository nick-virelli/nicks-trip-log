// Shared lightbox: enlarge an image in place with prev/next, share, download,
// print. Used by both the homepage (trip photos/carousels) and the Gallery page,
// so it operates on a generic list of {src, caption} rather than either page's
// own data model.
window.TripLightbox = (function () {
  let items = [];
  let index = 0;

  function esc(s) {
    return String(s == null ? "" : s)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
  }

  function absoluteUrl(relativeSrc) {
    return new URL(relativeSrc, window.location.href).href;
  }

  function update() {
    const item = items[index];
    if (!item) return;
    const imgEl = document.getElementById("lightbox-img");
    imgEl.src = item.src;
    imgEl.alt = item.caption || "";
    document.getElementById("lightbox-caption").textContent = item.caption || "";
    const dl = document.getElementById("lightbox-download");
    dl.href = item.src;
    dl.download = item.src.split("/").pop();
    const prevBtn = document.getElementById("lightbox-prev");
    const nextBtn = document.getElementById("lightbox-next");
    if (prevBtn) prevBtn.style.display = items.length > 1 ? "" : "none";
    if (nextBtn) nextBtn.style.display = items.length > 1 ? "" : "none";
  }

  function open(list, startIndex) {
    if (!list || !list.length) return;
    items = list;
    index = startIndex || 0;
    update();
    document.getElementById("lightbox").style.display = "flex";
  }

  function close() {
    const el = document.getElementById("lightbox");
    if (el) el.style.display = "none";
  }

  function step(delta) {
    if (!items.length) return;
    index = (index + delta + items.length) % items.length;
    update();
  }

  async function share() {
    const item = items[index];
    if (!item) return;
    const url = absoluteUrl(item.src);
    if (navigator.share) {
      try {
        await navigator.share({ title: item.caption || "", url });
        return;
      } catch (_) {
        return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      const btn = document.getElementById("lightbox-share");
      const original = btn.textContent;
      btn.textContent = "Link copied";
      setTimeout(() => (btn.textContent = original), 1500);
    } catch (_) {
      window.prompt("Copy this link:", url);
    }
  }

  function print() {
    const item = items[index];
    if (!item) return;
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(
      `<!doctype html><html><head><title>${esc(item.caption || "")}</title><style>body{margin:0;display:flex;align-items:center;justify-content:center;min-height:100vh;}img{max-width:100%;max-height:100vh;}</style></head><body><img src="${esc(
        absoluteUrl(item.src)
      )}"></body></html>`
    );
    win.document.close();
    win.onload = () => {
      win.focus();
      win.print();
    };
    const printImg = win.document.querySelector("img");
    if (printImg) printImg.onload = () => win.print();
  }

  function init() {
    const el = document.getElementById("lightbox");
    if (!el) return;
    document.getElementById("lightbox-close").addEventListener("click", close);
    document.getElementById("lightbox-prev").addEventListener("click", () => step(-1));
    document.getElementById("lightbox-next").addEventListener("click", () => step(1));
    document.getElementById("lightbox-share").addEventListener("click", share);
    document.getElementById("lightbox-print").addEventListener("click", print);
    el.addEventListener("click", (e) => {
      if (e.target.id === "lightbox") close();
    });
    document.addEventListener("keydown", (e) => {
      if (el.style.display === "none") return;
      if (e.key === "Escape") close();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
    });
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();

  return { open, close };
})();
