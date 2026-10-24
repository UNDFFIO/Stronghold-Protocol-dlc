import { useLayoutEffect, useRef, useState } from '../../vendor/hooks.module.js';

export function usePanelDrag(open = true, inset = 0) {
  const panelRef = useRef(null);
  const dragRef = useRef(null);
  const positionRef = useRef(null);
  const [position, setPosition] = useState(null);
  const movePanel = (x, y) => {
    const rect = panelRef.current?.getBoundingClientRect();
    if (!rect) return;
    const next = {
      x: Math.max(inset, Math.min(x, window.innerWidth - rect.width - inset)),
      y: Math.max(inset, Math.min(y, window.innerHeight - rect.height - inset)),
    };
    positionRef.current = next;
    setPosition((prev) => prev?.x === next.x && prev?.y === next.y ? prev : next);
  };
  useLayoutEffect(() => {
    if (!open) { dragRef.current = null; return; }
    const fit = () => {
      const pos = positionRef.current;
      if (pos) movePanel(pos.x, pos.y);
    };
    fit();
    window.addEventListener('resize', fit);
    const observer = typeof ResizeObserver === 'function' ? new ResizeObserver(fit) : null;
    if (panelRef.current) observer?.observe(panelRef.current);
    return () => { window.removeEventListener('resize', fit); observer?.disconnect(); };
  }, [open, inset]);
  const startDrag = (event) => {
    if (event.button !== 0 || event.target.closest('button') || dragRef.current) return;
    const rect = panelRef.current.getBoundingClientRect();
    dragRef.current = { id: event.pointerId, dx: event.clientX - rect.left, dy: event.clientY - rect.top };
    event.currentTarget.setPointerCapture(event.pointerId);
    movePanel(rect.left, rect.top);
    event.preventDefault();
    event.stopPropagation();
  };
  const dragPanel = (event) => {
    const drag = dragRef.current;
    if (!drag || drag.id !== event.pointerId) return;
    movePanel(event.clientX - drag.dx, event.clientY - drag.dy);
    event.stopPropagation();
  };
  const endDrag = (event) => {
    if (dragRef.current?.id !== event.pointerId) return;
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    event.stopPropagation();
  };
  const cancelDrag = () => { dragRef.current = null; };
  return { panelRef, position, startDrag, dragPanel, endDrag, cancelDrag };
}
