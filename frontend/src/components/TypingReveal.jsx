import { useEffect, useRef, useState } from "react";
import Markdown from "../utils/markdown.jsx";

/**
 * Reveals `text` progressively, a chunk of characters at a time, to give
 * the impression of a streaming response (the backend currently returns
 * the full answer in one shot, so this is a client-side typing effect
 * rather than true token streaming).
 */
export default function TypingReveal({ text, enabled, onDone }) {
  const [visibleChars, setVisibleChars] = useState(enabled ? 0 : text.length);
  const doneRef = useRef(!enabled);

  useEffect(() => {
    if (!enabled) {
      setVisibleChars(text.length);
      return undefined;
    }
    const prefersReducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
    if (prefersReducedMotion) {
      setVisibleChars(text.length);
      doneRef.current = true;
      onDone?.();
      return undefined;
    }

    let raf;
    let idx = 0;
    // Reveal a handful of characters per frame - fast enough to feel snappy
    // even for long answers, slow enough to read as "typing".
    const chunk = Math.max(2, Math.round(text.length / 90));

    function step() {
      idx += chunk;
      setVisibleChars(Math.min(idx, text.length));
      if (idx < text.length) {
        raf = requestAnimationFrame(step);
      } else if (!doneRef.current) {
        doneRef.current = true;
        onDone?.();
      }
    }
    raf = requestAnimationFrame(step);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, enabled]);

  const visibleText = text.slice(0, visibleChars);
  const isTyping = enabled && visibleChars < text.length;

  return (
    <div className={isTyping ? "typing-caret" : ""}>
      <Markdown text={visibleText} />
    </div>
  );
}
