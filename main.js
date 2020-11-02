const { abs, floor, ceil } = Math;

const canvas = document.getElementById("grid");
const ctx = canvas.getContext("2d");
const canvasOS = document.getElementById("offscreen");
const ctxOS = canvasOS.getContext("2d");
let pathLengthEl, durationEl, pathTimeEl;

let loaded = false;
let running = false;
let done = false;
let noPath = false;
const speed = 5; //ms per loop
const slowZoneWeight = 3;
let duration = 0;
let pathTime = 0;

let mouseDown = false;
let mouseX, mouseY;
let dragging = false;
let dragItem = null;
let slowZoneOn = false;

let grid;

const gridColor = "#d1d1d1";
const squareColors = {
  start: "#4ae632",
  target: "#e63832",
  frontier: "#6e9eff",
  visited: "#b8f8ff",
  path: "#ffdf29",
  wall: "#383838",
  slowZone: "#de9d35",
  noPath: "#de2c2c",
};

document.addEventListener("DOMContentLoaded", function () {
  console.log("document ready");
  loaded = true;
  canvas.width = window.innerWidth;
  canvasOS.width = canvas.width;
  canvas.height = window.innerHeight;
  canvasOS.height = canvas.height;
  grid = new GridGraph(30);
  initGrid(grid.width, grid.height, grid.s);
  draw();
  document.getElementById("slow-zone-weight").textContent = "" + slowZoneWeight;
});

canvas.addEventListener("mousedown", handleMousedown);
canvas.addEventListener("mouseup", handleMouseup);
canvas.addEventListener("mousemove", handleMousemove);
document.addEventListener("keydown", handleKeydown);
document.addEventListener("keyup", handleKeyup);
window.onresize = handleResize;

////////// INPUT HANDLING //////////

function handleMousedown(ev) {
  if (running || done) return;
  mouseDown = true;
  mouseX = ev.clientX;
  mouseY = ev.clientY;

  let sq = grid.getSquareByCoords(mouseX, mouseY);
  if (grid.start == sq.id) dragItem = "start";
  else if (grid.target == sq.id) dragItem = "target";
  else {
    if (slowZoneOn || grid.getSquare(sq.id).slowZone) {
      grid.toggleSlowZone(sq.id);
    } else {
      grid.toggleWall(sq.id);
    }
  }
  draw();
}

function handleMouseup(ev) {
  mouseDown = false;
  mouseX = ev.clientX;
  mouseY = ev.clientY;
  dragging = false;
  dragItem = null;
}

function handleMousemove(ev) {
  if (!mouseDown) return;
  if (!dragging) dragging = true;
  mouseX = ev.clientX;
  mouseY = ev.clientY;
  handleDrag();
  draw();
}

function handleKeydown(ev) {
  if (ev.key === "Shift" && !slowZoneOn) slowZoneOn = true;
}

function handleKeyup(ev) {
  if (ev.key === "Shift" && slowZoneOn) slowZoneOn = false;
}

function handleDrag() {
  let sq = grid.getSquareByCoords(mouseX, mouseY);
  if (dragItem && grid[dragItem] != sq.id) {
    grid[dragItem] = sq.id;
  } else {
    if (slowZoneOn) {
      grid.toggleSlowZone(sq.id, false);
    } else {
      grid.toggleWall(sq.id, false);
    }
  }
}

function handleResize(ev) {
  canvas.width = window.innerWidth;
  canvas.height = window.innerHeight;
  canvasOS.width = canvas.width;
  canvasOS.height = canvas.height;
  reset();
  grid.resize();
  visited = visited.map((vId) => grid.migrateSquare(grid.getSquare(vId)));
  path = path.map((pId) => grid.migrateSquare(grid.getSquare(pId)));
  initGrid(grid.width, grid.height, grid.s);
  draw();
}

////////// DATA STRUCTURES //////////

class Square {
  constructor(id, x, y, row, col, dim) {
    this.id = id;
    this.width = dim;
    this.height = dim;
    this.x = x;
    this.y = y;
    this.row = row;
    this.col = col;
    this.walkable = true;
    this.slowZone = false;
    this.borders = { up: null, left: null, down: null, right: null };
    this.parent = null;
    this.g = Infinity;
    this.h = 0;
    this.f = 0;
  }
}

class GridGraph {
  constructor(sw) {
    this.s = sw || 30;
    this.width = window.innerWidth;
    this.widthInSquares = ceil(this.width / this.s);
    this.height = window.innerHeight;
    this.heightInSquares = ceil(this.height / this.s);
    this.start = null;
    this.target = null;
    this.walls = {};
    this.slowZones = {};
    this.squares = [];

    this.makeSquares();
    this.addBorders();
    this.initStartAndTarget();
  }

  makeSquares() {
    for (let id = 1; id < this.widthInSquares * this.heightInSquares; id++) {
      let row = ceil(id / this.widthInSquares);
      let col =
        floor(id % this.widthInSquares) > 0
          ? floor(id % this.widthInSquares)
          : this.widthInSquares;
      let x = (col - 1) * this.s;
      let y = (row - 1) * this.s;
      this.squares.push(new Square(id, x, y, row, col, this.s));
    }
  }

  addBorders() {
    for (let square of this.squares) {
      const id = square.id;

      if ((id - 1) % this.widthInSquares !== 0)
        square.borders.left = this.squares[id - 2];

      if (id % this.widthInSquares !== 0)
        square.borders.right = this.squares[id];

      if (id - this.widthInSquares > 0)
        square.borders.up = this.squares[id - this.widthInSquares - 1];

      if (id + this.widthInSquares <= this.squares.length)
        square.borders.down = this.squares[id + this.widthInSquares - 1];
    }
  }

  toggleWall(id, allowToggleOff = true) {
    let sq = this.getSquare(id);
    // if (id == this.start || id == this.target) return;
    if (sq.walkable && id != this.start && id != this.target) {
      sq.walkable = false;
      sq.slowZone = false;
      if (this.slowZones[id]) delete this.slowZones[id];
      this.walls[id] = true;
    } else if (allowToggleOff) {
      sq.walkable = true;
      delete this.walls[id];
    }
  }

  toggleSlowZone(id, allowToggleOff = true) {
    let sq = this.getSquare(id);
    // if (id == this.start || id == this.target) return;
    if (sq.walkable && !sq.slowZone && id != this.start && id != this.target) {
      sq.slowZone = true;
      this.slowZones[id] = true;
    } else if (sq.slowZone && allowToggleOff) {
      sq.slowZone = false;
      delete this.slowZones[id];
    }
  }

  getSquareByCoords(x, y) {
    let X = floor(x / this.s) * this.s;
    let Y = floor(y / this.s) * this.s;
    let row = Y / this.s;
    let col = X / this.s + 1;
    let id = row * this.widthInSquares + col;
    return this.getSquare(id);
  }

  getSquare(id) {
    if (typeof id !== "number" && typeof id !== "string") return null;
    return this.squares[Number(id) - 1];
  }

  initStartAndTarget() {
    //start is halfway down, 1/4 across
    //target is halfway down, 3/4 across
    let sx = floor(this.width / 4);
    let sy = floor(this.height / 2);
    let tx = ceil((this.width / 4) * 3);
    let ty = sy;

    let newStart = this.getSquareByCoords(sx, sy);
    let newTarget = this.getSquareByCoords(tx, ty);

    if (!newStart.walkable) this.toggleWall(newStart.id);
    if (newStart.slowZone) this.toggleSlowZone(newStart.id);
    if (!newTarget.walkable) this.toggleWall(newTarget.id);
    if (newTarget.slowZone) this.toggleSlowZone(newTarget.id);
    if (newStart === newTarget) newTarget = this.getSquare(newTarget.id + 1);

    this.start = newStart.id;
    this.target = newTarget.id;
  }

  getStartSquare() {
    return this.getSquare(this.start);
  }

  getTargetSquare() {
    return this.getSquare(this.target);
  }

  reset() {
    for (let sq of this.squares) {
      sq.parent = null;
      sq.g = Infinity;
      sq.h = 0;
      sq.f = 0;
    }
  }

  clear() {
    for (let sq of this.squares) {
      sq.walkable = true;
      sq.slowZone = false;
    }
    this.walls = {};
    this.slowZones = {};
  }

  resize() {
    this.width = window.innerWidth;
    this.height = window.innerHeight;
    this.widthInSquares = ceil(this.width / this.s);
    this.heightInSquares = ceil(this.height / this.s);
    let squares = this.squares;
    let startSq = this.getSquare(this.start);
    let targetSq = this.getSquare(this.target);
    this.squares = [];
    this.walls = {};
    this.slowZones = {};
    this.makeSquares();
    this.addBorders();
    this.start = this.migrateSquare(startSq);
    this.target = this.migrateSquare(targetSq);
    if (!this.start || !this.target) this.initStartAndTarget();
    this.migrateSquares(squares);
  }

  migrateSquare(sq) {
    if (sq.col > this.widthInSquares || sq.row > this.heightInSquares)
      return null;
    let newId = sq.col + (sq.row - 1) * this.widthInSquares;
    let { walkable, slowZone, parent, g, h, f } = sq;
    let newSq = this.getSquare(newId);
    if (!newSq) return null;
    newSq.walkable = walkable;
    newSq.slowZone = slowZone;
    newSq.parent = parent;
    newSq.g = g;
    newSq.h = h;
    newSq.f = f;
    return newId;
  }

  migrateSquares(oldSquares) {
    for (let sq of oldSquares) {
      let id = this.migrateSquare(sq);
      if (!id) continue;
      if (!sq.walkable) this.walls[id] = true;
      if (sq.slowZone) this.slowZones[id] = true;
    }
  }
}

class Queue {
  constructor() {
    this.front = 0;
    this.end = -1;
    this.storage = {};
    this.size = 0;
  }

  put(val) {
    this.end++;
    this.size++;
    this.storage[this.end] = val;
  }

  get() {
    if (this.empty()) return null;

    let oldFront = this.front;
    let output = this.storage[oldFront];

    this.front++;
    delete this.storage[oldFront];
    this.size--;

    return output;
  }

  empty() {
    return this.front > this.end;
  }

  each(cb) {
    for (let i = this.front; i <= this.end; i++) {
      cb(this.storage[i], i);
    }
  }
}

class PriorityQueue {
  constructor() {
    this.heap = [null];
    this.storage = new Map();
  }

  get size() {
    return this.heap.length > 0 ? this.heap.length - 1 : 0;
  }

  insert(sq) {
    this.heap.push(sq);
    this.storage.set(sq, true);
    let idx = this.heap.length - 1;
    let pIdx = floor(idx / 2);

    while (this.heap[pIdx] && sq.f < this.heap[pIdx].f) {
      let oldP = this.heap[pIdx];
      this.heap[pIdx] = sq;
      this.heap[idx] = oldP;
      idx = pIdx;
      pIdx = floor(idx / 2);
    }
  }

  extract() {
    if (!this.heap[1]) return null;
    if (!this.heap[2]) return this.heap.pop();

    const root = this.heap[1];
    const tail = this.heap.pop();
    this.heap[1] = tail;

    let idx = 1;
    let childIdx = this.getChildIndex(1);

    while (this.heap[childIdx] && this.heap[idx].f > this.heap[childIdx].f) {
      let oldC = this.heap[childIdx];
      this.heap[childIdx] = tail;
      this.heap[idx] = oldC;
      idx = childIdx;
      childIdx = this.getChildIndex(idx);
    }
    this.storage.delete(root);
    return root;
  }

  peek() {
    return this.heap[1] ?? null;
  }

  getChildIndex(parentIdx) {
    let [left, right] = [parentIdx * 2, parentIdx * 2 + 1];
    let childIdx =
      this.heap[left] && this.heap[left].f <= this.heap[right]?.f
        ? left
        : right;
    return childIdx;
  }

  reheap() {
    let oldHeap = this.heap.slice(1);
    this.heap = [null];
    for (let sq of oldHeap) {
      this.insert(sq);
    }
    return true;
  }

  update(sq, prop, newProp) {
    if (!this.has(sq)) return false;
    sq[prop] = newProp;
    if (prop === "f") {
      this.reheap();
    }
    return true;
  }

  has(sq) {
    return this.storage.has(sq);
  }

  delete(sq) {
    if (!this.has(sq)) return false;

    const tail = this.heap.pop();
    if (tail !== sq) {
      let index = this.heap.indexOf(sq);
      if (index > 0) {
        this.heap[index] = tail;
        this.reheap();
      }
    }
    this.storage.delete(sq);
    return sq;
  }

  each(cb) {
    for (let i = 1; i < this.heap.length; i++) {
      cb(this.heap[i], i, this.heap);
    }
  }
}

////////// PATHFINDING LOGIC //////////

let visited = [];
let frontier = new Queue();
let path = [];

function runBFS() {
  if (!loaded) return;
  if (running || done) this.reset();

  console.log("running breadth-first search...");
  running = true;

  let startSquare = grid.getStartSquare();
  let cameFrom = {};
  frontier.put(startSquare);
  cameFrom[startSquare.id] = null;

  const loop = () => {
    if (!running) return;
    let startTime = window.performance.now();
    let endSquare = grid.getTargetSquare();
    let curr = frontier.get();
    let currId = curr.id;

    if (currId == endSquare.id) {
      makePath(true);
      let endTime = window.performance.now();
      duration += Number(endTime - startTime);
      return;
    }
    for (let dir in curr.borders) {
      let next = curr.borders[dir];
      if (next && next.walkable && !cameFrom.hasOwnProperty(next.id)) {
        frontier.put(next);
        cameFrom[next.id] = currId;
      }
    }
    visited.push(currId);
    draw();
    let endTime = window.performance.now();
    duration += Number(endTime - startTime);
    if (frontier.empty()) {
      startTime = window.performance.now();
      makePath(false);
      endTime = window.performance.now();
      duration += Number(endTime - startTime);
      return;
    }

    setTimeout(loop, speed);
  };

  const makePath = (found) => {
    let startSquare = grid.getStartSquare();
    let endSquare = grid.getTargetSquare();
    if (!found) {
      console.log(
        `No valid path from square ${startSquare.id} to square ${endSquare.id}`
      );
      noPath = true;
      draw();
      return;
    }
    let current = endSquare;
    while (current.id !== startSquare.id) {
      path.push(current.id);
      pathTime += movementCost(null, current);
      current = grid.getSquare(cameFrom[current.id]);
    }
    path.push([startSquare.x, startSquare.y]);
    done = true;
    draw();
    showEndStats();
  };

  setTimeout(loop, speed);
}

function runAStar() {
  if (!loaded) return;
  if (running || done) reset();

  console.log("running A*...");
  running = true;

  let found = false;
  let closed = new Map();
  let open = new PriorityQueue();
  frontier = open;

  let startSquare = grid.getStartSquare();

  startSquare.g = 0;
  startSquare.f = 0;

  open.insert(startSquare);
  let curr;

  const loop = () => {
    if (!running) return;
    let startTime = window.performance.now();
    let endSquare = grid.getTargetSquare();
    curr = open.extract();
    closed.set(curr, true);
    visited.push(curr.id);

    if (curr.id == endSquare.id) {
      found = true;
      makePath(true);
      let endTime = window.performance.now();
      duration += endTime - startTime;
      return;
    }

    for (let dir in curr.borders) {
      let neighbor = curr.borders[dir];
      if (!neighbor || !neighbor.walkable) continue;

      let inClosed = closed.has(neighbor);
      let inOpen = open.has(neighbor);

      if (inClosed) {
        continue;
      }

      let ng = curr.g + movementCost(curr, neighbor);

      if (!inOpen || ng < neighbor.g) {
        neighbor.g = ng;
        neighbor.h =
          neighbor.h ||
          manhattan(neighbor.x, neighbor.y, endSquare.x, endSquare.y);
        neighbor.f = neighbor.g + neighbor.h;
        neighbor.parent = curr;

        if (!inOpen) {
          open.insert(neighbor);
        } else {
          open.reheap();
        }
      }
    }
    let endTime = window.performance.now();
    duration += endTime - startTime;
    if (open.size <= 0) {
      makePath(false);
      return;
    }

    setTimeout(loop, speed);
    draw();
  };

  const makePath = (found) => {
    if (!found) {
      console.log(
        `No valid path from square ${grid.getStartSquare().id} to square ${
          grid.getTargetSquare().id
        }`
      );
      noPath = true;
      draw();
      return;
    }
    while (curr.parent && curr.id != grid.start) {
      path.push(curr.id);
      pathTime += movementCost(null, curr);
      curr = curr.parent;
    }
    path.push(curr.id);

    done = true;
    draw();
    showEndStats();
  };

  setTimeout(loop, speed);
}

////////// UTILITY FUNCTIONS //////////

function manhattan(x1, y1, x2, y2) {
  return abs(x1 - x2) / grid.s + abs(y1 - y2) / grid.s;
}

function movementCost(sq1, sq2) {
  if (acknowledgeSlowZones()) {
    return sq2.slowZone ? slowZoneWeight : 1;
  }
  return 1;
}

function acknowledgeSlowZones() {
  return document.getElementById("chkbx-slowZone").checked;
}

////////// DRAWING AND RENDERING //////////

function initGrid(w, h, sw) {
  //draw empty grid onto offscreem canvas of size w x h with square size sw
  ctxOS.save();
  ctxOS.globalAlpha = 0;
  ctxOS.fillRect(0, 0, canvasOS.width, canvasOS.height);
  ctxOS.restore();

  let x = 0;
  let y = 0;

  while (y < h) {
    drawSquare(ctxOS, x, y, sw);
    x += sw;
    if (x >= w) {
      x = 0;
      y += sw;
    }
  }
}

function drawSquare(c, x, y, d, type) {
  if (!type) {
    c.moveTo(x, y);
    c.lineTo(x + d, y);
    c.lineTo(x + d, y + d);
    c.lineTo(x, y + d);
    c.lineTo(x, y);
    c.strokeStyle = gridColor;
    c.stroke();
  } else {
    c.fillStyle = squareColors[type];
    c.fillRect(x, y, d, d);
  }
}

function drawGrid() {
  ctx.drawImage(canvasOS, 0, 0);
}

function drawStart() {
  let { x, y, width } = grid.getSquare(grid.start);
  drawSquare(ctx, x, y, width, "start");
}

function drawTarget() {
  let { x, y, width } = grid.getSquare(grid.target);
  drawSquare(ctx, x, y, width, "target");
}

function drawWalls() {
  for (let id in grid.walls) {
    let s = grid.getSquare(id);
    drawSquare(ctx, s.x, s.y, s.width, "wall");
  }
}

function drawSlowZones() {
  for (let id in grid.slowZones) {
    let s = grid.getSquare(id);
    drawSquare(ctx, s.x, s.y, s.width, "slowZone");
  }
}

function drawVisited() {
  ctx.save();
  ctx.globalAlpha = 0.5;
  visited.forEach((id) => {
    let s = grid.getSquare(id);
    drawSquare(ctx, s.x, s.y, s.width, noPath ? "noPath" : "visited");
  });
  ctx.restore();
}

function drawFrontier() {
  ctx.save();
  ctx.globalAlpha = 0.8;
  frontier.each((s) => {
    drawSquare(ctx, s.x, s.y, s.width, "frontier");
  });
  ctx.restore();
}

function drawPath() {
  ctx.save();
  ctx.globalAlpha = 0.75;
  path.forEach((id) => {
    let s = grid.getSquare(id);
    if (s) drawSquare(ctx, s.x, s.y, s.width, "path");
  });
  ctx.restore();
}

function draw() {
  if (!loaded) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  drawSlowZones();
  if (running) {
    drawVisited();
    drawFrontier();
    if (done) {
      drawPath();
    }
  }
  drawWalls();
  drawStart();
  drawTarget();
  drawGrid();
}

function showEndStats() {
  pathLengthEl = document.createElement("h3");
  pathTimeEl = document.createElement("h3");
  // durationEl = document.createElement("h4");
  pathLengthEl.innerText = `Path length: ${path.length - 1}`;
  pathTimeEl.innerText = `Path transit time: ${pathTime}`;
  // durationEl.innerText = `Duration: ${duration}ms`;
  document.body.appendChild(pathLengthEl);
  document.body.appendChild(pathTimeEl);
  // document.body.appendChild(durationEl);
}

function removeEndStats() {
  if (pathLengthEl) pathLengthEl.remove();
  if (pathTimeEl) pathTimeEl.remove();
  if (durationEl) durationEl.remove();
  pathLengthEl = null;
  pathTimeEl = null;
  durationEl = null;
  duration = 0;
  pathTime = 0;
}

////////// RESET AND CLEAR //////////

function reset() {
  console.log("resetting visualization...");
  running = false;
  done = false;
  noPath = false;
  frontier = new Queue();
  visited = [];
  path = [];
  grid.reset();
  removeEndStats();
  draw();
}

function clearGrid() {
  console.log("clearing grid...");
  reset();
  grid.clear();
  draw();
}
