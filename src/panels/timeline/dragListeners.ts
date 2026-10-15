/**
 * Pointer drag helper for the timeline: registers pointermove/pointerup and also cleans up on
 * pointercancel and lostpointercapture, so a cancelled pointer (touch, system gesture, or losing
 * capture) doesn't leave stale listeners attached.
 *
 * `up` is called only on pointerup; cancel events just remove the listeners.
 */
export function dragListeners(
  el: Element,
  move: (ev: PointerEvent) => void,
  up: (ev: PointerEvent) => void,
): void {
  const cleanup = () => {
    el.removeEventListener("pointermove", move as EventListener);
    el.removeEventListener("pointerup", onUp as EventListener);
    el.removeEventListener("pointercancel", onCancel);
    el.removeEventListener("lostpointercapture", onCancel);
  };
  const onUp = (ev: PointerEvent) => {
    cleanup();
    up(ev);
  };
  const onCancel = () => cleanup();
  el.addEventListener("pointermove", move as EventListener);
  el.addEventListener("pointerup", onUp as EventListener);
  el.addEventListener("pointercancel", onCancel);
  el.addEventListener("lostpointercapture", onCancel);
}
