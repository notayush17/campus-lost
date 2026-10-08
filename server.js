const http = require("node:http");
const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");

const PORT = Number(process.env.PORT || 3000);
const ROOT = __dirname;
const DATA_FILE = process.env.DATA_FILE || path.join(ROOT, "data.json");
const UPLOAD_DIR = process.env.UPLOAD_DIR || path.join(ROOT, "uploads");
const DEMO_MODE = process.env.DEMO_MODE === "true";
const sessions = new Map();
const loginAttempts = new Map();
const categories = ["Electronics", "Accessories", "Study", "Clothing", "Keys"];
const locations = ["Library", "Garden Boys Hostel", "Girls Hostel", "Placement Cell", "Sports Complex", "Cafeteria"];
let database;
function fail(status, message) { const error = new Error(message); error.status = status; throw error; }
function field(input, key, min = 1, max = 500) { const value = input[key]; if (typeof value !== "string" || value.trim().length < min || value.trim().length > max) fail(400, `Please enter a valid ${key} (${min}–${max} characters).`); return value.trim(); }
function admin(req, res, data) { const user = currentUser(req, data); if (!user) fail(401, "Please sign in first."); if (user.role !== "admin") fail(403, "Admin access required."); return user; }

const seedItems = [
  ["Blue water bottle", "found", "Accessories", "Library", "A matte blue bottle with a small white sticker near the cap.", "♒", "visual-blue", "Riya S."],
  ["Black wireless earbuds", "lost", "Electronics", "Garden Boys Hostel", "Black earbuds in a small charging case. Left earbud has a tiny mark.", "◉", "visual-peach", "Ayush K."],
  ["Calculus notebook", "found", "Study", "Placement Cell", "Purple spiral notebook with handwritten notes and a yellow tab.", "▤", "visual-lilac", "Dev M."],
  ["Silver keychain", "lost", "Keys", "Cafeteria", "Silver keychain with three keys and a tiny green charm.", "⚿", "visual-yellow", "Meera P."],
  ["Grey hoodie", "found", "Clothing", "Sports Complex", "Oversized grey hoodie, size M, found on the second-floor bench.", "♧", "visual-blue", "Kabir R."],
  ["USB-C adapter", "lost", "Electronics", "Library", "Small white USB-C to HDMI adapter with a grey pouch.", "▣", "visual-peach", "Nisha T."],
  ["Brown leather wallet", "found", "Accessories", "Placement Cell", "Brown wallet with no cash inside. Initials may be embossed on the back.", "▰", "visual-yellow", "Sahil J."],
  ["Green geometry box", "lost", "Study", "Girls Hostel", "Green geometry box with a name label inside the lid.", "△", "visual-lilac", "Ishita B."]
];

function hashPassword(password, salt = crypto.randomBytes(16).toString("hex")) {
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `${salt}:${hash}`;
}

function validPassword(password, stored) {
  const [salt, original] = stored.split(":");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(hash, "hex"), Buffer.from(original, "hex"));
}

function initialData() {
  return {
    users: [
      { id: 1, name: "Ayush Kumar", email: "ayush@campuslost.local", passwordHash: hashPassword("Password123!"), role: "student" },
      { id: 2, name: "Campus Admin", email: "admin@campuslost.local", passwordHash: hashPassword("Admin123!"), role: "admin" }
    ],
    items: seedItems.map((item, index) => ({ id: index + 1, title: item[0], type: item[1], category: item[2], location: item[3], description: item[4], icon: item[5], visual: item[6], reporter: item[7], status: "approved", createdAt: new Date().toISOString() })),
    claims: [],
    nextIds: { user: 3, item: 9, claim: 1 }
  };
}

function readData() {
  if (!fs.existsSync(DATA_FILE)) fs.writeFileSync(DATA_FILE, JSON.stringify(initialData(), null, 2));
  if (!database) {
    database = JSON.parse(fs.readFileSync(DATA_FILE, "utf8"));
    for (const item of database.items) {
      if (item.location === "North Block") item.location = "Placement Cell";
      if (item.location === "Student Centre") item.location = item.id === 8 && !item.reporterId ? "Girls Hostel" : "Garden Boys Hostel";
    }
  }
  return database;
}

function writeData(data) { fs.writeFileSync(DATA_FILE + ".tmp", JSON.stringify(data, null, 2), { mode: 0o600 }); fs.renameSync(DATA_FILE + ".tmp", DATA_FILE); }
function send(res, status, payload) { res.writeHead(status, { "Content-Type": "application/json; charset=utf-8" }); res.end(JSON.stringify(payload)); }
function parseCookies(req) { return Object.fromEntries((req.headers.cookie || "").split(";").filter(Boolean).map((part) => part.trim().split("="))); }
function currentUser(req, data) { const session = sessions.get(parseCookies(req).campus_session); return session && session.expiresAt > Date.now() ? data.users.find((user) => user.id === session.userId) : null; }
function safeUser(user) { return user && { id: user.id, name: user.name, email: user.email, role: user.role }; }
function requireUser(req, res, data) { const user = currentUser(req, data); if (!user) send(res, 401, { error: "Please sign in first." }); return user; }
function body(req) { return new Promise((resolve, reject) => { let raw = ""; req.on("data", (chunk) => { raw += chunk; if (raw.length > 3000000) { reject(Object.assign(new Error("Request is too large."), { status: 413 })); req.destroy(); } }); req.on("end", () => { try { const value = raw ? JSON.parse(raw) : {}; if (!value || typeof value !== "object" || Array.isArray(value)) fail(400, "Invalid request body."); resolve(value); } catch { reject(Object.assign(new Error("Invalid JSON"), { status: 400 })); } }); }); }
// Only raster images are accepted; filenames are generated by the server.
function savePhoto(value) {
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") fail(400, "Choose a JPEG, PNG or WebP photo.");
  const match = value.match(/^data:image\/(jpeg|png|webp);base64,([A-Za-z0-9+/]+={0,2})$/);
  if (!match) fail(400, "Choose a JPEG, PNG or WebP photo.");
  const bytes = Buffer.from(match[2], "base64");
  if (bytes.length > 2 * 1024 * 1024) fail(413, "Photo must be 2 MB or smaller.");
  const valid = bytes.length >= 12 && (match[1] === "jpeg" ? bytes[0] === 255 && bytes[1] === 216 && bytes[2] === 255 && bytes.at(-2) === 255 && bytes.at(-1) === 217 : match[1] === "png" ? bytes.subarray(0, 8).equals(Buffer.from([137,80,78,71,13,10,26,10])) && bytes.subarray(-8,-4).toString() === "IEND" : bytes.subarray(0,4).toString() === "RIFF" && bytes.subarray(8,12).toString() === "WEBP" && bytes.readUInt32LE(4) === bytes.length - 8);
  if (!valid) fail(400, "The selected file is not a valid supported photo.");
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
  const filename = crypto.randomBytes(20).toString("hex") + "." + (match[1] === "jpeg" ? "jpg" : match[1]);
  fs.writeFileSync(path.join(UPLOAD_DIR, filename), bytes, { flag: "wx", mode: 0o600 });
  return "/uploads/" + filename;
}
function cookie(value, maxAge = 60 * 60 * 24 * 7) { return `campus_session=${value}; HttpOnly; SameSite=Lax; Path=/; Max-Age=${maxAge}${process.env.NODE_ENV === "production" ? "; Secure" : ""}`; }

async function api(req, res, pathname, data) {
  if (req.method === "GET" && pathname === "/api/config") return send(res, 200, { demoMode: DEMO_MODE });
  if (req.method === "POST" && ["/api/auth/login", "/api/auth/register"].includes(pathname)) {
    const now = Date.now();
    // Bound memory and throttle authentication work on the single-process demo.
    for (const [key, value] of loginAttempts) if (value.until <= now) loginAttempts.delete(key);
    const key = req.socket.remoteAddress || "local";
    const attempts = loginAttempts.get(key) || { count: 0, until: now + 60000 };
    if (++attempts.count > 60) fail(429, "Too many sign-in attempts. Please wait a minute.");
    loginAttempts.set(key, attempts);
  }

  if (req.method === "GET" && pathname === "/api/items") {
    const url = new URL(req.url, `http://${req.headers.host}`); const q = (url.searchParams.get("q") || "").toLowerCase(); const type = url.searchParams.get("type") || "all"; const category = url.searchParams.get("category") || "all"; const location = url.searchParams.get("location") || "all";
    const items = data.items.filter((item) => item.status === "approved" && (type === "all" || item.type === type) && (category === "all" || item.category === category) && (location === "all" || item.location === location) && `${item.title} ${item.category} ${item.location} ${item.description}`.toLowerCase().includes(q));
    return send(res, 200, { items, stats: { returned: data.items.filter(item => item.status === "returned").length, reports: data.items.length } });
  }
  if (req.method === "GET" && pathname === "/api/auth/me") return send(res, 200, { user: safeUser(currentUser(req, data)) });
  if (req.method === "POST" && pathname === "/api/auth/register") {
    if (DEMO_MODE && data.users.length >= 50) fail(429, "Demo account limit reached. Use the sample accounts.");
    const input = await body(req); input.name = field(input, "name", 2, 80); input.email = field(input, "email", 3, 254).toLowerCase(); input.password = field(input, "password", 8, 128); if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email)) fail(400, "Please enter a valid email address."); if (!input.name || !input.email || !input.password || input.password.length < 8) return send(res, 400, { error: "Name, email and an 8-character password are required." });
    if (data.users.some((user) => user.email.toLowerCase() === input.email.toLowerCase())) return send(res, 409, { error: "An account with that email already exists." });
    const user = { id: data.nextIds.user++, name: input.name.trim(), email: input.email.trim().toLowerCase(), passwordHash: hashPassword(input.password), role: "student" }; data.users.push(user); writeData(data); const sessionId = crypto.randomBytes(24).toString("hex"); sessions.set(sessionId, { userId: user.id, expiresAt: Date.now() + 604800000 }); res.setHeader("Set-Cookie", cookie(sessionId)); return send(res, 201, { user: safeUser(user) });
  }
  if (req.method === "POST" && pathname === "/api/auth/login") {
    const input = await body(req); input.email = field(input, "email", 3, 254).toLowerCase(); input.password = field(input, "password", 1, 128); const user = data.users.find((entry) => entry.email === String(input.email || "").toLowerCase()); if (!user || !input.password || !validPassword(input.password, user.passwordHash)) return send(res, 401, { error: "Email or password is incorrect." });
    const sessionId = crypto.randomBytes(24).toString("hex"); sessions.set(sessionId, { userId: user.id, expiresAt: Date.now() + 604800000 }); res.setHeader("Set-Cookie", cookie(sessionId)); return send(res, 200, { user: safeUser(user) });
  }
  if (req.method === "POST" && pathname === "/api/auth/logout") { const sessionId = parseCookies(req).campus_session; sessions.delete(sessionId); res.setHeader("Set-Cookie", cookie("", 0)); return send(res, 200, { ok: true }); }
  if (req.method === "POST" && pathname === "/api/items") {
    const user = requireUser(req, res, data); if (!user) return; const input = await body(req); input.title = field(input, "title", 2, 100); input.description = field(input, "description", 10, 2000); if (!["lost", "found"].includes(input.type) || !categories.includes(input.category) || !locations.includes(input.location)) fail(400, "Choose a valid type, category and location."); if (typeof input.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(input.date) || !Number.isFinite(Date.parse(input.date)) || input.date > new Date(Date.now() + 86400000).toISOString().slice(0,10)) fail(400, "Choose a valid date that is not in the future."); if (!input.title || !input.type || !input.category || !input.location || !input.description) return send(res, 400, { error: "Please complete all report fields." });
    if (DEMO_MODE && data.items.length >= 100) fail(429, "The demo report limit has been reached.");
    const imageUrl = savePhoto(input.photo);
    const item = { imageUrl, id: data.nextIds.item++, title: input.title.trim(), type: input.type, category: input.category, location: input.location, description: input.description.trim(), icon: input.type === "lost" ? "!" : "✓", visual: "visual-peach", reporter: user.name === "Ayush Kumar" ? "Ayush K." : user.name, status: "pending", createdAt: new Date().toISOString(), reporterId: user.id, date: input.date }; data.items.unshift(item); writeData(data); return send(res, 201, { item });
  }
  const claimMatch = pathname.match(/^\/api\/items\/(\d+)\/claims$/);
  if (req.method === "POST" && claimMatch) { const user = requireUser(req, res, data); if (!user) return; const item = data.items.find((entry) => entry.id === Number(claimMatch[1])); if (!item) return send(res, 404, { error: "Item not found." }); if (item.type !== "found" || item.status !== "approved") fail(409, "Only available found items can be claimed."); if (item.reporterId === user.id) fail(409, "You cannot claim your own report."); if (data.claims.some(c => c.itemId === item.id && c.claimantId === user.id && ["pending", "approved"].includes(c.status))) fail(409, "You have already submitted a claim for this item."); const input = await body(req); input.message = field(input, "message", 10, 2000); if (!input.message) return send(res, 400, { error: "Please add identifying details." }); if (DEMO_MODE && data.claims.length >= 300) fail(429, "The demo claim limit has been reached."); const claim = { id: data.nextIds.claim++, itemId: item.id, claimantId: user.id, claimantName: user.name, message: input.message, status: "pending", createdAt: new Date().toISOString() }; data.claims.push(claim); writeData(data); return send(res, 201, { claim }); }
  if (req.method === "GET" && pathname === "/api/dashboard") { const user = requireUser(req, res, data); if (!user) return; return send(res, 200, { reports: data.items.filter((item) => item.reporterId === user.id), claims: data.claims.filter((claim) => claim.claimantId === user.id).map(claim => ({ ...claim, itemTitle: data.items.find(item => item.id === claim.itemId)?.title || "Item unavailable" })) }); }
  if (req.method === "GET" && pathname === "/api/admin/overview") { const user = admin(req, res, data); return send(res, 200, { items: data.items, claims: data.claims }); }
  const adminItem = pathname.match(/^\/api\/admin\/items\/(\d+)$/);
  if (req.method === "PATCH" && adminItem) { const user = admin(req, res, data); const item = data.items.find((entry) => entry.id === Number(adminItem[1])); if (!item) return send(res, 404, { error: "Item not found." }); const input = await body(req); if (item.status !== "pending" || !["approved", "rejected"].includes(input.status)) fail(409, "Only pending reports can be approved or rejected."); item.status = input.status; writeData(data); return send(res, 200, { item }); }
  const adminClaim = pathname.match(/^\/api\/admin\/claims\/(\d+)$/);
  if (req.method === "PATCH" && adminClaim) { const user = admin(req, res, data); const claim = data.claims.find((entry) => entry.id === Number(adminClaim[1])); if (!claim) return send(res, 404, { error: "Claim not found." }); const input = await body(req); if (!["approved", "rejected"].includes(input.status)) return send(res, 400, { error: "Choose approved or rejected." }); if (claim.status !== "pending") fail(409, "This claim has already been reviewed."); const claimedItem = data.items.find(item => item.id === claim.itemId); if (input.status === "approved" && claimedItem?.status !== "approved") fail(409, "This item is no longer available."); claim.status = input.status; claim.reviewedAt = new Date().toISOString(); claim.reviewedBy = user.id; if (input.status === "approved") { const item = data.items.find((entry) => entry.id === claim.itemId); if (item) item.status = "returned"; data.claims.forEach(other => { if (other.itemId === claim.itemId && other.id !== claim.id && other.status === "pending") { other.status = "rejected"; other.reviewedAt = new Date().toISOString(); } }); } writeData(data); return send(res, 200, { claim }); }
  return send(res, 404, { error: "Route not found." });
}

const server = http.createServer(async (req, res) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("Content-Security-Policy", "default-src 'self'; style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; img-src 'self' data:; frame-ancestors 'none'; base-uri 'self'; form-action 'self'");
  try {
    const pathname = new URL(req.url, "http://localhost").pathname;
    if (pathname.startsWith("/api/")) {
      if (!["GET", "HEAD"].includes(req.method)) {
        if (req.headers.origin && req.headers.origin !== `http://${req.headers.host}` && req.headers.origin !== `https://${req.headers.host}`) fail(403, "Cross-origin requests are not allowed.");
        if (req.headers["sec-fetch-site"] === "cross-site") fail(403, "Cross-origin requests are not allowed.");
        if (!(req.headers["content-type"] || "").startsWith("application/json")) fail(415, "Send JSON data.");
      }
      await api(req, res, pathname, readData());
      return;
    }
    const imageMatch = pathname.match(/^\/uploads\/([a-f0-9]{40}\.(jpg|png|webp))$/);
    if (imageMatch && ["GET", "HEAD"].includes(req.method)) {
      const data = readData();
      const item = data.items.find(entry => entry.imageUrl === pathname);
      const user = currentUser(req, data);
      if (!item || (item.status !== "approved" && user?.role !== "admin" && user?.id !== item.reporterId)) return send(res, 404, { error: "Not found." });
      const filename = path.join(UPLOAD_DIR, imageMatch[1]);
      if (!fs.existsSync(filename)) return send(res, 404, { error: "Photo unavailable." });
      res.writeHead(200, { "Content-Type": "image/" + (imageMatch[2] === "jpg" ? "jpeg" : imageMatch[2]), "Content-Length": fs.statSync(filename).size });
      if (req.method === "HEAD") return res.end();
      fs.createReadStream(filename).pipe(res); return;
    }
    const assets = { "/": ["index.html", "text/html"], "/index.html": ["index.html", "text/html"], "/styles.css": ["styles.css", "text/css"], "/app.js": ["app.js", "text/javascript"] };
    const asset = assets[pathname];
    if (!asset || !["GET", "HEAD"].includes(req.method)) return send(res, 404, { error: "Not found." });
    res.writeHead(200, { "Content-Type": asset[1] + "; charset=utf-8" });
    if (req.method === "HEAD") return res.end();
    fs.createReadStream(path.join(ROOT, asset[0])).pipe(res);
  } catch (error) { if (!res.headersSent) send(res, error.status || 500, { error: error.status ? error.message : "Unable to process this request." }); }
});
if (require.main === module) server.listen(PORT, process.env.HOST || "127.0.0.1", () => console.log(`CampusLost is running at http://127.0.0.1:${PORT}`));
module.exports = { server };
