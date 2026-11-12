# Nihon v2 accessibility baseline

The Fastify/React/MySQL-only application now runs a **real Chromium +
axe-core/Playwright** WCAG regression scan as part of `npm run test:e2e`.
This runs on the built production UI and an isolated disposable MySQL 8.4
database, not against the owner's real data.

## Audited views

Axe rules tagged `wcag2a`, `wcag2aa`, `wcag21a`, `wcag21aa`
and `wcag22aa` must report **zero violations** on the following states:

- MySQL installation wizard (before installation)
- Admin login, Admin vocabulary/deck editor, Settings, AI Studio
- Published vocabulary search and public deck listing/detail
- Guest practice before enrollment, and an SRS flashcard after flipping
- Learner registration, learner login, account security/password change
- Mobile home, vocabulary, decks, practice and learner login at 390px

The broader E2E suite also checks layout overflow at 320/390/768px,
successful Admin/learner actions, guest SRS review, and API outage recovery.

## Accessibility fixes

- Raised contrast for low-visibility secondary copy, captions, labels and
  notices over the application's cream, white and pale-green backgrounds
- A **Bỏ qua điều hướng** link is the first keyboard Tab stop and leads to
  the main content landmark, without having to traverse the navigation
- Visible focus outlines for links, buttons and form controls; SPA route
  navigation places focus on the main landmark and updates the document title
- Flashcard uses the **visible Japanese text as its accessible name**, not
  a conflicting `aria-label`. `aria-pressed` reflects whether its answer
  is revealed; Space flips the card with the same effect as a click

## Repeatable checks

```sh
cd app
npm ci
npx playwright install --with-deps chromium
npm run build
NIHON_MYSQL_TEST_URL='mysql://USER:TEST_PASSWORD@127.0.0.1:3306/nihon_qa' npm run test:e2e
```

The E2E script creates a unique disposable schema, deletes it afterward,
and refuses non-QA MySQL URL paths. The CI workflow provisions MySQL and
Chromium and runs this suite on branch commits and PR changes.

## What still needs human review

Automated checks are not a declaration of complete accessibility or a
certification of **WCAG 2.2 AA conformance**. Before public production:

- Verify screen reader journeys using NVDA/JAWS on Windows and VoiceOver on
  macOS/iOS, including live announcements as SRS cards change
- Manually inspect tab order, focus restoration around errors, and every
  confirmation dialog / destructive Admin action
- Test browser zoom at 200–400%, text spacing overrides, forced colors and
  reduced-motion settings with actual assistive technology
- Review Japanese reading pronunciation/lang tagging and tactile/mobile
  touch target sizes with relevant users
- Re-check new UI states and translated strings as features change

No production accounts, MySQL schema or previous v1 workspace were modified
by this accessibility pass.
