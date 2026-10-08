"use client";

import { useCallback, useEffect, useId, useRef } from "react";

const overlayStateKey = "__ninjaGreenOverlay";

export function useBackClosable(open: boolean, onClose: () => void) {
  const reactId = useId();
  const entryIdRef = useRef(`overlay-${reactId}`);
  const entryActiveRef = useRef(false);
  const onCloseRef = useRef(onClose);

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (!entryActiveRef.current || event.state?.[overlayStateKey] === entryIdRef.current) return;
      entryActiveRef.current = false;
      onCloseRef.current();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (open && !entryActiveRef.current) {
      window.history.pushState(
        { ...window.history.state, [overlayStateKey]: entryIdRef.current },
        "",
        window.location.href,
      );
      entryActiveRef.current = true;
      return;
    }

    if (!open && entryActiveRef.current) {
      entryActiveRef.current = false;
      window.history.back();
    }
  }, [open]);

  const close = useCallback(() => {
    if (entryActiveRef.current) {
      window.history.back();
      return;
    }
    onCloseRef.current();
  }, []);

  const onOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) close();
  }, [close]);

  return { close, onOpenChange };
}
