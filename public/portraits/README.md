# Character portraits

Drop the six named-character portraits here. Generic units (soldiers, brigands)
deliberately have none — identity belongs to named characters only.

Anything in `public/` is copied to the build root verbatim, so a file saved as
`public/portraits/rhea.webp` is served at `portraits/rhea.webp`.

## Expected files

| File | Character | Class | Facing |
| --- | --- | --- | --- |
| `rhea.webp` | Rhea | Lord — young commander, sword | right |
| `bertram.webp` | Bertram | Knight — scarred veteran, heavy plate, lance | right |
| `cass.webp` | Cass | Mercenary — fast duelist, cocky | right |
| `wren.webp` | Wren | Archer — quiet, watchful, green hood | right |
| `odile.webp` | Odile | Mage — violet robes, measured, faint magic glow | right |
| `garrow.webp` | Garrow | Enemy boss — blackened iron, fur mantle | **left** |

Portraits face the enemy: player units look right, enemies look left. If it's
easier to generate everything facing right, say so — mirroring enemies in CSS is
one line. That flips asymmetric details though (a left-cheek scar moves right),
so any character with a deliberate asymmetric signature should be generated
facing left directly.

## Specs

- **Size** 512×512, square. Downscaled in-game; the extra resolution covers
  high-DPI screens.
- **Crop** Head and shoulders, from mid-chest up. Head fills roughly the upper
  two-thirds.
- **Background** Flat solid `#10141c`. No gradient, no texture, no scenery.
- **No hands in frame.** Cropping at the shoulders avoids the thing AI portrait
  generation still gets visibly wrong.
- **Format** WebP preferred, PNG fine. Keep each under ~200 KB.
- **Palette** Muted, built on the UI colours so portraits and interface read as
  one product: `#4d8fe8` blue, `#e05a4a` red, `#ffc23d` gold, `#10141c` slate.

## Consistency

Generate **one** portrait you're happy with first, then feed that image back in
as a style reference for the other five. Six independently generated portraits
will each look fine and look like six different artists — which reads worse than
six mediocre ones in a single style.

## Missing files are fine

The game falls back cleanly when a portrait is absent, so it stays playable with
none, some, or all six present. Add them as you finish them.
