# Qentrax marketing design QA

- Approved reference: `https://qentrax.jpgreen30.chatgpt.site/`
- Tested implementation: `http://localhost:3000/`
- Route states tested: `/`, `/#insights`, `/#deployments`, `/sign-in`, `/workspace` (unauthenticated redirect)
- Viewports: desktop 1440 x 1000, tablet 768 x 1024, mobile 390 x 844; device scale factor 1

## Mismatches and fixes

| Severity | Mismatch found | Fix | Result |
| --- | --- | --- | --- |
| P1 | The provisional cream marketing system did not match the approved dark Qentrax visual language. | Rebuilt the public page with the reference palette, Arial/Courier typography, 1180px shell, bordered grids, terminal/radar treatment, acid/cyan controls and responsive breakpoints. | Fixed |
| P1 | Qentrax Intelligence was absent. | Added an evidence-to-outcome transaction trace plus nine signal cards covering identity/contact verification, consent provenance, duplicate suppression, fraud/velocity, buyer eligibility, intent/quality, bidding/routing, closed-loop outcomes and traceable reason codes. Added an explicit statement that the system does not guarantee legal or regulatory compliance. | Fixed |
| P1 | Representative Deployments was absent. | Added life-insurance and home-services solar scenarios with challenge, configuration and measurement categories. Both are labeled representative/illustrative and make no client or performance claim. | Fixed |
| P1 | Display headings inherited browser bold weight. | Reset heading weight to align with the reference display treatment. | Fixed |
| P2 | Source navigation expected lower-page intelligence content. | Added an Intelligence anchor and verified the target at all widths. | Fixed |
| P3 | The reference exposes dedicated advertiser, publisher and blog destinations that are not yet product-complete. | Kept advertiser/publisher navigation scoped to the working network section and mapped Intelligence to the new section instead of introducing broken or placeholder routes. | Intentional, non-blocking |

## Visual evidence

- Reference baseline: `docs/design-reference/source-desktop-full.png`, `docs/design-reference/source-mobile-full.png`
- Intelligence: `docs/design-reference/implementation-desktop-intelligence.png`, `implementation-tablet-intelligence.png`, `implementation-mobile-intelligence.png`
- Deployments: `docs/design-reference/implementation-desktop-deployments.png`, `implementation-tablet-deployments.png`, `implementation-mobile-deployments.png`
- Evidence images are local QA artifacts and intentionally excluded from Git to keep the repository lightweight.

## Responsive and interaction verification

- Desktop 1440 x 1000: both sections preserve the reference two-column headings, four-step trace, three-column intelligence grid and two-column deployment grid.
- Tablet 768 x 1024: trace becomes a two-by-two grid, intelligence cards become two columns and deployment cards stack.
- Mobile 390 x 844: all content becomes single-column, case sub-sections and metrics reflow, and the permanent transaction/reason trail remains readable.
- No horizontal overflow: document `scrollWidth` equaled `clientWidth` at all three widths.
- Required copy and both representative scenarios were found in the rendered DOM at every viewport.
- `/sign-in` rendered its email control; unauthenticated `/workspace` redirected to `/sign-in`.
- Browser logs contained development HMR messages only; no warning or error entries were observed.
- Reduced-motion handling remains enabled through `prefers-reduced-motion`.

## Remaining differences

- Dedicated advertiser, publisher and blog product routes remain deferred to their authenticated vertical slices. The public page uses working in-page destinations and does not represent placeholders as complete features.
- The new intelligence content uses the approved reference design language while expanding beyond the shorter reference editorial cards to satisfy the canonical product requirements.

## Final result

final result: passed

No P0, P1 or P2 visual blockers remain. The two required sections are present, responsive and materially consistent with the approved reference.
