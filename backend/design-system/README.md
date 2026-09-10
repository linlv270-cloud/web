# Qideng design system source

`qideng-tokens.json` is the source of truth for the production admin site and WeChat mini program. The source is kept inside this project so a release archive can be installed, checked, and built without relying on sibling workspace directories.

Run `npm run design:sync` after changing a token. Generated CSS, WXSS, and TypeScript values must not be edited directly.

The binding rules, typography roles, component constraints, and acceptance criteria are defined in `docs/miniapp-vi-standard.md`.
