import { useLayoutEffect } from '../../vendor/hooks.module.js';

// Keep the corner's layout while hidden, so measuring it cannot alternate between hidden and visible.
export function useShopCornerVisibility(hudRef, barRef) {
  useLayoutEffect(() => {
    const hud = hudRef.current;
    const corner = hud?.querySelector('.gm__corner');
    if (!corner) return;
    const row = barRef.current?.querySelector('.shopbar__row');
    const update = () => {
      const a = corner.getBoundingClientRect();
      const b = row?.getBoundingClientRect();
      const covered = !!b && a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
      corner.classList.toggle('is-shop-covered', covered);
      corner.inert = covered;
    };
    update();
    const observer = new ResizeObserver(update);
    observer.observe(hud);
    observer.observe(corner);
    if (row) observer.observe(row);
    window.addEventListener('resize', update);
    return () => {
      observer.disconnect();
      window.removeEventListener('resize', update);
      corner.classList.remove('is-shop-covered');
      corner.inert = false;
    };
  }); // Rebind after each render: the bar/tab and optional corner buttons can be replaced.
}
