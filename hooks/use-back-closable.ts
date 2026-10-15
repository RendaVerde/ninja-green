"use client";

import { useCallback, useEffect, useId, useRef } from "react";

const overlayStateKey = "__ninjaGreenOverlay";

export function useBackClosable(open: boolean, onClose: () => void) {
  const reactId = useId();
  const entryIdRef = useRef(`overlay-${reactId}`);
  const entryActiveRef = useRef(false);
  const unmountTimerRef = useRef<number | null>(null);
  const onCloseRef = useRef(onClose);

  const ownsTopEntry = useCallback(
    () => window.history.state?.[overlayStateKey] === entryIdRef.current,
    [],
  );

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const handlePopState = (event: PopStateEvent) => {
      if (
        !entryActiveRef.current ||
        event.state?.[overlayStateKey] === entryIdRef.current
      )
        return;

      entryActiveRef.current = false;
      onCloseRef.current();
    };

    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, []);

  useEffect(() => {
    if (open && !entryActiveRef.current) {
      if (!ownsTopEntry()) {
        window.history.pushState(
          { ...window.history.state, [overlayStateKey]: entryIdRef.current },
          "",
          window.location.href,
        );
      }
      entryActiveRef.current = true;
      return;
    }

    if (!open && entryActiveRef.current) {
      const shouldGoBack = ownsTopEntry();
      entryActiveRef.current = false;
      if (shouldGoBack) window.history.back();
    }
  }, [open, ownsTopEntry]);

  useEffect(() => {
    if (unmountTimerRef.current) {
      window.clearTimeout(unmountTimerRef.current);
      unmountTimerRef.current = null;
    }

    return () => {
      unmountTimerRef.current = window.setTimeout(() => {
        if (!entryActiveRef.current || !ownsTopEntry()) return;
        entryActiveRef.current = false;
        window.history.back();
      }, 0);
    };
  }, [ownsTopEntry]);

  const close = useCallback(() => {
    if (entryActiveRef.current) {
      const shouldGoBack = ownsTopEntry();
      entryActiveRef.current = false;
      onCloseRef.current();
      if (shouldGoBack) window.history.back();
      return;
    }
    onCloseRef.current();
  }, [ownsTopEntry]);

  const onOpenChange = useCallback((nextOpen: boolean) => {
    if (!nextOpen) close();
  }, [close]);

  return { close, onOpenChange };
}
