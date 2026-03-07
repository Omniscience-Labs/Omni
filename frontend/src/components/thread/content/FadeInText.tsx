import React, { memo } from 'react';

interface FadeInTextProps {
  content: string;
  className?: string;
}

/**
 * Renders streaming text with per-word fade-in animation.
 *
 * Each word is wrapped in a <span>. When content grows (words appended),
 * React creates new DOM nodes for the new spans — the CSS animation
 * plays on mount, giving each word a subtle fade + rise effect.
 * Existing words keep their DOM nodes (animation already completed).
 *
 * Paired with useSmoothStream's word-boundary snapping, this ensures
 * only complete words ever appear, and each one fades in smoothly.
 */
export const FadeInText: React.FC<FadeInTextProps> = memo(({ content, className }) => {
  if (!content) return null;

  // Split into words and whitespace, preserving all whitespace runs.
  // e.g. "Hello  world\n" → ["Hello", "  ", "world", "\n"]
  const tokens = content.split(/(\s+)/);

  return (
    <div className={className}>
      {tokens.map((token, i) =>
        token ? (
          <span key={i} className="word-fade-in">
            {token}
          </span>
        ) : null
      )}
    </div>
  );
});

FadeInText.displayName = 'FadeInText';
