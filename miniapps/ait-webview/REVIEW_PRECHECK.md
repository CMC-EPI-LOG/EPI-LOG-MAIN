# App in Toss Review Precheck (AI-Soom)

Date: 2026-02-26

## Scope
- Miniapp visible branding update
- Granite brand config review
- Resubmission precheck notes

## Changes Applied
1. Visible brand text updated to `아이숨`
- `src/pages/Home.tsx`
  - Header logo alt: `아이숨 로고`
  - Header brand label: `아이숨`

2. Granite brand display name updated
- `granite.config.ts`
  - `brand.displayName`: `아이숨`
  - `brand.icon`: `https://www.ai-soom.site/icon.png` (already updated)

## Verification
1. Lint
- Command: `npm run lint`
- Result: pass

2. Build
- Command: `npm run build`
- Result: pass

## Submission Checklist
- [x] Miniapp UI shows `아이숨` consistently
- [x] Granite `brand.displayName` matches visible brand
- [x] Brand icon URL points to current production domain
- [ ] App in Toss console `appName` alignment check before submission

Note: `appName` is an app identifier and must match the value configured in the App in Toss console.
