'use client';

import { useEffect } from 'react';

/**
 * Turns the design's scroll-reveal on — and only once JavaScript is here to
 * turn it off again.
 *
 * The stylesheet leaves `.reveal` visible by default. This arms the animation by
 * setting `data-reveal` on the wrapper, which is what makes the hidden state
 * apply at all, then reveals each block as it comes into view. If this component
 * never runs, the page is simply a page with no animation — never a blank one.
 */
export function Reveal() {
  useEffect(() => {
    const root = document.querySelector<HTMLElement>('.mk');
    if (!root) return;

    const targets = Array.from(root.querySelectorAll<HTMLElement>('.reveal'));
    // Anything already on screen is revealed immediately, so the first viewport
    // never animates in after the fact.
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) {
            e.target.classList.add('on');
            io.unobserve(e.target);
          }
        }
      },
      { rootMargin: '0px 0px -12% 0px' },
    );

    root.dataset.reveal = '';
    for (const el of targets) {
      if (el.getBoundingClientRect().top < window.innerHeight) el.classList.add('on');
      else io.observe(el);
    }
    return () => io.disconnect();
  }, []);

  return null;
}
