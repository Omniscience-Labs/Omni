'use client';

import { useRef, useSyncExternalStore, useEffect, useLayoutEffect } from 'react';

// Reveal speed adapts based on how far behind the display is
const BASE_CHARS_PER_SECOND = 250;
const MAX_CHARS_PER_SECOND = 1200;
const CATCH_UP_THRESHOLD = 80; // buffer (chars) before we start accelerating

class SmoothStreamStore {
  private targetText = '';
  private revealedPos = 0;    // fractional character position (internal timer)
  private displayedLen = 0;   // word-boundary-snapped length (what React sees)
  private lastTickTime = 0;
  private animationId: number | null = null;
  private listeners = new Set<() => void>();
  private enabled = true;

  subscribe = (listener: () => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = () => this.displayedLen;

  private notify() {
    this.listeners.forEach(l => l());
  }

  /**
   * Snap a fractional position to the last clean word boundary.
   * A "word boundary" is any position where the character is whitespace,
   * so complete words (including trailing punctuation) appear as a unit.
   * Never regresses behind what's already displayed.
   */
  private snapToWordBoundary(pos: number): number {
    const text = this.targetText;
    const len = text.length;
    const intPos = Math.min(Math.floor(pos), len);

    if (intPos >= len) return len;
    if (intPos <= 0) return 0;

    // If sitting on whitespace, this is already a clean break
    const ch = text[intPos];
    if (ch === ' ' || ch === '\n' || ch === '\r' || ch === '\t') {
      return intPos;
    }

    // Walk backward to find the last whitespace
    let p = intPos;
    while (p > 0) {
      const prev = text[p - 1];
      if (prev === ' ' || prev === '\n' || prev === '\r' || prev === '\t') {
        break;
      }
      p--;
    }

    // Never regress behind already-displayed text
    if (p < this.displayedLen) {
      return this.displayedLen;
    }

    return p;
  }

  private tick = () => {
    if (!this.enabled) return;

    const now = performance.now();
    const targetLen = this.targetText.length;

    // If internal counter has caught up, finalize display
    if (this.revealedPos >= targetLen) {
      if (this.displayedLen < targetLen) {
        this.displayedLen = targetLen;
        this.notify();
      }
      this.animationId = null;
      return;
    }

    // First tick: just record time, don't jump
    if (this.lastTickTime === 0) {
      this.lastTickTime = now;
      this.animationId = requestAnimationFrame(this.tick);
      return;
    }

    const dt = (now - this.lastTickTime) / 1000; // seconds
    this.lastTickTime = now;

    // Adaptive speed: ramp up smoothly when buffer grows
    const buffer = targetLen - this.revealedPos;
    let speed = BASE_CHARS_PER_SECOND;
    if (buffer > CATCH_UP_THRESHOLD) {
      const excess = buffer - CATCH_UP_THRESHOLD;
      speed = Math.min(
        MAX_CHARS_PER_SECOND,
        BASE_CHARS_PER_SECOND + excess * 3
      );
    }

    this.revealedPos = Math.min(this.revealedPos + speed * dt, targetLen);

    // Snap to word boundary — only notify React when display actually changes
    const newDisplayLen = this.snapToWordBoundary(this.revealedPos);
    if (newDisplayLen !== this.displayedLen) {
      this.displayedLen = newDisplayLen;
      this.notify();
    }

    if (this.revealedPos < targetLen || this.displayedLen < targetLen) {
      this.animationId = requestAnimationFrame(this.tick);
    } else {
      this.animationId = null;
    }
  };

  private startAnimation() {
    if (this.animationId !== null) return;
    this.lastTickTime = 0;
    this.animationId = requestAnimationFrame(this.tick);
  }

  private stopAnimation() {
    if (this.animationId !== null) {
      cancelAnimationFrame(this.animationId);
      this.animationId = null;
    }
  }

  update(newText: string, isEnabled: boolean) {
    this.enabled = isEnabled;

    if (!newText) {
      this.stopAnimation();
      this.targetText = '';
      this.revealedPos = 0;
      this.displayedLen = 0;
      this.lastTickTime = 0;
      this.notify();
      return;
    }

    if (!isEnabled) {
      this.stopAnimation();
      this.targetText = newText;
      this.revealedPos = newText.length;
      this.displayedLen = newText.length;
      this.notify();
      return;
    }

    const isContinuation = this.targetText.length > 0 && newText.startsWith(this.targetText);

    if (!isContinuation) {
      this.stopAnimation();
      this.revealedPos = 0;
      this.displayedLen = 0;
      this.lastTickTime = 0;
    }

    this.targetText = newText;

    if (this.revealedPos < newText.length) {
      this.startAnimation();
    }
  }

  getText() {
    return this.targetText.slice(0, this.displayedLen);
  }

  destroy() {
    this.stopAnimation();
    this.listeners.clear();
  }
}

export function useSmoothStream(
  text: string,
  enabled: boolean = true,
  _speed?: number
): string {
  const storeRef = useRef<SmoothStreamStore | null>(null);

  if (!storeRef.current) {
    storeRef.current = new SmoothStreamStore();
    storeRef.current.update(text, enabled);
  }

  const store = storeRef.current;

  useLayoutEffect(() => {
    store.update(text, enabled);
  }, [text, enabled]);

  useSyncExternalStore(
    store.subscribe,
    store.getSnapshot,
    store.getSnapshot
  );

  useEffect(() => {
    return () => {
      storeRef.current?.destroy();
    };
  }, []);

  return store.getText();
}
