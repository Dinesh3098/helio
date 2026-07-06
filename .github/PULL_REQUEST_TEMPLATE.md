## Summary

<!-- What does this PR do, and why? Link the issue it closes if any. -->

Closes #

## Changes

<!-- Bullet the notable changes. Call out anything reviewers should focus on. -->

-

## Area

<!-- Check all that apply -->

- [ ] API (NestJS)
- [ ] Dashboard (Next.js)
- [ ] Chat widget
- [ ] Database migration
- [ ] CI/CD or Docker
- [ ] Documentation

## How was this tested?

<!-- Manual steps, curl commands, or screenshots. "pnpm build passes" alone is not testing. -->

## Checklist

- [ ] `pnpm lint`, `pnpm check-types`, and `pnpm build` pass locally
- [ ] Formatting applied (`pnpm format`)
- [ ] New environment variables documented in `.env.example` (and `.env.production.example` / `.env.ci.example` where relevant)
- [ ] Database changes ship as a TypeORM migration (never `synchronize`)
- [ ] No secrets, credentials, or generated files committed
- [ ] Breaking API changes are called out in the summary
