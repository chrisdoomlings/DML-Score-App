---
name: pattern_modal_zindex_deviation
description: Phase 5 modal rebuild deviated from a literal z-index instruction so confetti/toast stay visible above the modal
metadata:
  type: project
---

The Phase 5 plan (`unified-hugging-cherny.md`) said the new `#dmls-modal`
needs "Explicit z-index above the existing toast (9999)/confetti layers."
Taken literally that means modal z-index > 9999/9998, i.e. the modal stacks
*on top of* toast and confetti.

That's functionally wrong: confetti bursts on the winner reveal and toast
messages (e.g. "Added to cart") both fire *while the modal is open* now that
the whole app lives inside it — if the modal actually out-ranked them,
they'd render invisibly behind the modal card.

**Resolution implemented:** modal z-index = 10000 (satisfies "above the old
9999/9998 baseline" literally), but toast and confetti were also bumped
above the modal (toast 10020, confetti 10010) so they stay visible while the
modal is open. See `extensions/score-tool/assets/dmls-score.css`'s `.dmls-toast`
and `#dmls-confetti` rules.

**How to apply:** if a future spec gives a z-index ordering that would hide
a transient feedback element (toast/confetti/etc.) behind a persistent
surface it's meant to appear over, prefer the functionally-correct ordering
and flag the deviation explicitly rather than following the literal
instruction — confirmed acceptable via [[project_achievements_rebuild]]'s
Phase 5 delivery, no pushback expected but not yet explicitly re-confirmed
by the user.

Also worth knowing: the modal's close (X) button was deliberately kept
*inside* the card bounds (`top:10px; right:10px`, not poking outside via a
negative offset) specifically because CLAUDE.md's mobile-first requirement
means the card can sit within only ~4vw of viewport margin on a phone — an
outside-poking close button risked being clipped on the narrowest screens.
