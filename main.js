const { abs } = Math;

const canvas = document.getElementById("grid");
const ctx = canvas.getContext("2d");
const canvasOS = document.getElementById("offscreen");
const ctxOS = canvasOS.getContext("2d");
let pathLengthEl, durationEl, pathTimeEl;

let loaded = false;
let running = false;
let done = false;
let speed = 7; //ms per loop
let duration = 0;
let pathTime = 0;
let schoolZoneWeight = 3;

let mouseDown = false;
let mouseX, mouseY;
let dragging = false;
let dragItem = null;
let schoolZoneOn = false;

let grid;

const gridColor = "#d1d1d1";
const squareColors = {
  start: "#4ae632",
  target: "#e63832",
  frontier: "#6e9eff",
  visited: "#b8f8ff",
  path: "#ffdf29",
  wall: "#383838",
  schoolZone: "#de9d35"
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
  draw(grid);
});

canvas.addEventListener("mousedown", handleMousedown);
canvas.addEventListener("mouseup", handleMouseup);
canvas.addEventListener("mousemove", handleMousemove);
document.addEventListener("keydown", handleKeydown);
document.addEventListener("keyup", handleKeyup);

////////// INPUT HANDLING //////////

function handleMousedown(ev) {
  mouseDown = true;
  mouseX = ev.clientX;
  mouseY = ev.clientY;

  let sq = grid.getSquareByCoords(mouseX, mouseY);
  if (grid.start == sq.id) dragItem = "start";
  else if (grid.target == sq.id) dragItem = "target";
  else {
    if (schoolZoneOn) {
      grid.toggleSchoolZone(sq.id)
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
  if (ev.key === "s" && !schoolZoneOn) schoolZoneOn = true;
}

function handleKeyup(ev) {
  if (ev.key === "s" && schoolZoneOn) schoolZoneOn = false;
}

function handleDrag() {
  let sq = grid.getSquareByCoords(mouseX, mouseY);
  if (dragItem && grid[dragItem] != sq.id) {
    grid[dragItem] = sq.id;
  } else {
    if (schoolZoneOn) {
      grid.toggleSchoolZone(sq.id, false)
    } else {
      grid.toggleWall(sq.id, false);
    }
  }
  //if drag item, update start/target in grid when passing over new square
  //if not, toggle wall on each new square, passing false as 2nd arg
}

////////// DATA STRUCTURES //////////

class Square {
  constructor(id, x, y, dim) {
    this.id = id;
    this.width = dim;
    this.height = dim;
    this.x = x;
    this.y = y;
    this.walkable = true;
    this.schoolZone = false;
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
    this.widthInSquares = Math.ceil(this.width / this.s);
    this.height = window.innerHeight;
    this.heightInSquares = Math.ceil(this.height / this.s);
    this.start = null;
    this.target = null;
    this.walls = {};
    this.schoolZones = {};
    this.squares = [];

    this.makeSquares();
    this.addBorders();
    this.initStartAndTarget();
  }

  makeSquares() {
    for (let id = 1; id < this.widthInSquares * this.heightInSquares; id++) {
      let row = Math.ceil(id / this.widthInSquares);
      let col =
        Math.floor(id % this.widthInSquares) > 0
          ? Math.floor(id % this.widthInSquares)
          : this.widthInSquares;
      let x = (col - 1) * this.s;
      let y = (row - 1) * this.s;
      this.squares.push(new Square(id, x, y, this.s));
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

  toggleWallCoords(x, y, allowToggleOff = true) {
    let sq = this.getSquareByCoords(x, y);
    if (sq.id == this.start || sq.id == this.target) return;
    if (sq.walkable) {
      sq.walkable = false;
      this.walls[sq.id] = true;
    } else if (allowToggleOff) {
      sq.walkable = true;
      delete this.walls[sq.id];
    }
  }

  toggleWall(id, allowToggleOff = true) {
    let sq = this.getSquare(id);
    if (id == this.start || id == this.target) return;
    if (sq.walkable) {
      sq.walkable = false;
      sq.schoolZone = false;
      if (this.schoolZones[id]) delete this.schoolZones[id];
      this.walls[id] = true;
    } else if (allowToggleOff) {
      sq.walkable = true;
      delete this.walls[id];
    }
  }

  toggleSchoolZone(id, allowToggleOff = true) {
    let sq = this.getSquare(id);
    if (id == this.start || id == this.target) return;
    if (sq.walkable) {
      sq.schoolZone = true;
      this.schoolZones[id] = true;
    } else if (sq.schoolZone && allowToggleOff) {
      sq.schoolZone = false;
      if (this.schoolZones[id]) delete this.schoolZones[id];
    }
  }

  getSquareByCoords(x, y) {
    let X = Math.floor(x / this.s) * this.s;
    let Y = Math.floor(y / this.s) * this.s;
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
    let sx = Math.floor(this.width / 4);
    let sy = Math.floor(this.height / 2);
    let tx = Math.ceil((this.width / 4) * 3);
    let ty = sy;

    this.start = this.getSquareByCoords(sx, sy).id;
    this.target = this.getSquareByCoords(tx, ty).id;
  }

  clear() {
    for (let sq of this.squares) {
      sq.walkable = true;
      sq.schoolZone = false;
    }
    this.walls = {};
    this.schoolZones = {};
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
    let pIdx = Math.floor(idx / 2);

    while (this.heap[pIdx] && sq.f < this.heap[pIdx].f) {
      let oldP = this.heap[pIdx];
      this.heap[pIdx] = sq;
      this.heap[idx] = oldP;
      idx = pIdx;
      pIdx = Math.floor(idx / 2);
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

  insertThenExtract(sq) {
    if (!this.heap[1] || sq.f < this.heap[1].f) return sq;

    const root = this.heap[1];
    this.heap[1] = sq;

    let idx = 1;
    let childIdx = this.getChildIndex(1);

    while (this.heap[childIdx] && this.heap[idx].f >= this.heap[childIdx].f) {
      let oldC = this.heap[childIdx];
      this.heap[childIdx] = tail;
      this.heap[idx] = oldC;
      idx = childIdx;
      childIdx = this.getChildIndex(idx);
    }

    return root;
  }

  insertThenPeek(sq) {
    this.insert(sq);
    return this.peek();
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
  if (running || done) {
    running = false;
    done = false;
    this.reset();
  }
  console.log("running breadth-first search...");
  running = true;
  let startSquare = grid.getSquare(grid.start);
  let endSquare = grid.getSquare(grid.target);

  let cameFrom = {};

  frontier.put(startSquare);
  cameFrom[startSquare.id] = null;

  const loop = () => {
    let startTime = window.performance.now();
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
    if (!found) {
      console.log(
        `No valid path from square ${startSquare.id} to square ${endSquare.id}`
      );
      return;
    }
    let current = endSquare;
    while (current.id !== startSquare.id) {
      path.push(current.id);
      pathTime += movementCost(null, current)
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
  if (running || done) {
    running = false;
    done = false;
    reset();
  }
  console.log("running A*...");
  running = true;

  let found = false;
  let closed = new Map();
  let open = new PriorityQueue();
  frontier = open;

  let startSquare = grid.getSquare(grid.start);
  let endSquare = grid.getSquare(grid.target);

  startSquare.g = 0;
  startSquare.f = 0;

  open.insert(startSquare);
  let curr;

  const loop = () => {
    let startTime = window.performance.now();
    curr = open.extract();
    closed.set(curr, true);
    visited.push(curr.id);

    if (curr.id == endSquare.id) {
      found = true;
      makePath();
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
        neighbor.h = neighbor.h || manhattan(neighbor.x, neighbor.y, endSquare.x, endSquare.y);
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
    if (open.size <= 0) return;
    setTimeout(loop, speed);
    draw();
  };

  const makePath = () => {
    if (!found) {
      console.log(
        `No valid path from square ${startSquare.id} to square ${endSquare.id}`
      );
      return;
    }
    while (curr.parent) {
      path.push(curr.id);
      pathTime += movementCost(null, curr)
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
  if (acknowledgeSchoolZones()) {
    return sq2.schoolZone ? schoolZoneWeight : 1;
  } else return 1;
}

function acknowledgeSchoolZones() {
  return document.getElementById("chkbx-schoolZone").checked;
}

////////// DRAWING AND RENDERING //////////

function initGrid(w, h, sw) {
  //draw empty grid onto canvas of size w x h with square size sw
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
    c.clearRect(x, y, d, d);
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

function drawSchoolZones() {
  for (let id in grid.schoolZones) {
    let s = grid.getSquare(id);
    drawSquare(ctx, s.x, s.y, s.width, "schoolZone");
  }
}

function drawVisited() {
  visited.forEach((id) => {
    let s = grid.getSquare(id);
    drawSquare(ctx, s.x, s.y, s.width, "visited");
  });
}

function drawFrontier() {
  frontier.each((s) => {
    drawSquare(ctx, s.x, s.y, s.width, "frontier");
  });
}

function drawPath() {
  path.forEach((id) => {
    let s = grid.getSquare(id);
    if (s) drawSquare(ctx, s.x, s.y, s.width, "path");
  });
}

function draw() {
  if (!loaded) return;

  ctx.clearRect(0, 0, canvas.width, canvas.height);
  
  if (running) {
    drawVisited();
    drawSchoolZones();
    drawFrontier();
    if (done) {
      drawPath();
    }
  } else {
    drawSchoolZones();
  }
  drawWalls();
  drawStart();
  drawTarget();
  drawGrid();
}

function showEndStats() {
  pathLengthEl = document.createElement("h3");
  pathTimeEl = document.createElement("h3");
  durationEl = document.createElement("h4");
  pathLengthEl.innerText = `Path length: ${path.length - 1}`;
  pathTimeEl.innerText = `Path transit time: ${pathTime}`;
  durationEl.innerText = `Duration: ${duration}ms`;
  document.body.appendChild(pathLengthEl);
  document.body.appendChild(pathTimeEl);
  document.body.appendChild(durationEl);
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
  frontier = new Queue();
  visited = [];
  path = [];
  draw();
  removeEndStats();
}

function clearGrid() {
  console.log("clearing grid...");
  reset();
  grid.clear();
  draw();
}

window.onresize = function () {};
