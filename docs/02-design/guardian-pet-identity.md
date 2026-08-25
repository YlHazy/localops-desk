# LocalOps Guardian Pet Identity

## Character

Working name: **小哨 / Sentry Otter**.

小哨 is a calm otter-robot field guardian, not a cartoon sysadmin and not a
server-health traffic light. The navy shell communicates dependable tooling;
the mineral-teal chest instrument represents observed evidence; the shield
tablet represents approval boundaries; and the server-rack satchel connects the
character to infrastructure without turning it into a noisy dashboard.

The reference concept is
[`generated-images/localops-guardian-pet-concept.png`](generated-images/localops-guardian-pet-concept.png).
It is a direction reference only. The generated file currently has an opaque
checkerboard background and the wrong dimensions, so it **must not be uploaded
as a Codex pet**.

The LocalOps compact companion renders
[`../../src/assets/localops-sentry-otter.png`](../../src/assets/localops-sentry-otter.png),
a genuine-alpha `1136 × 1385` cutout derived from that direction. It is approved
for the LocalOps UI only: the stable navy character carries product identity,
while the adjacent evidence dot and copy carry live server state. It remains
intentionally outside `pets/` because it does not meet the official `1536 ×
1872` sprite-sheet gate.

## Desktop application icon

The Windows application and tray use a separate close-up badge at
[`../../src/assets/localops-desktop-icon-master.png`](../../src/assets/localops-desktop-icon-master.png).
It preserves the porcelain otter face, navy guardian helmet, amber listening
beacons, and cyan evidence shield while removing the tablet, limbs, server bag,
and other details that disappear at 16–32 pixels. The opaque night-navy field is
intentional: generated transparency attempts produced painted checkerboards and
were rejected by pixel inspection rather than accepted as alpha.

`npm run assets:desktop-icons` deterministically creates `build/icon.png` at
256 × 256 and a four-size `build/icon.ico` for Windows. The master is product
artwork, not an installable Codex pet sprite and not a server-health indicator.

## Product role

The native Codex pet and the LocalOps compact companion deliberately have
different jobs:

| Surface | Represents | May do |
|---|---|---|
| Native Codex pet | Codex task lifecycle | Open the task and show Running, Needs input, Ready, or Blocked |
| LocalOps compact companion | Server evidence | Show signal freshness, bounded checks, and a safe discussion entry |
| LocalOps plugin | Bounded evidence tools | Read status, run one light check, read diagnostics, or prepare a dry-run plan |

Server health must never recolor or animate the native pet through private app
internals. A green-looking pet is not proof that a server is healthy.

## State direction for the official hatch flow

- **Running:** reviewing the shield tablet; slow chest-instrument pulse.
- **Needs input:** pauses and raises the tablet; amber ear indicator is visible.
- **Ready:** relaxed upright stance with a small teal confirmation blink.
- **Blocked:** sits safely with the tablet lowered; no red panic animation.
- **Reduced motion:** neutral alert pose with the tablet held at chest height.

These are visual directions for Codex's supported pet states, not a third-party
state API contract.

## Hatch prompt

Use Codex desktop **Settings > Pets > Create your own pet**, then provide this
prompt to the installed `hatch-pet` skill:

> Create a custom pet named “LocalOps 小哨”. Use
> `docs/02-design/generated-images/localops-guardian-pet-concept.png` only as a
> character reference, not as the final sprite. Preserve the calm compact
> otter-robot silhouette, deep navy shell, porcelain face, mineral-teal chest
> instrument, amber ear indicator, shield tablet, and server-rack satchel.
> Produce the supported Codex task states Running, Needs input, Ready, and
> Blocked, plus a clear reduced-motion still. Keep motion restrained and
> professional. Do not encode server-health status, alerts, text, logos,
> commands, or LocalOps permissions in the animation. Produce a genuine
> transparent sprite sheet that conforms to the current Codex pet format.

## Acceptance gate

Before installing or sharing the resulting asset:

1. Confirm the file is a genuine transparent PNG or WebP, exactly 1536 × 1872
   pixels and no larger than 20 MiB.
2. Preview every task state and reduced-motion behavior in Codex.
3. Confirm appearance changes do not imply LocalOps tool access.
4. Confirm the asset contains no host name, URL, IP, tenant identifier, secret,
   command, or customer data.
5. Keep the generated pet local unless the user separately approves sharing it.

The official OpenAI Pets documentation is the source of truth for current
creation and upload requirements: <https://learn.chatgpt.com/docs/pets>.
