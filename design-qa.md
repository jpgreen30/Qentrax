# Qentrax marketing design QA

- Approved references: `https://qentrax.jpgreen30.chatgpt.site/`, `/advertiser`, `/publisher`, `/blog`
- Tested implementation: `http://localhost:3000/`
- Route states tested: `/`, `/advertiser`, `/publisher`, `/blog`, `/#insights`, `/#deployments`, `/sign-in`, `/workspace` (unauthenticated redirect)
- Viewports: desktop 1440 x 1000, tablet 768 x 1024, mobile 390 x 844; device scale factor 1

## Mismatches and fixes

| Severity | Mismatch found | Fix | Result |
| --- | --- | --- | --- |
| P1 | The provisional cream marketing system did not match the approved dark Qentrax visual language. | Rebuilt the public page with the reference palette, Arial/Courier typography, 1180px shell, bordered grids, terminal/radar treatment, acid/cyan controls and responsive breakpoints. | Fixed |
| P1 | Qentrax Intelligence was absent. | Added an evidence-to-outcome transaction trace plus nine signal cards covering identity/contact verification, consent provenance, duplicate suppression, fraud/velocity, buyer eligibility, intent/quality, bidding/routing, closed-loop outcomes and traceable reason codes. Added an explicit statement that the system does not guarantee legal or regulatory compliance. | Fixed |
| P1 | Representative Deployments was absent. | Added life-insurance and home-services solar scenarios with challenge, configuration and measurement categories. Both are labeled representative/illustrative and make no client or performance claim. | Fixed |
| P1 | Display headings inherited browser bold weight. | Reset heading weight to align with the reference display treatment. | Fixed |
| P2 | Source navigation expected lower-page intelligence content. | Added an Intelligence anchor and verified the target at all widths. | Fixed |
| P1 | The advertiser, publisher and blog reference routes were missing. | Added all three routes with approved content, responsive layouts, working navigation, sign-in-backed CTAs, marketplace/source controls, quality evidence, workflows, reporting, onboarding and field-note content. | Fixed |
| P2 | Advertiser and publisher mobile navigation omitted the reference Register control. | Restored a compact mobile Register control while keeping the long navigation menu collapsed. | Fixed in pass 2 |
| P2 | The blog mobile category rail showed a native scrollbar and the headline wrapped too early. | Hid the native scrollbar without disabling scrolling and adjusted the mobile display scale to restore the reference composition. | Fixed in pass 2 |
| P3 | The supplied references link to separate dashboard previews and full article routes that were not provided as approved visual targets. | Dashboard CTAs safely enter the authenticated workspace; field-note links open a research contact action instead of claiming unbuilt articles exist. | Intentional, non-blocking |

## Visual evidence

- Reference baseline: `docs/design-reference/source-desktop-full.png`, `docs/design-reference/source-mobile-full.png`
- Intelligence: `docs/design-reference/implementation-desktop-intelligence.png`, `implementation-tablet-intelligence.png`, `implementation-mobile-intelligence.png`
- Deployments: `docs/design-reference/implementation-desktop-deployments.png`, `implementation-tablet-deployments.png`, `implementation-mobile-deployments.png`
- Route references: `source-advertiser-desktop.png`, `source-advertiser-mobile.png`, `source-publisher-desktop.png`, `source-publisher-mobile.png`, `source-blog-desktop.png`, `source-blog-mobile.png`
- Focused route comparisons: `source-{route}-{desktop|mobile}-top.png` and `implementation-{route}-{desktop|mobile}-top.png`; post-fix mobile evidence in `implementation-advertiser-mobile-fixed.png` and `implementation-blog-mobile-fixed.png`
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
- `/advertiser`, `/publisher` and `/blog` were checked at 1440 x 1000, 768 x 1024 and 390 x 844 with no horizontal overflow.
- Advertiser FAQ disclosure and blog category filtering were exercised in the rendered browser; both state changes passed and exposed the expected accessible state.
- Pass 2 focused comparisons confirmed the mobile Register control, clean horizontally scrollable category rail and corrected blog headline composition.

## Remaining differences

- The new intelligence content uses the approved reference design language while expanding beyond the shorter reference editorial cards to satisfy the canonical product requirements.
- Dashboard preview and individual Field Notes article designs were not among the three supplied visual targets and remain future routes; current CTAs do not represent them as completed production screens.

## Final result

final result: passed

No P0, P1 or P2 visual blockers remain. The landing page and the advertiser, publisher and blog routes are responsive and materially consistent with their approved references.
