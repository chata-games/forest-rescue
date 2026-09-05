# Campaign world-map nodes

`assets/campaign-world-map-wide.png` (1774x887) has ten numbered stone discs
painted into it. `levels/campaign.json` places each level with a normalized
`mapPosition` (x/width, y/height). The browser adds an invisible semantic button
over each assigned disc. It does not draw a second marker.

## Disc centres

| Disc | Landmark | x | y | Level |
|---|---|---|---|---|
| 1 | Meadow with fence, lower left | 0.324 | 0.862 | `01-meadows-edge` |
| 2 | Old stump, lower centre | 0.454 | 0.731 | `02-old-stump-crossroads` |
| 3 | River with willows | 0.373 | 0.575 | `03-whispering-river` |
| 4 | Dark hollow with mushrooms, left | 0.311 | 0.443 | `04-mushroom-hollow` |
| 5 | Sawmill, centre | 0.578 | 0.575 | `05-sawmill-clearing` |
| 6 | Burnt scar with embers, lower right | 0.727 | 0.696 | `06-ashfall-scar` |
| 7 | Rocky pass, right | 0.773 | 0.409 | `07-boulder-pass` |
| 8 | Treehouse with rope bridges, upper right | 0.775 | 0.220 | unassigned, reserved for level 8 |
| 9 | Glowing gate with lanterns, upper left | 0.362 | 0.227 | unassigned, reserved for level 9 |
| 10 | Heartwood tree with the blue flame, top centre | 0.512 | 0.307 | unassigned, reserved for level 10 |

The painted trail runs 1 -> 2, 1 -> 3 -> 4, 5 -> 6 -> 7 -> 8, and 9 -> 10.

## Measuring

Centres are the centroid of stone-coloured pixels (R>150, G>140, B>110, low
saturation) inside a 110 px window around each disc, divided by image width and
height. Re-measure with the same method if the map art is regenerated, then
update `levels/campaign.json` and this table together.

Tracker ticket for discs 8-10: parent repo Rohrpost ticket RP-5ynr9r,
"Campaign map: assign discs 8-10 to levels 8-10 when authored".
