const canvas = document.querySelector("canvas"), ctx = canvas.getContext("2d");
const status = document.querySelector("#status"), roomInput = document.querySelector("#roomInput"), joinRoom = document.querySelector("#joinRoom"), copyRoom = document.querySelector("#copyRoom"), resetGame = document.querySelector("#resetGame"), soundToggle = document.querySelector("#soundToggle");
const roomCode = (new URLSearchParams(location.search).get("room") || "DOG1").toUpperCase();
roomInput.value = roomCode;
joinRoom.onclick = () => { const code = roomInput.value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 8); if (code) location.href = `/?room=${code}`; }; copyRoom.onclick = async () => { try { await navigator.clipboard.writeText(location.href); status.textContent = "邀请链接已复制"; } catch { status.textContent = "请手动复制浏览器地址"; } }; resetGame.onclick = () => { if (ws?.readyState === 1) ws.send(JSON.stringify({ type: "reset" })); }; function updateSoundLabel() { soundToggle.textContent = `音效：${soundEnabled ? "开" : "关"}`; } soundToggle.onclick = () => { soundEnabled = !soundEnabled; localStorage.setItem("long-nose-sound", soundEnabled ? "on" : "off"); updateSoundLabel(); }; 
let ws = null, reconnectTimer = null, me = null, roomFull = false;
let state = { phase: "waiting", countdownEnds: 0, winner: null, players: {} };
let hpSeen = {}, feedback = {};
let keys = new Set(), last = performance.now(), audioCtx = null, hitSeen = {}, soundEnabled = localStorage.getItem("long-nose-sound") !== "off"; updateSoundLabel();
function connect() {
  const wsProtocol = location.protocol === "https:" ? "wss" : "ws";
  ws = new WebSocket(`${wsProtocol}://${location.host}/?room=${roomCode}`);
  ws.onopen = () => status.textContent = `房间 ${roomCode}｜已连接`;
  ws.onmessage = e => { const m = JSON.parse(e.data); if (m.type === "welcome") { me = m.id; roomFull = false; } if (m.type === "state") state = m.state; if (m.type === "full") { roomFull = true; status.textContent = `房间 ${roomCode} 已满，请更换房间码`; ws.close(); } };
  ws.onclose = () => { if (roomFull) { status.textContent = `房间 ${roomCode} 已满，请更换房间码`; return; } status.textContent = "连接断开，正在重连…"; clearTimeout(reconnectTimer); reconnectTimer = setTimeout(connect, 2000); };
}
function tone(frequency, duration, type = "sine", volume = 0.04) { if (!soundEnabled) return; if (!audioCtx) audioCtx = new (window.AudioContext || window.webkitAudioContext)(); const osc = audioCtx.createOscillator(), gain = audioCtx.createGain(); osc.type = type; osc.frequency.value = frequency; gain.gain.setValueAtTime(volume, audioCtx.currentTime); gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + duration); osc.connect(gain).connect(audioCtx.destination); osc.start(); osc.stop(audioCtx.currentTime + duration); }
connect();
addEventListener("keydown", e => { const k = e.key.toLowerCase(); if (e.repeat) return; keys.add(k); if (k === "m") { soundEnabled = !soundEnabled; localStorage.setItem("long-nose-sound", soundEnabled ? "on" : "off"); updateSoundLabel(); } if (k === "f" && ws?.readyState === 1) { tone(220, 0.12, "sawtooth", 0.035); ws.send(JSON.stringify({ type: "attack" })); } if (k === "r" && ws?.readyState === 1) ws.send(JSON.stringify({ type: "reset" })); });
addEventListener("keyup", e => keys.delete(e.key.toLowerCase()));
function loop(now) { const dt = (now - last) / 1000; last = now; const x = (keys.has("d") ? 1 : 0) - (keys.has("a") ? 1 : 0), y = (keys.has("s") ? 1 : 0) - (keys.has("w") ? 1 : 0); if (ws?.readyState === 1 && me) ws.send(JSON.stringify({ type: "input", x, y, dt })); draw(); requestAnimationFrame(loop); }
function roundedRect(x, y, w, h, r) { ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
function drawMap(now) {
  const map = state.map; if (!map) return;
  const polygon = Boolean(map.shape), points = map.points;
  const path = (offsetX = 0, offsetY = 0) => { ctx.beginPath(); ctx.moveTo(points[0][0] + offsetX, points[0][1] + offsetY); for (const p of points.slice(1)) ctx.lineTo(p[0] + offsetX, p[1] + offsetY); ctx.closePath(); };
  const bg = ctx.createLinearGradient(0, 0, 0, 600);
  if (polygon) { bg.addColorStop(0, "#83bdea"); bg.addColorStop(1, "#b8d8ef"); } else { bg.addColorStop(0, "#182b3c"); bg.addColorStop(1, "#0e1824"); }
  ctx.fillStyle = bg; ctx.fillRect(0, 0, 900, 600);
  if (polygon) {
    const cloud = (x, y, scale, alpha) => { ctx.save(); ctx.globalAlpha = alpha; ctx.fillStyle = "#f8fcff"; ctx.beginPath(); ctx.arc(x, y, 35 * scale, 0, Math.PI * 2); ctx.arc(x + 38 * scale, y - 18 * scale, 48 * scale, 0, Math.PI * 2); ctx.arc(x + 88 * scale, y, 32 * scale, 0, Math.PI * 2); ctx.arc(x + 45 * scale, y + 12 * scale, 44 * scale, 0, Math.PI * 2); ctx.fill(); ctx.restore(); };
    cloud(30, 65, 1.15, .6); cloud(650, 40, .9, .55); cloud(5, 520, 1.3, .48); cloud(720, 520, 1.1, .52);
    ctx.save(); ctx.translate(7, 13); path(); ctx.fillStyle = "rgba(39,61,78,.28)"; ctx.fill(); ctx.restore();
    path(); ctx.fillStyle = "#bdb9a6"; ctx.fill();
    ctx.save(); ctx.globalAlpha = .2; ctx.strokeStyle = "#8c897b"; ctx.lineWidth = 3; ctx.setLineDash([7, 9]);
    if (map.shape === "hexagon") {
      ctx.beginPath(); ctx.moveTo(300,130); ctx.lineTo(600,130); ctx.lineTo(735,300); ctx.lineTo(600,470); ctx.lineTo(300,470); ctx.lineTo(165,300); ctx.closePath(); ctx.stroke();
    } else if (map.shape === "diamond") {
      ctx.beginPath(); ctx.moveTo(450,120); ctx.lineTo(675,300); ctx.lineTo(450,480); ctx.lineTo(225,300); ctx.closePath(); ctx.stroke();
    } else if (map.shape === "cross") {
      ctx.beginPath(); ctx.rect(270,190,360,220); ctx.stroke(); ctx.beginPath(); ctx.moveTo(270,300); ctx.lineTo(630,300); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.moveTo(270,120); ctx.lineTo(630,120); ctx.lineTo(750,240); ctx.lineTo(750,360); ctx.lineTo(630,480); ctx.lineTo(270,480); ctx.lineTo(150,360); ctx.lineTo(150,240); ctx.closePath(); ctx.stroke();
    }
    ctx.setLineDash([]); ctx.restore();
    ctx.save(); ctx.globalAlpha = .17; ctx.fillStyle = "#f4f0d8";
    for (const patch of [[250,150,105,48,-.25],[500,145,130,46,.15],[190,330,88,42,.2],[470,350,145,55,-.18],[690,310,90,44,.35],[330,490,120,34,.05]]) { ctx.beginPath(); ctx.ellipse(...patch); ctx.fill(); }
    ctx.restore();
    ctx.save(); ctx.globalAlpha = .16; ctx.strokeStyle = "#8f8b7d"; ctx.lineWidth = 2; for (let y = 120; y < 510; y += 38) { ctx.beginPath(); ctx.moveTo(160, y); ctx.quadraticCurveTo(450, y + 13, 740, y - 4); ctx.stroke(); } ctx.restore();
    for (const [index, edge] of (map.edges || []).entries()) {
      const horizontal = Math.abs(edge.a[1] - edge.b[1]) < 8;
      ctx.save(); ctx.lineCap = "round"; ctx.setLineDash(edge.broken ? [12, 10] : []);
      ctx.strokeStyle = edge.broken ? "rgba(74,83,91,.25)" : horizontal ? "#d6d2bd" : "#4f5b66"; ctx.lineWidth = horizontal ? 24 : 22; ctx.beginPath(); ctx.moveTo(edge.a[0], edge.a[1]); ctx.lineTo(edge.b[0], edge.b[1]); ctx.stroke();
      if (!edge.broken && horizontal) { ctx.strokeStyle = edge.hp === 1 ? "#f0b04b" : "#e39a38"; ctx.lineWidth = 13; ctx.beginPath(); ctx.moveTo(edge.a[0], edge.a[1]); ctx.lineTo(edge.b[0], edge.b[1]); ctx.stroke(); ctx.strokeStyle = "#ffd06a"; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(edge.a[0] + 8, edge.a[1] - 4); ctx.lineTo(edge.b[0] - 8, edge.b[1] - 4); ctx.stroke(); }
      if (!edge.broken && !horizontal) { ctx.strokeStyle = "#78818a"; ctx.lineWidth = 12; ctx.beginPath(); ctx.moveTo(edge.a[0], edge.a[1]); ctx.lineTo(edge.b[0], edge.b[1]); ctx.stroke(); }
      ctx.restore();
    }
    for (const [index, portal] of (map.portals || []).entries()) {
      const angle = Math.atan2(portal.targetY - portal.y, portal.targetX - portal.x), pulse = 1 + Math.sin(now / 240 + index) * .04, color = index % 2 ? "#31c7c4" : "#4d3fd0", light = index % 2 ? "#a2f4d7" : "#aaa1ff";
      ctx.save(); ctx.translate(portal.x, portal.y); ctx.rotate(angle); ctx.scale(pulse, pulse);
      ctx.globalAlpha = .34; ctx.fillStyle = color; ctx.shadowColor = color; ctx.shadowBlur = 22; roundedRect(-24, -58, 48, 116, 22); ctx.fill(); ctx.shadowBlur = 0;
      ctx.globalAlpha = 1; ctx.fillStyle = "rgba(28,42,62,.62)"; roundedRect(-22, -55, 44, 110, 20); ctx.fill();
      ctx.fillStyle = color; roundedRect(-18, -52, 36, 104, 17); ctx.fill(); ctx.strokeStyle = "rgba(34,39,78,.72)"; ctx.lineWidth = 3; ctx.stroke();
      ctx.fillStyle = "rgba(20,35,58,.46)"; roundedRect(-10, -45, 20, 90, 10); ctx.fill();
      ctx.strokeStyle = light; ctx.lineWidth = 3; ctx.globalAlpha = .9;
      for (const y of [-28, -14, 0, 14, 28]) { ctx.beginPath(); ctx.moveTo(-11, y - 5); ctx.quadraticCurveTo(0, y + 8, 11, y - 5); ctx.stroke(); }
      ctx.lineWidth = 2; ctx.globalAlpha = .72; for (const radius of [10, 17, 24]) { ctx.beginPath(); ctx.arc(0, 0, radius, -1.05 + Math.sin(now / 500 + index) * .12, 1.05 + Math.sin(now / 500 + index) * .12); ctx.stroke(); }
      ctx.fillStyle = light; ctx.globalAlpha = .8; for (const [px, py] of [[-16,-40],[15,-24],[-15,22],[17,38]]) { ctx.beginPath(); ctx.arc(px + Math.sin(now / 260 + index + px) * 2, py + Math.cos(now / 300 + py) * 2, 2.2, 0, Math.PI * 2); ctx.fill(); }
      ctx.restore();
    }
    for (const o of map.obstacles || []) { ctx.save(); ctx.fillStyle = "rgba(39,48,57,.28)"; roundedRect(o.x + 7, o.y + 9, o.w, o.h, 16); ctx.fill(); ctx.fillStyle = "#737b7d"; roundedRect(o.x, o.y, o.w, o.h, 16); ctx.fill(); ctx.fillStyle = "#989b8c"; roundedRect(o.x + 7, o.y + 6, o.w - 14, o.h - 14, 12); ctx.fill(); ctx.strokeStyle = "#555e65"; ctx.lineWidth = 3; ctx.stroke(); ctx.restore(); }
  } else {
    path(4, 10); ctx.fillStyle = "rgba(0,0,0,.35)"; ctx.fill(); path(); ctx.fillStyle = "#8d603e"; ctx.fill(); path(0, -7); ctx.fillStyle = "#73a65d"; ctx.fill();
    ctx.save(); ctx.globalAlpha = .14; ctx.strokeStyle = "#d6e6a5"; ctx.lineWidth = 1; for (let x = 70; x < 850; x += 34) { ctx.beginPath(); ctx.moveTo(x, 60); ctx.lineTo(x, 540); ctx.stroke(); } for (let y = 70; y < 540; y += 34) { ctx.beginPath(); ctx.moveTo(60, y); ctx.lineTo(840, y); ctx.stroke(); } ctx.restore();
    for (const edge of map.edges || []) { ctx.strokeStyle = edge.broken ? "rgba(255,220,130,.25)" : edge.hp === 1 ? "#e8a34d" : "#d6c181"; ctx.lineWidth = edge.broken ? 3 : 7; ctx.setLineDash(edge.broken ? [8, 8] : []); ctx.beginPath(); ctx.moveTo(edge.a[0], edge.a[1]); ctx.lineTo(edge.b[0], edge.b[1]); ctx.stroke(); ctx.setLineDash([]); }
    for (const o of map.obstacles || []) { ctx.fillStyle = "#765036"; roundedRect(o.x + 5, o.y + 8, o.w, o.h, 12); ctx.fill(); ctx.fillStyle = "#a97849"; roundedRect(o.x, o.y, o.w, o.h, 12); ctx.fill(); ctx.strokeStyle = "#d4a36c"; ctx.lineWidth = 3; ctx.stroke(); }
    for (const portal of map.portals || []) { const pulse = 2 + Math.sin(now / 180) * 2; ctx.fillStyle = "rgba(106,217,255,.18)"; ctx.beginPath(); ctx.arc(portal.x, portal.y, 28 + pulse, 0, Math.PI * 2); ctx.fill(); ctx.strokeStyle = "#67d9ff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(portal.x, portal.y, 19 + pulse, 0, Math.PI * 2); ctx.stroke(); ctx.fillStyle = "#c8f7ff"; ctx.beginPath(); ctx.arc(portal.x, portal.y, 8, 0, Math.PI * 2); ctx.fill(); }
  }
}
const dogFx = {};
function drawDog(id, player, now) {
  const d = player.dog, nowMs = Date.now(), hit = d.hitFlashUntil > nowMs;
  const fx = dogFx[id] || (dogFx[id] = { wasAlive: d.alive, wasAttacking: false, attackStart: nowMs, spawnStart: d.alive ? nowMs : 0 });
  if (d.attacking && !fx.wasAttacking) fx.attackStart = nowMs;
  if (d.alive && !fx.wasAlive) fx.spawnStart = nowMs;
  fx.wasAlive = d.alive; fx.wasAttacking = d.attacking;
  if (hit && !hitSeen[id]) { tone(90, 0.16, "square", 0.05); hitSeen[id] = true; }
  if (!hit) hitSeen[id] = false;
  if (!d.alive) {
    const seconds = Math.max(0, (d.respawnAt - nowMs) / 1000);
    ctx.save(); ctx.globalAlpha = .8; ctx.fillStyle = "#fff"; ctx.font = "14px system-ui"; ctx.textAlign = "center"; ctx.fillText(`${id} 重生中 ${seconds.toFixed(1)}s`, d.x, d.y - 30); ctx.restore();
    return;
  }
  const palette = id === "p1"
    ? { collar: "#e57b86", collarLight: "#ffadb2", ear: "#d9c7a3", mask: "#9b795a", glow: "#ffafb5" }
    : { collar: "#78c96e", collarLight: "#a8ea8b", ear: "#c9c2a6", mask: "#8b795d", glow: "#a7ee92" };
  const angle = Math.atan2(d.facingY, d.facingX), phase = now / 180 + (id === "p2" ? 1 : 0);
  const bob = Math.sin(phase) * 1.5, tailWave = Math.sin(now / 110 + (id === "p2" ? .8 : 0)) * .08;
  const attackT = d.attacking ? Math.min(1, Math.max(0, (nowMs - fx.attackStart) / 160)) : 0;
  const attackPulse = d.attacking ? Math.sin(attackT * Math.PI) : 0;
  const spawnT = fx.spawnStart ? Math.min(1, Math.max(0, (nowMs - fx.spawnStart) / 360)) : 1;
  const spawnEase = 1 - Math.pow(1 - spawnT, 3), spawnScale = .82 + spawnEase * .18;
  const shake = hit ? Math.sin(nowMs / 24) * 2.5 : 0;
  const x = d.x + shake, y = d.y + bob;
  ctx.save(); ctx.translate(d.x + 3, d.y + 10); ctx.scale(1, .5); ctx.fillStyle = "rgba(0,0,0,.3)"; ctx.beginPath(); ctx.ellipse(0, 0, 31, 17, 0, 0, Math.PI * 2); ctx.fill(); ctx.restore();
  if (spawnT < 1) { ctx.save(); ctx.globalAlpha = .22 * (1 - spawnEase); ctx.strokeStyle = palette.glow; ctx.lineWidth = 3; ctx.beginPath(); ctx.arc(d.x, d.y, 29 + (1 - spawnEase) * 18, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  ctx.save(); ctx.globalAlpha = .42 + spawnEase * .58; ctx.translate(x, y); ctx.rotate(angle); ctx.scale(spawnScale, spawnScale);
  if (id === me) { ctx.save(); ctx.globalAlpha = .22; ctx.strokeStyle = palette.glow; ctx.lineWidth = 2; ctx.setLineDash([5, 5]); ctx.beginPath(); ctx.arc(0, 0, 31, 0, Math.PI * 2); ctx.stroke(); ctx.restore(); }
  const outline = "#6e5a43", fur = "#fbfaf0", furLight = "#ffffff";
  const noseLength = 38 + attackPulse * 63;
  const walk = Math.sin(now / 115 + (id === "p2" ? 1 : 0)) * 1.4;
  ctx.lineCap = "round"; ctx.lineJoin = "round";
  ctx.strokeStyle = outline; ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(-20, 1); ctx.bezierCurveTo(-30, -8 + tailWave * 8, -36, 5, -27, 9 + tailWave * 5); ctx.stroke();
  ctx.fillStyle = fur; ctx.strokeStyle = outline; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(-16, -9 + walk, 5, 7, -.22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-16, 9 - walk, 5, 7, .22, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(-6, 1, 19, 14, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = "rgba(214,207,187,.42)"; ctx.beginPath(); ctx.ellipse(-12, 7, 9, 4, .2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = palette.collar; roundedRect(-1, -13, 7, 26, 3); ctx.fill(); ctx.strokeStyle = outline; ctx.lineWidth = 1.7; ctx.stroke();
  ctx.fillStyle = palette.collarLight; roundedRect(0, -12, 2.5, 24, 1); ctx.fill();
  ctx.fillStyle = palette.ear; ctx.strokeStyle = outline; ctx.lineWidth = 2.5;
  ctx.beginPath(); ctx.ellipse(5, -10, 6, 8, -.35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.beginPath(); ctx.ellipse(5, 10, 6, 8, .35, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = furLight; ctx.beginPath(); ctx.ellipse(8, 0, 14, 13, 0, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
  ctx.fillStyle = palette.mask; ctx.beginPath(); ctx.ellipse(11, -6, 4.5, 4.1, -.2, 0, Math.PI * 2); ctx.ellipse(11, 6, 4.5, 4.1, .2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#382d28"; ctx.beginPath(); ctx.arc(12.5, -6, 2, 0, Math.PI * 2); ctx.arc(12.5, 6, 2, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = "#fff"; ctx.beginPath(); ctx.arc(13.2, -6.8, .8, 0, Math.PI * 2); ctx.arc(13.2, 5.2, .8, 0, Math.PI * 2); ctx.fill();
  ctx.fillStyle = outline; roundedRect(17, -5.5, noseLength + 4, 11, 5.5); ctx.fill();
  ctx.fillStyle = "#f3edda"; roundedRect(18, -3.5, noseLength + 1, 7, 3.5); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.6)"; roundedRect(24, -2.5, Math.max(10, noseLength - 12), 2, 1); ctx.fill();
  const tipX = 18 + noseLength;
  ctx.fillStyle = "#4f4034"; roundedRect(tipX - 2.5, -3.5, 5, 7, 2); ctx.fill();
  ctx.fillStyle = "rgba(255,255,255,.55)"; roundedRect(tipX - 1.4, -2.3, 1.2, 1.6, .6); ctx.fill();
  ctx.strokeStyle = outline; ctx.lineWidth = 1.8; ctx.beginPath(); ctx.moveTo(18, 4); ctx.quadraticCurveTo(22, 8, 27, 4); ctx.stroke();
  if (hit) { ctx.globalAlpha = .95; ctx.strokeStyle = "#fff"; ctx.lineWidth = 4; ctx.beginPath(); ctx.arc(0, 0, 38, 0, Math.PI * 2); ctx.stroke(); }
  ctx.restore();
  if (feedback[id]?.until > nowMs) { ctx.fillStyle = "#ffe08a"; ctx.font = "15px system-ui"; ctx.textAlign = "center"; ctx.fillText(feedback[id].text, d.x, d.y + 56); ctx.textAlign = "start"; }
  ctx.fillStyle = "#1d2b32"; roundedRect(d.x - 32, d.y - 58, 64, 7, 3); ctx.fill(); ctx.fillStyle = player.hp === 1 ? "#e85d5d" : player.hp === 2 ? "#f0c85a" : "#72d572"; roundedRect(d.x - 32, d.y - 58, 64 * (player.hp / 3), 7, 3); ctx.fill(); ctx.fillStyle = "#fff"; ctx.font = "13px system-ui"; ctx.fillText(`${id}  HP ${player.hp}`, d.x - 32, d.y - 65);
}
function draw() {
  drawMap(performance.now());
  for (const id in state.players) drawDog(id, state.players[id], performance.now());
  let overlayText = ""; if (state.phase === "waiting") overlayText = "等待第二名玩家…"; if (state.phase === "countdown") overlayText = `${Math.max(1, Math.ceil((state.countdownEnds - Date.now()) / 1000))}`; if (state.phase === "finished") overlayText = `玩家 ${state.winner} 胜利！按 R 重开`;
  if (overlayText) overlay(overlayText);
  if (roomFull) status.textContent = `房间 ${roomCode} 已满，请更换房间码`; else status.textContent = state.phase === "waiting" ? `房间 ${roomCode}｜等待第二名玩家…` : state.phase === "countdown" ? "准备开始…" : state.phase === "finished" ? `玩家 ${state.winner} 胜利｜对方狗生命耗尽` : `房间 ${roomCode}｜你的狗 HP:${state.players[me]?.hp || 0}/3｜WASD 移动，F 攻击`;
}
function overlay(text) { ctx.fillStyle = "rgba(5,12,18,.58)"; ctx.fillRect(35, 35, 830, 512); ctx.fillStyle = "#fff"; ctx.font = text.length < 4 ? "72px system-ui" : "24px system-ui"; ctx.textAlign = "center"; ctx.fillText(text, 450, 300); ctx.textAlign = "start"; ctx.font = "16px system-ui"; }
requestAnimationFrame(loop);














