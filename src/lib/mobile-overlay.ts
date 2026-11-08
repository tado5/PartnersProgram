let lockCount = 0;
let restoreBody: (() => void) | undefined;

function lockBodyScroll() {
  if (lockCount === 0) {
    const body = document.body;
    const x = window.scrollX;
    const y = window.scrollY;
    const properties = ["position", "top", "left", "width", "overflow", "padding-right"];
    const previous = properties.map((property) => ({
      property,
      value: body.style.getPropertyValue(property),
      priority: body.style.getPropertyPriority(property),
    }));
    const scrollbarWidth = window.innerWidth - document.documentElement.clientWidth;
    const paddingRight = getComputedStyle(body).paddingRight;

    // overflow:hidden alone does not reliably lock the document on iOS.
    body.style.position = "fixed";
    body.style.top = `${-y}px`;
    body.style.left = `${-x}px`;
    body.style.width = "100%";
    body.style.overflow = "hidden";
    if (scrollbarWidth > 0) body.style.paddingRight = `calc(${paddingRight} + ${scrollbarWidth}px)`;

    restoreBody = () => {
      for (const { property, value, priority } of previous) {
        if (value) body.style.setProperty(property, value, priority);
        else body.style.removeProperty(property);
      }
      window.scrollTo({ left: x, top: y, behavior: "instant" });
    };
  }
  lockCount++;
  return () => {
    lockCount--;
    if (lockCount === 0) {
      restoreBody?.();
      restoreBody = undefined;
    }
  };
}

export function prepareMobileOverlay(element: HTMLElement) {
  const unlock = lockBodyScroll();
  const viewport = window.visualViewport;
  let frame = 0;

  function update() {
    // Let native pinch zoom work without shrinking/repositioning the overlay.
    if (viewport && Math.abs(viewport.scale - 1) < 0.01) {
      element.style.setProperty("--overlay-top", `${viewport.offsetTop}px`);
      element.style.setProperty("--overlay-height", `${viewport.height}px`);
    } else {
      element.style.removeProperty("--overlay-top");
      element.style.removeProperty("--overlay-height");
    }
  }
  function scheduleUpdate() {
    cancelAnimationFrame(frame);
    frame = requestAnimationFrame(update);
  }

  update();
  viewport?.addEventListener("resize", scheduleUpdate);
  viewport?.addEventListener("scroll", scheduleUpdate);
  window.addEventListener("resize", scheduleUpdate);

  return () => {
    cancelAnimationFrame(frame);
    viewport?.removeEventListener("resize", scheduleUpdate);
    viewport?.removeEventListener("scroll", scheduleUpdate);
    window.removeEventListener("resize", scheduleUpdate);
    element.style.removeProperty("--overlay-top");
    element.style.removeProperty("--overlay-height");
    unlock();
  };
}
