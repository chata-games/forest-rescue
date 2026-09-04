# Campaign world-map nodes

`assets/campaign-world-map.png` (1536x1024) has ten numbered stone discs painted
into it. `levels/campaign.json` places each level with a normalized `mapPosition`
(x/width, y/height). `src/campaign.js` draws a white disc with the level index
over that point on a 640x400 canvas, so the level index must match the painted
disc number.

## Disc centres

| Disc | Landmark | x | y | Level |
|---|---|---|---|---|
| 1 | Meadow with fence, lower left | 0.236 | 0.864 | `01-meadows-edge` |
| 2 | Old stump, lower centre | 0.406 | 0.745 | `02-old-stump-crossroads` |
| 3 | River with willows | 0.295 | 0.573 | `03-whispering-river` |
| 4 | Dark hollow with mushrooms, left | 0.214 | 0.448 | `04-mushroom-hollow` |
| 5 | Sawmill, centre | 0.572 | 0.579 | `05-sawmill-clearing` |
| 6 | Burnt scar with embers, lower right | 0.774 | 0.705 | `06-ashfall-scar` |
| 7 | Rocky pass, right | 0.831 | 0.428 | `07-boulder-pass` |
| 8 | Treehouse with rope bridges, upper right | 0.835 | 0.227 | unassigned, reserved for level 8 |
| 9 | Glowing gate with lanterns, upper left | 0.281 | 0.230 | unassigned, reserved for level 9 |
| 10 | Heartwood tree with the blue flame, top centre | 0.486 | 0.314 | unassigned, reserved for level 10 |

The painted trail runs 1 -> 2, 1 -> 3 -> 4, 5 -> 6 -> 7 -> 8, and 9 -> 10.

## Measuring

Centres are the centroid of stone-coloured pixels (R>150, G>140, B>110, low
saturation) inside a 110 px window around each disc, divided by image width and
height. Re-measure with the same method if the map art is regenerated, then
update `levels/campaign.json` and this table together.

Tracker ticket for discs 8-10: parent repo Rohrpost ticket RP-5ynr9r,
"Campaign map: assign discs 8-10 to levels 8-10 when authored".
