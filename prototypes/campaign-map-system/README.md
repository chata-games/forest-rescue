# Campaign map system prototype

PROTOTYPE — throw this code away after the decision is captured.

Question: how should the campaign map keep generated scenery reusable while routes, level nodes, locked/star/Challenge state, hit targets, and accessibility semantics remain programmatic?

Three structurally different variants share one scenery-only raster and one campaign dataset:

- ?variant=trail — direct spatial trail with nodes on the landmarks.
- ?variant=acts — act-first itinerary with the map as context.
- ?variant=compass — semantic level navigator with a focused map.

Challenge labels are deliberately provisional. This prototype tests whether Challenge-specific progress belongs in the map model and presentation, not what the final difficulty names should be.

Run:

~~~sh
npm run prototype:campaign-map
~~~

Open <http://localhost:4177/?variant=trail>. Use the bottom switcher or Left/Right Arrow. Toggle **Inspect system** to reveal runtime route geometry, hit targets, selected state, and the accessible name derived from the same data.

The scenery edit was generated from assets/campaign-world-map.png by removing all baked route dots, numbered platforms, and labels, then reconstructing the terrain underneath.
