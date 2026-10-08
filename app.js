const state = { items: [], type: "all", search: "", category: "all", location: "all", selectedReportType: "lost", claims: 0, pageSize: 8, user: null, selectedItem: null, authMode: "login" };
const $ = (selector) => document.querySelector(selector);
const $$ = (selector) => [...document.querySelectorAll(selector)];
const escape = value => String(value ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
const safeItem = item => Object.fromEntries(Object.entries(item).map(([key,value]) => [key, typeof value === "string" ? escape(value) : value]));
const photoPath = value => /^\/uploads\/[a-f0-9]{40}\.(jpg|png|webp)$/.test(value || "") ? value : "";
const dateLabel = date => date ? new Date(date).toLocaleDateString(undefined, { month: "short", day: "numeric" }) : "Recently";

async function api(path, options = {}) {
  const response = await fetch(path, { headers: { "Content-Type": "application/json", ...(options.headers || {}) }, credentials: "same-origin", ...options });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(payload.error || "Something went wrong.");
  return payload;
}

async function loadItems() {
  try { const result = await api("/api/items"); state.items = result.items; $("#statRecovered").textContent = result.stats.returned; $("#statReports").textContent = result.stats.reports; $("#connectionError").classList.add("hidden"); } catch { $("#connectionError").classList.remove("hidden"); }
  renderItems();
}

async function loadUser() {
  try { state.user = (await api("/api/auth/me")).user; } catch { state.user = null; }
  if (state.user) { $(".profile-name").textContent = state.user.name; $(".avatar").textContent = state.user.name.split(" ").map((part) => part[0]).join("").slice(0, 2).toUpperCase(); $("#profileEmail").textContent = state.user.email; $("#profileRole").textContent = `${state.user.role} account`; } else { $(".profile-name").textContent = "Sign in"; $(".avatar").textContent = "?"; $("#adminPanel").classList.add("hidden"); }
  $("#adminPanel").classList.add("hidden");
  if (state.user?.role === "admin") await renderAdmin();
  await loadDashboard();
  updateCounts();
}

async function renderAdmin() {
  try {
    const result = await api("/api/admin/overview"); result.items = result.items.map(safeItem); result.claims = result.claims.map(safeItem);
    $("#adminPanel").classList.remove("hidden");
    $("#adminRows").innerHTML = result.items.map((item) => `<tr><td><strong>${item.title}</strong>${photoPath(item.imageUrl) ? `<a href="${photoPath(item.imageUrl)}" target="_blank" rel="noopener"><img class="admin-photo" src="${photoPath(item.imageUrl)}" alt="${item.title}" /></a>` : ""}<p class="review-details">${item.description}</p><small>${item.location} · ${item.date || dateLabel(item.createdAt)}</small></td><td>${item.type}</td><td>${item.reporter || "Member"}</td><td><span class="status-pill ${item.status === "approved" ? "approved" : ""}">${item.status}</span></td><td>${item.status === "pending" ? `<button class="admin-action" data-admin-id="${item.id}" data-status="approved">Approve</button><button class="admin-action reject" data-admin-id="${item.id}" data-status="rejected">Reject</button>` : "—"}</td></tr>`).join("");
    $("#claimRows").innerHTML = result.claims.length ? result.claims.map((claim) => { const item = result.items.find((entry) => entry.id === claim.itemId); return `<tr><td>${item?.title || "Removed item"}</td><td>${claim.claimantName}</td><td class="claim-details">${claim.message}</td><td><span class="status-pill ${claim.status === "approved" ? "approved" : ""}">${claim.status}</span></td><td>${claim.status === "pending" ? `<button class="admin-action" data-claim-id="${claim.id}" data-claim-status="approved">Approve</button><button class="admin-action reject" data-claim-id="${claim.id}" data-claim-status="rejected">Reject</button>` : "—"}</td></tr>`; }).join("") : `<tr><td colspan="5">No claims have been submitted yet.</td></tr>`;
    $$(".admin-action[data-admin-id]").forEach((button) => button.addEventListener("click", async () => { try { await api(`/api/admin/items/${button.dataset.adminId}`, { method: "PATCH", body: JSON.stringify({ status: button.dataset.status }) }); await renderAdmin(); await loadItems(); await loadDashboard(); toast("Report reviewed."); } catch (error) { toast(error.message); } }));
    $$(".admin-action[data-claim-id]").forEach((button) => button.addEventListener("click", async () => { try { const status = button.dataset.claimStatus; await api(`/api/admin/claims/${button.dataset.claimId}`, { method: "PATCH", body: JSON.stringify({ status }) }); await renderAdmin(); await loadItems(); await loadDashboard(); toast(status === "approved" ? "Claim approved and item marked as returned." : "Claim rejected."); } catch (error) { toast(error.message); } }));
  } catch (error) { toast(error.message); }
}

function renderItems() {
  const query = state.search.toLowerCase();
  const filtered = state.items.filter((item) => { const haystack = `${item.title} ${item.category} ${item.location} ${item.description}`.toLowerCase(); return (state.type === "all" || item.type === state.type) && haystack.includes(query) && (state.category === "all" || item.category === state.category) && (state.location === "all" || item.location === state.location); });
  $("#itemsGrid").innerHTML = filtered.slice(0, state.pageSize).map(cardTemplate).join("");
  $("#emptyState").classList.toggle("hidden", filtered.length !== 0);
  $("#loadMore").classList.toggle("hidden", filtered.length <= state.pageSize);
  $$(".claim-button").forEach((button) => button.addEventListener("click", () => openClaim(Number(button.dataset.id))));
  updateCounts();
}

function cardTemplate(raw) { const item = safeItem(raw); const label = item.type === "lost" ? "LOST" : "FOUND"; return `<article class="item-card"><div class="item-visual ${item.visual || "visual-peach"}"><small>${label}</small>${photoPath(item.imageUrl) ? `<img class="item-photo" src="${photoPath(item.imageUrl)}" alt="${item.title}" loading="lazy" />` : `<span>${item.icon || "✦"}</span>`}</div><div class="item-body"><h3>${item.title}</h3><div class="item-meta"><span>⌖</span><span>${item.location}</span><span>·</span><span>${dateLabel(raw.createdAt)}</span></div><div class="item-footer"><small>by ${item.reporter || "Campus member"}</small>${item.type === "found" ? `<button class="claim-button" data-id="${item.id}">This is mine →</button>` : `<button class="claim-button" data-id="${item.id}">View details →</button>`}</div></div></article>`; }

function updateCounts() { $("#allCount").textContent = state.items.length; $("#lostCount").textContent = state.items.filter(item => item.type === "lost").length; $("#foundCount").textContent = state.items.filter(item => item.type === "found").length; $("#statActive").textContent = state.items.length; }
async function loadDashboard() {
  $("#dashboardPrompt").classList.toggle("hidden", !!state.user);
  $("#activityLists").classList.toggle("hidden", !state.user);
  $("#memberBadge").textContent = state.user ? "Signed in" : "Sign in to track your activity";
  ["myReports", "myClaims", "myReturned"].forEach(id => $("#" + id).textContent = "0");
  $("#reportHistory").innerHTML = ""; $("#claimHistory").innerHTML = "";
  if (!state.user) return;
  try {
    const data = await api("/api/dashboard");
    $("#myReports").textContent = data.reports.length;
    $("#myClaims").textContent = data.claims.length;
    $("#myReturned").textContent = data.claims.filter(c => c.status === "approved").length;
    $("#reportHistory").innerHTML = data.reports.length ? data.reports.map(r => `<li><div><strong>${escape(r.title)}</strong><p>${escape(r.type)} · ${escape(r.location)} · ${dateLabel(r.createdAt)}</p></div><span class="status-pill ${r.status === "approved" ? "approved" : ""}">${escape(r.status)}</span></li>`).join("") : "<li>No reports yet. Submit your first report above.</li>";
    $("#claimHistory").innerHTML = data.claims.length ? data.claims.map(c => `<li><div><strong>${escape(c.itemTitle)}</strong><p>${escape(c.message)}</p></div><span class="status-pill ${c.status === "approved" ? "approved" : ""}">${escape(c.status)}</span></li>`).join("") : "<li>No claims yet. Browse found items to make a claim.</li>";
  } catch (error) { toast(error.message); }
}
function toast(message) { $("#toastMessage").textContent = message; $("#toast").classList.remove("hidden"); window.setTimeout(() => $("#toast").classList.add("hidden"), 3200); }
function closeModal() { $("#modalBackdrop").classList.add("hidden"); }
function openClaim(id) { state.selectedItem = id; const item = state.items.find((entry) => entry.id === id); $("#modalTitle").textContent = item.type === "found" ? `Claim “${item.title}”` : `Details for “${item.title}”`; $("#modalDescription").textContent = item.type === "found" ? `${item.description} — Add identifying details for the admin to verify privately.` : item.description; $("#detailPhoto").classList.toggle("hidden", !photoPath(item.imageUrl)); if (photoPath(item.imageUrl)) $("#detailPhoto").src = photoPath(item.imageUrl); else $("#detailPhoto").removeAttribute("src"); $("#claimForm").reset(); $("#claimForm").classList.toggle("hidden", item.type !== "found" || item.reporterId === state.user?.id); $("#modalBackdrop").classList.remove("hidden"); }
function openAuth(mode = "login") { state.authMode = mode; $("#authTitle").textContent = mode === "login" ? "Welcome back" : "Join CampusLost"; $("#authDescription").textContent = mode === "login" ? "Sign in to report items and manage your claims." : "Create a campus member account to get started."; $("#authSubmit").innerHTML = `${mode === "login" ? "Sign in" : "Create account"} <span>→</span>`; $("#authSwitch").textContent = mode === "login" ? "Need an account? Create one" : "Already have an account? Sign in"; $("#authForm [name=name]").parentElement.classList.toggle("hidden", mode === "login"); $("#authForm [name=name]").required = mode === "register"; $("#authForm [name=password]").minLength = mode === "register" ? 8 : 1; $("#authBackdrop").classList.remove("hidden"); }

$$('.segment').forEach((button) => button.addEventListener('click', () => { $$('.segment').forEach((item) => item.classList.remove('active')); button.classList.add('active'); state.type = button.dataset.type; state.pageSize = 8; renderItems(); }));
$("#searchInput").addEventListener("input", (event) => { state.search = event.target.value; state.pageSize = 8; renderItems(); }); $("#categoryFilter").addEventListener("change", (event) => { state.category = event.target.value; state.pageSize = 8; renderItems(); }); $("#locationFilter").addEventListener("change", (event) => { state.location = event.target.value; state.pageSize = 8; renderItems(); }); $("#filterToggle").addEventListener("click", () => $("#filterRow").classList.toggle("hidden"));
$("#clearFilters").addEventListener("click", () => { state.category = "all"; state.location = "all"; state.search = ""; $("#categoryFilter").value = "all"; $("#locationFilter").value = "all"; $("#searchInput").value = ""; renderItems(); });
$("#modalClose").addEventListener("click", closeModal); $("#authClose").addEventListener("click", () => $("#authBackdrop").classList.add("hidden")); $("#modalBackdrop").addEventListener("click", (event) => { if (event.target.id === "modalBackdrop") closeModal(); }); $("#authBackdrop").addEventListener("click", (event) => { if (event.target.id === "authBackdrop") $("#authBackdrop").classList.add("hidden"); });
$("#howItWorks").addEventListener("click", () => toast("Report an item, browse matches, and help return it to its owner.")); $("#loadMore").addEventListener("click", () => { state.pageSize += 8; renderItems(); });
$$('.type-card').forEach((button) => button.addEventListener('click', () => { $$('.type-card').forEach((item) => item.classList.remove('selected')); button.classList.add('selected'); state.selectedReportType = button.dataset.reportType; }));

let reportPhoto = null;
let photoVersion = 0;
let photoLoading = false;
function clearPhoto() {
  photoVersion++; reportPhoto = null; photoLoading = false;
  $("#reportPhoto").value = "";
  $("#photoPreviewWrap").classList.add("hidden");
  $("#photoPreview").removeAttribute("src");
  $("#photoError").classList.add("hidden");
}
$("#removePhoto").addEventListener("click", clearPhoto);
$("#reportPhoto").addEventListener("change", async event => {
  const file = event.target.files[0];
  const version = ++photoVersion;
  reportPhoto = null;
  $("#photoPreviewWrap").classList.add("hidden");
  $("#photoError").classList.add("hidden");
  if (!file) { photoLoading = false; return; }
  photoLoading = true;
  try {
    if (!["image/jpeg", "image/png", "image/webp"].includes(file.type)) throw new Error("Choose a JPEG, PNG or WebP photo.");
    if (file.size > 2 * 1024 * 1024) throw new Error("Photo must be 2 MB or smaller.");
    const bitmap = await createImageBitmap(file);
    if (version !== photoVersion) { bitmap.close(); return; }
    // Re-encode to strip metadata and keep previews and uploads small.
    const scale = Math.min(1, 1600 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale)); canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d"); context.fillStyle = "#ffffff"; context.fillRect(0,0,canvas.width,canvas.height); context.drawImage(bitmap, 0, 0, canvas.width, canvas.height); bitmap.close();
    const photo = canvas.toDataURL("image/jpeg", 0.85);
    if (photo.length > 2800000) throw new Error("This photo is too large. Choose a smaller image.");
    reportPhoto = photo; $("#photoPreview").src = photo; $("#photoPreviewWrap").classList.remove("hidden");
  } catch (error) {
    if (version === photoVersion) { $("#photoError").textContent = error.message || "Unable to read this photo."; $("#photoError").classList.remove("hidden"); $("#reportPhoto").value = ""; }
  } finally { if (version === photoVersion) photoLoading = false; }
});
const today = new Date(); const localDate = `${today.getFullYear()}-${String(today.getMonth()+1).padStart(2,"0")}-${String(today.getDate()).padStart(2,"0")}`;
$("#reportForm [name=date]").max = localDate;
$("#reportForm [name=date]").value = localDate;
$("#reportForm").addEventListener("submit", async (event) => { event.preventDefault(); if (!state.user) return openAuth(); if (photoLoading) return toast("Please wait for the photo preview."); const submit = event.target.querySelector("button[type=submit]"); if (submit.disabled) return; submit.disabled = true; const form = new FormData(event.target); try { await api("/api/items", { method: "POST", body: JSON.stringify({ title: form.get("title"), type: state.selectedReportType, category: form.get("category"), location: form.get("location"), description: form.get("description"), date: form.get("date"), photo: reportPhoto }) }); event.target.reset(); clearPhoto(); $("#reportForm [name=date]").value = localDate; await loadItems(); await loadDashboard(); if (state.user.role === "admin") await renderAdmin(); toast("Report submitted for admin review."); window.location.hash = "browse"; } catch (error) { toast(error.message); } finally { submit.disabled = false; } });
$("#claimForm").addEventListener("submit", async (event) => { event.preventDefault(); if (!state.user) { closeModal(); return openAuth(); } try { await api(`/api/items/${state.selectedItem}/claims`, { method: "POST", body: JSON.stringify({ message: event.target.querySelector("textarea").value }) }); await loadDashboard(); if (state.user.role === "admin") await renderAdmin(); closeModal(); event.target.reset(); updateCounts(); toast("Claim sent privately to the campus admin."); } catch (error) { toast(error.message); } });
$("#profileChip").addEventListener("click", () => { if (!state.user) return openAuth(); const dropdown = $("#profileDropdown"); dropdown.classList.toggle("hidden"); $("#profileChip").setAttribute("aria-expanded", String(!dropdown.classList.contains("hidden"))); }); $("#authSwitch").addEventListener("click", () => openAuth(state.authMode === "login" ? "register" : "login"));
$("#logoutButton").addEventListener("click", async () => { try { await api("/api/auth/logout", { method: "POST" }); state.user = null; $("#profileDropdown").classList.add("hidden"); await loadUser(); toast("You have been signed out."); openAuth("login"); } catch (error) { toast(error.message); } });
$("#authForm").addEventListener("submit", async (event) => { event.preventDefault(); const form = new FormData(event.target); try { const path = state.authMode === "login" ? "/api/auth/login" : "/api/auth/register"; const result = await api(path, { method: "POST", body: JSON.stringify({ name: form.get("name"), email: form.get("email"), password: form.get("password") }) }); state.user = result.user; $("#authBackdrop").classList.add("hidden"); await loadUser(); toast(`Welcome, ${state.user.name.split(" ")[0]}!`); } catch (error) { toast(error.message); } });

$("#dashboardSignIn").addEventListener("click", () => openAuth());
$("#refreshActivity").addEventListener("click", async () => { await loadItems(); await loadUser(); toast("Activity refreshed."); });
$("#retryConnection").addEventListener("click", loadItems);
document.addEventListener("keydown", event => { if (event.key === "Escape") { closeModal(); $("#authBackdrop").classList.add("hidden"); $("#profileDropdown").classList.add("hidden"); } });
loadItems(); loadUser();

api("/api/config").then(config => { if (config?.demoMode) { $("#demoBanner").classList.remove("hidden"); $("#demoAccounts").classList.remove("hidden"); } }).catch(() => {});
