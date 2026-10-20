import { WebSocketServer } from "ws";
import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("./", import.meta.url));
const port = Number(process.env.PORT || 8080);
const rooms = new Map();
const CONFIG = { width: 900, height: 600, edge: 35, maxHp: 3, moveSpeed: 220, moveAcceleration: 1050, moveDamping: 0.42, knockback: 460, attackCooldownMs: 500, attackDurationMs: 160, respawnMs: 1000, spawnSafeDistance: 260, edgeHp: 2, portalRadius: 26 };
const W = CONFIG.width, H = CONFIG.height;

const ARENAS = [
  {
    shape: "octagon",
    points: [[220,70],[680,70],[820,200],[820,400],[680,530],[220,530],[80,400],[80,200]],
    portals: [[185,160,715,440],[715,440,185,160],[715,160,185,440],[185,440,715,160]],
    obstacles: [{ x: 390, y: 230, w: 120, h: 140 }]
  },
  {
    shape: "hexagon",
    points: [[240,70],[660,70],[820,300],[660,530],[240,530],[80,300]],
    portals: [[165,300,735,300],[735,300,165,300],[300,125,600,475],[600,475,300,125]],
    obstacles: [{ x: 385, y: 255, w: 130, h: 90 }]
  },
  {
    shape: "cross",
    points: [[250,70],[650,70],[650,170],[810,170],[810,430],[650,430],[650,530],[250,530],[250,430],[90,430],[90,170],[250,170]],
    portals: [[170,215,730,385],[730,385,170,215],[730,215,170,385],[170,385,730,215]],
    obstacles: [{ x: 360, y: 215, w: 180, h: 70 }, { x: 360, y: 315, w: 180, h: 70 }]
  },
  {
    shape: "diamond",
    points: [[450,60],[710,150],[830,300],[710,450],[450,540],[190,450],[70,300],[190,150]],
    portals: [[185,235,715,365],[715,365,185,235],[715,235,185,365],[185,365,715,235]],
    obstacles: [{ x: 390, y: 210, w: 120, h: 180 }]
  }
];
function createMap() {
  const arena = ARENAS[Math.floor(Math.random() * ARENAS.length)];
  const type = Math.random() < 0.38 ? "obstacle" : "polygon";
  const points = arena.points;
  const edges = points.map((a, i) => ({ a, b: points[(i + 1) % points.length], hp: CONFIG.edgeHp, broken: false }));
  const portals = arena.portals.map(([x, y, targetX, targetY]) => ({ x, y, targetX, targetY }));
  return { type, shape: arena.shape, points, edges, obstacles: type === "obstacle" ? arena.obstacles : [], portals };
}
function spawnDog(id, avoid = null) { let x = 140 + Math.random() * 620, y = 120 + Math.random() * 360; for (let i = 0; i < 20 && avoid?.alive && Math.hypot(x - avoid.x, y - avoid.y) < CONFIG.spawnSafeDistance; i++) { x = 140 + Math.random() * 620; y = 120 + Math.random() * 360; } return { x, y, facingX: id === "p1" ? 1 : -1, facingY: 0, attacking: false, lastAttack: 0, hitFlashUntil: 0, vx: 0, vy: 0, alive: true, respawnAt: 0, portalCooldown: 0 }; }
function createRoom(code) { return { code, clients: new Map(), state: { phase: "waiting", countdownEnds: 0, winner: null, players: {}, map: createMap(), width: W, height: H, config: CONFIG } }; }
function getRoom(code) { if (!rooms.has(code)) rooms.set(code, createRoom(code)); return rooms.get(code); }
function resetPlayers(room) { for (const p of Object.values(room.state.players)) { p.hp = CONFIG.maxHp; p.dog = spawnDog(p.id, Object.values(room.state.players).find(q => q.id !== p.id)?.dog); } }
function beginCountdown(room) { room.state.map = createMap(); resetPlayers(room); room.state.phase = "countdown"; room.state.winner = null; room.state.countdownEnds = Date.now() + 3000; }
function updatePhase(room) { if (room.state.phase === "finished") return; if (room.clients.size < 2) { room.state.phase = "waiting"; room.state.countdownEnds = 0; return; } if (room.state.phase === "waiting") beginCountdown(room); if (room.state.phase === "countdown" && Date.now() >= room.state.countdownEnds) { room.state.phase = "playing"; room.state.countdownEnds = 0; } }
function broadcast(room) { updatePhase(room); const payload = JSON.stringify({ type: "state", state: room.state, room: room.code }); for (const ws of room.clients.keys()) if (ws.readyState === 1) ws.send(payload); }
function reset(room) { if (room.clients.size >= 2) beginCountdown(room); else { room.state.phase = "waiting"; room.state.winner = null; resetPlayers(room); } broadcast(room); }
function pointInPolygon(x, y, points) { let inside = false; for (let i = 0, j = points.length - 1; i < points.length; j = i++) { const xi = points[i][0], yi = points[i][1], xj = points[j][0], yj = points[j][1]; const hit = ((yi > y) !== (yj > y)) && x < (xj - xi) * (y - yi) / (yj - yi) + xi; if (hit) inside = !inside; } return inside; }
function closestEdge(map, x, y) { let best = { index: 0, distance: Infinity, t: 0, px: 0, py: 0 }; map.edges.forEach((edge, index) => { const [ax, ay] = edge.a, [bx, by] = edge.b, ex = bx - ax, ey = by - ay, len2 = ex * ex + ey * ey; const t = Math.max(0, Math.min(1, ((x - ax) * ex + (y - ay) * ey) / len2)); const px = ax + ex * t, py = ay + ey * t, distance = Math.hypot(x - px, y - py); if (distance < best.distance) best = { index, distance, t, px, py }; }); return best; }
function keepInside(room, dog) { const map = room.state.map; if (pointInPolygon(dog.x, dog.y, map.points)) return true; const near = closestEdge(map, dog.x, dog.y), edge = map.edges[near.index]; if (edge.broken) return false; const cx = W / 2 - near.px, cy = H / 2 - near.py, length = Math.hypot(cx, cy) || 1; dog.x = near.px + cx / length * 28; dog.y = near.py + cy / length * 28; dog.vx = 0; dog.vy = 0; return true; }
function resolveObstacle(room, dog) { for (const o of room.state.map.obstacles) { if (dog.x < o.x || dog.x > o.x + o.w || dog.y < o.y || dog.y > o.y + o.h) continue; const distances = [{ d: Math.abs(dog.x - o.x), x: o.x - 28, y: dog.y, vx: -1, vy: 0 }, { d: Math.abs(dog.x - (o.x + o.w)), x: o.x + o.w + 28, y: dog.y, vx: 1, vy: 0 }, { d: Math.abs(dog.y - o.y), x: dog.x, y: o.y - 28, vx: 0, vy: -1 }, { d: Math.abs(dog.y - (o.y + o.h)), x: dog.x, y: o.y + o.h + 28, vx: 0, vy: 1 }]; const hit = distances.sort((a, b) => a.d - b.d)[0]; dog.x = hit.x; dog.y = hit.y; dog.vx = hit.vx * Math.abs(dog.vx) * 0.25; dog.vy = hit.vy * Math.abs(dog.vy) * 0.25; } }
function usePortal(room, dog) { if (Date.now() < dog.portalCooldown) return; for (const portal of room.state.map.portals) if (Math.hypot(dog.x - portal.x, dog.y - portal.y) < CONFIG.portalRadius) { dog.x = portal.targetX; dog.y = portal.targetY; dog.portalCooldown = Date.now() + 700; break; } }
function loseLife(room, player) { const dog = player.dog; dog.alive = false; dog.vx = 0; dog.vy = 0; player.hp -= 1; const other = Object.values(room.state.players).find(q => q.id !== player.id); if (player.hp <= 0 && other) { room.state.phase = "finished"; room.state.winner = other.id; } else dog.respawnAt = Date.now() + CONFIG.respawnMs; }
function resolveDogCollision(room) { const players = Object.values(room.state.players).filter(p => p.dog.alive); if (players.length < 2) return; const a = players[0].dog, b = players[1].dog; let dx = b.x - a.x, dy = b.y - a.y, distance = Math.hypot(dx, dy), minDistance = 50; if (distance >= minDistance) return; const length = distance || 1; dx /= length; dy /= length; const overlap = (minDistance - distance) / 2; a.x -= dx * overlap; a.y -= dy * overlap; b.x += dx * overlap; b.y += dy * overlap; a.vx -= dx * 35; a.vy -= dy * 35; b.vx += dx * 35; b.vy += dy * 35; }
function step(room, dt) { for (const player of Object.values(room.state.players)) { const dog = player.dog; if (!dog.alive) { if (Date.now() >= dog.respawnAt) Object.assign(dog, spawnDog(player.id, Object.values(room.state.players).find(q => q.id !== player.id)?.dog)); continue; } dog.x += dog.vx * dt; dog.y += dog.vy * dt; dog.vx *= Math.pow(CONFIG.moveDamping, dt); dog.vy *= Math.pow(CONFIG.moveDamping, dt); usePortal(room, dog); if (!keepInside(room, dog)) { loseLife(room, player); continue; } resolveObstacle(room, dog); } resolveDogCollision(room); }

const server = createServer(async (req, res) => { const path = req.url?.split("?")[0] === "/" ? "/index.html" : req.url?.split("?")[0]; try { const body = await readFile(join(root, path)); res.writeHead(200, { "Content-Type": `${extname(path) === ".js" ? "text/javascript" : "text/html"}; charset=utf-8`, "Cache-Control": "no-store" }); res.end(body); } catch { res.writeHead(404); res.end("Not found"); } });
const wss = new WebSocketServer({ server });
setInterval(() => { for (const room of rooms.values()) { updatePhase(room); if (room.state.phase === "playing") step(room, 0.05); if (room.clients.size) broadcast(room); } }, 50);
wss.on("connection", (ws, req) => { const code = (new URL(req.url || "/", `http://${req.headers.host || "localhost"}`)).searchParams.get("room")?.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8) || "DOG1"; const room = getRoom(code); if (room.clients.size >= 2) { ws.send(JSON.stringify({ type: "full", room: code })); ws.close(); return; } const id = `p${room.clients.size + 1}`; room.clients.set(ws, id); room.state.players[id] = { id, hp: CONFIG.maxHp, dog: spawnDog(id) }; ws.send(JSON.stringify({ type: "welcome", id, room: code })); broadcast(room); ws.on("message", raw => { let msg; try { msg = JSON.parse(raw); } catch { return; } const player = room.state.players[id]; if (!player) return; const dog = player.dog; if (msg.type === "input" && room.state.phase === "playing" && dog.alive) { const dt = Math.min(Number(msg.dt) || 0, 0.05), dx = Math.max(-1, Math.min(1, Number(msg.x) || 0)), dy = Math.max(-1, Math.min(1, Number(msg.y) || 0)); if (dx || dy) { const len = Math.hypot(dx, dy) || 1; dog.vx += dx / len * CONFIG.moveAcceleration * dt; dog.vy += dy / len * CONFIG.moveAcceleration * dt; dog.facingX = dx / len; dog.facingY = dy / len; } const speed = Math.hypot(dog.vx, dog.vy); if (speed > CONFIG.moveSpeed) { dog.vx = dog.vx / speed * CONFIG.moveSpeed; dog.vy = dog.vy / speed * CONFIG.moveSpeed; } } if (msg.type === "attack" && room.state.phase === "playing" && dog.alive && !dog.attacking && Date.now() - dog.lastAttack >= CONFIG.attackCooldownMs) { dog.attacking = true; dog.lastAttack = Date.now(); setTimeout(() => { dog.attacking = false; }, CONFIG.attackDurationMs); const target = Object.values(room.state.players).find(q => q.id !== id); if (target && target.dog.alive) { const dx = target.dog.x - dog.x, dy = target.dog.y - dog.y, forward = dx * dog.facingX + dy * dog.facingY, side = Math.abs(dx * dog.facingY - dy * dog.facingX); if (forward > 0 && forward < 150 && side < 42) { target.dog.vx += dog.facingX * CONFIG.knockback; target.dog.vy += dog.facingY * CONFIG.knockback; target.dog.hitFlashUntil = Date.now() + 180; } } const edge = closestEdge(room.state.map, dog.x + dog.facingX * 70, dog.y + dog.facingY * 70); if (edge.distance < 70 && !room.state.map.edges[edge.index].broken) { const e = room.state.map.edges[edge.index]; e.hp -= 1; if (e.hp <= 0) e.broken = true; } } if (msg.type === "reset") reset(room); broadcast(room); }); ws.on("close", () => { room.clients.delete(ws); delete room.state.players[id]; room.state.phase = "waiting"; room.state.winner = null; room.state.countdownEnds = 0; if (room.clients.size) broadcast(room); else rooms.delete(room.code); }); });
server.listen(port, "0.0.0.0", () => console.log(`LAN game on port ${port}`));
