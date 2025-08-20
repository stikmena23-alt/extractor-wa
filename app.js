// =================== TU LÓGICA EXISTENTE ===================

// DOM
const inputText = document.getElementById("inputText");
const accountIdEl = document.getElementById("accountId");

const fileInput = document.getElementById("fileInput");
const processBtn = document.getElementById("processBtn");
const addToBatchBtn = document.getElementById("addToBatchBtn");
const clearBtn = document.getElementById("clearBtn");

const contactsList = document.getElementById("contactsList");
const showAllEl = document.getElementById("showAll");
const statTotal = document.getElementById("stat-total");
const statUnique = document.getElementById("stat-unique");

const downloadBtn = document.getElementById("downloadBtn");
const exportMergedBtn = document.getElementById("exportMergedBtn");
const batchList = document.getElementById("batchList");
const clearBatchBtn = document.getElementById("clearBatchBtn");

// Estado
let currentContacts = [];       // contactos dedup del panel "Entrada"
let batch = [];                 // [{ id, objective, contacts: Set<string> }]

// Utils
function normalizeNumber(n){ return String(n).replace(/\D+/g, ""); }
function stripCountry57(d){
  if (!d) return "";
  if (d.startsWith("0057")) return d.slice(4);
  if (d.startsWith("57") && d.length > 2) return d.slice(2);
  return d;
}
function uniq(arr){ return Array.from(new Set(arr)); }

// Parseo de texto a contactos (solo dígitos, quita +57/57/0057)
function textToContacts(text){
  const matches = text.match(/\d{6,}/g) || [];
  const clean = [];
  for (let n of matches){
    n = stripCountry57(normalizeNumber(n));
    if (n) clean.push(n);
  }
  return uniq(clean);
}

// Render de vista previa
function renderPreview(){
  const total = currentContacts.length;
  const unique = uniq(currentContacts).length;

  statTotal.textContent = String(total);
  statUnique.textContent = String(unique);

  contactsList.innerHTML = "";
  const limit = showAllEl.checked ? total : Math.min(100, total); // ver todo o top 100
  for (let i=0; i<limit; i++){
    const c = currentContacts[i];
    const row = document.createElement("div");
    row.className = "rowline";
    const b = document.createElement("span");
    b.className = "badge";
    b.textContent = String(i+1).padStart(3, "0");
    const v = document.createElement("span");
    v.textContent = c;
    row.appendChild(b);
    row.appendChild(v);
    contactsList.appendChild(row);
  }
  if (!showAllEl.checked && total > limit){
    const more = document.createElement("div");
    more.className = "rowline";
    more.innerHTML = `<span class="badge">...</span><span>y ${total - limit} más</span>`;
    contactsList.appendChild(more);
  }

  downloadBtn.disabled = total === 0;
}

function renderBatch(){
  batchList.innerHTML = "";
  batch.forEach(item => {
    const div = document.createElement("div");
    div.className = "item";
    div.innerHTML = `
      <div class="meta">
        <div class="tag">Objetivo:</div>
        <div><code>${item.objective || "—"}</code></div>
        <div class="tag">Contactos:</div>
        <div class="count">${item.contacts.size}</div>
      </div>
      <div class="rm"><button data-id="${item.id}">Quitar</button></div>
    `;
    batchList.appendChild(div);
  });

  // botones de quitar
  batchList.querySelectorAll("button[data-id]").forEach(btn=>{
    btn.addEventListener("click", () => {
      const id = btn.getAttribute("data-id");
      batch = batch.filter(x => x.id !== id);
      renderBatch();
      exportMergedBtn.disabled = batch.length === 0;
    });
  });

  exportMergedBtn.disabled = batch.length === 0;
}

// XLSX helpers
function aoaToSheetAsText(aoa){
  const ws = XLSX.utils.aoa_to_sheet(aoa);
  Object.keys(ws).forEach(addr => {
    if (addr[0] === "!") return;
    const cell = ws[addr];
    if (cell && typeof cell === "object") cell.t = "s"; // todo como texto
  });
  return ws;
}

function downloadXlsx(filename, rows){
  const wb = XLSX.utils.book_new();
  const ws = aoaToSheetAsText(rows);
  XLSX.utils.book_append_sheet(wb, ws, "Datos");
  XLSX.writeFile(wb, filename);
}

// Eventos
processBtn.addEventListener("click", () => {
  currentContacts = textToContacts(inputText.value);
  renderPreview();
});

fileInput.addEventListener("change", async (e) => {
  const files = Array.from(e.target.files || []);
  if (!files.length) return;

  // Concatena el contenido de todos los archivos al área de texto (para que puedas ver/editar)
  const parts = [];
  for (const f of files){
    try {
      const txt = await f.text();
      parts.push(txt);
    } catch {}
  }
  if (parts.length){
    inputText.value = (inputText.value ? inputText.value + "\n" : "") + parts.join("\n");
    currentContacts = textToContacts(inputText.value);
    renderPreview();
  }
  fileInput.value = ""; // reset
});

addToBatchBtn.addEventListener("click", () => {
  if (!currentContacts.length){
    currentContacts = textToContacts(inputText.value);
  }
  if (!currentContacts.length){
    alert("No hay contactos para agregar. Procesa o pega texto primero.");
    return;
  }
  const objRaw = accountIdEl.value.trim();
  const objective = stripCountry57(normalizeNumber(objRaw)); // sin +57/57/0057

  const item = {
    id: String(Date.now()) + "-" + Math.random().toString(36).slice(2),
    objective,
    contacts: new Set(currentContacts)
  };
  batch.push(item);
  renderBatch();

  // Opcional: limpiar entrada para el siguiente reporte
  inputText.value = "";
  currentContacts = [];
  renderPreview();
});

clearBtn.addEventListener("click", () => {
  inputText.value = "";
  accountIdEl.value = "";
  currentContacts = [];
  renderPreview();
});

clearBatchBtn.addEventListener("click", () => {
  batch = [];
  renderBatch();
});

showAllEl.addEventListener("change", renderPreview);

downloadBtn.addEventListener("click", () => {
  if (!currentContacts.length){
    alert("No hay contactos en la vista previa.");
    return;
  }
  const objRaw = accountIdEl.value.trim();
  const objective = stripCountry57(normalizeNumber(objRaw)) || "objetivo";

  const rows = [["Contactos","Objetivo"]];
  currentContacts.forEach(c => rows.push([String(c), String(objective)]));
  downloadXlsx(`${objective}_contacts.xlsx`, rows);
});

exportMergedBtn.addEventListener("click", () => {
  if (!batch.length){
    alert("No hay reportes en el lote.");
    return;
  }
  // Unificar par (Contacto + Objetivo)
  const pairs = new Set();
  const rows = [["Contactos","Objetivo"]];
  batch.forEach(item => {
    const obj = item.objective || "objetivo";
    item.contacts.forEach(c => {
      const key = `${c}|${obj}`;
      if (!pairs.has(key)){
        pairs.add(key);
        rows.push([String(c), String(obj)]);
      }
    });
  });
  downloadXlsx(`unificado_contacts.xlsx`, rows);
});

// init UI
renderPreview();
renderBatch();


// =================== MODAL: MOSTRAR EN CADA RECARGA ===================

const modal = document.getElementById("howtoModal");
const overlay = document.getElementById("modalOverlay");
const closeEls = document.querySelectorAll("[data-close-howto]");

function openHowto(){
  modal.classList.add("open");
  overlay.classList.add("open");
  document.body.classList.add("noscroll");
}
function closeHowto(){
  modal.classList.remove("open");
  overlay.classList.remove("open");
  document.body.classList.remove("noscroll");
}

// Abrir SIEMPRE al cargar
openHowto();

// Cerrar por botones
closeEls.forEach(el => el.addEventListener("click", closeHowto));

// Cerrar por clic en overlay
overlay.addEventListener("click", closeHowto);

// Cerrar con ESC
window.addEventListener("keydown", (e) => {
  if (e.key === "Escape" && overlay.classList.contains("open")) closeHowto();
});

document.querySelector('.footer .links a[href="#"]')?.addEventListener('click', (e)=>{ e.preventDefault(); openHowto(); });
