/** Simple uniform grid spatial index for ring/enemy queries. */

export class SpatialGrid {
  constructor(cellSize = 96, width = 1536, height = 1024) {
    this.cellSize = cellSize;
    this.cols = Math.ceil(width / cellSize);
    this.rows = Math.ceil(height / cellSize);
    this.cells = new Map();
  }

  _key(cx, cy) {
    return `${cx},${cy}`;
  }

  clear() {
    this.cells.clear();
  }

  insert(id, x, y, radius = 0) {
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const k = this._key(cx, cy);
        if (!this.cells.has(k)) this.cells.set(k, []);
        this.cells.get(k).push({ id, x, y, radius });
      }
    }
  }

  query(x, y, radius = 0) {
    const minCx = Math.floor((x - radius) / this.cellSize);
    const maxCx = Math.floor((x + radius) / this.cellSize);
    const minCy = Math.floor((y - radius) / this.cellSize);
    const maxCy = Math.floor((y + radius) / this.cellSize);
    const seen = new Set();
    const out = [];
    for (let cy = minCy; cy <= maxCy; cy++) {
      for (let cx = minCx; cx <= maxCx; cx++) {
        const items = this.cells.get(this._key(cx, cy));
        if (!items) continue;
        for (const item of items) {
          if (seen.has(item.id)) continue;
          seen.add(item.id);
          out.push(item);
        }
      }
    }
    return out;
  }
}
