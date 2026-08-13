# @referralplatform/ui-components

ReferralPlatform's shared design system: `Button`, `Card` (+ `CardHeader`/`CardTitle`/`CardBody`),
`StatusBadge` (aliased as `Pill`), and `FormField`, built on [Radix UI](https://www.radix-ui.com/)
primitives, implementing the palette, typography, and 8px spacing scale from
`claude/ui-design.md` (see `src/tokens.css`).

## Usage

```tsx
import '@referralplatform/ui-components/dist/tokens.css'; // once, at app root
import { Button, Card, CardBody, StatusBadge, FormField } from '@referralplatform/ui-components';

<Card>
  <CardBody>
    <StatusBadge tone="attention" label="Awaiting your approval" />
    <Button variant="primary">Approve GP link</Button>
  </CardBody>
</Card>;
```

## Design rules encoded here (see claude/ui-design.md)

- Exactly one `variant="primary"` (accent-coloured) button per screen — everything else is
  `secondary` or `ghost`.
- Status is never colour-only: `StatusBadge` always pairs an icon and a text label with its tone.
- All spacing/colour/typography values come from CSS custom properties in `tokens.css`, never
  hardcoded in a component — retheming is a CSS change, not a component rewrite.
- Minimum touch target `48px` (`--rp-touch-target-min`) — larger than a typical consumer app,
  given the patient population's age range.

## Build / test

```bash
npm run build -w packages/ui-components
npm run test -w packages/ui-components
```
