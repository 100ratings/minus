// =====================
// Nomes — script.js (versão: forward + wrap até 10)
// Regra: para 1ª, 2ª e última letras, a pista está à FRENTE da letra real,
//        entre +1 e +10 passos, com wrap Z→A.
// Ex.: A→I = +8 (ok), Z→B = +2 (ok), O→I = +20 (não passa porque >10).
// =====================

// Config
const MAX_STEPS = 10;                          // limite de passos pra frente (1..10)
const weights   = { first:0.4, second:0.2, last:0.4 }; // pesos da distância ponderada

// Alfabeto e normalização
const AZ = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const normMap = { 'Á':'A','À':'A','Â':'A','Ã':'A','Ä':'A',
  'É':'E','Ê':'E','È':'E','Ë':'E',
  'Í':'I','Ì':'I','Î':'I','Ï':'I',
  'Ó':'O','Ò':'O','Ô':'O','Õ':'O','Ö':'O',
  'Ú':'U','Ù':'U','Û':'U','Ü':'U',
  'Ç':'C' };
const normalize = (s) => (s||'')
  .normalize('NFD')
  .toUpperCase()
  .replace(/[ÁÀÂÃÄÉÊÈËÍÌÎÏÓÒÔÕÖÚÙÛÜÇ]/g, ch => normMap[ch] || ch)
  .replace(/[^A-Z]/g, '');

const code = (ch) => AZ.indexOf(ch);

// passos pra FRENTE com wrap (0..25)
function forwardWrapSteps(real, pista){
  const r = code(real), p = code(pista);
  if (r < 0 || p < 0) return Infinity; // segurança
  return (p - r + 26) % 26;            // 0..25 (0 = mesma letra)
}

// Estado
let nomes = [];   // [{ raw, norm, len, first, second, last }]
let ready = false;

// --------- Carregamento / Indexação ---------
async function loadNames() {
  // 1) Tenta cache local
  const cached = localStorage.getItem('nomes.v1');
  if (cached) {
    try {
      nomes = JSON.parse(cached);
      ready = true;
      return;
    } catch {}
  }
  // 2) Tenta arquivo estático
  try {
    const resp = await fetch('./data/nomes.txt', { cache:'no-cache' });
    if (resp.ok) {
      const txt = await resp.text();
      await indexNamesFromText(txt);
      return;
    }
  } catch {}
  // 3) Fica aguardando importador
  ready = false;
}

async function indexNamesFromText(txt){
  const lines = (txt||'').split(/\r?\n/).map(s=>s.trim()).filter(Boolean);
  const set = new Set();
  const out = [];
  for (const raw of lines){
    const norm = normalize(raw);
    if (!norm || set.has(norm)) continue;
    set.add(norm);
    const len = norm.length;
    const first  = norm[0] || '';
    const second = norm[1] || '';
    const last   = norm[len-1] || '';
    out.push({ raw, norm, len, first, second, last });
  }
  nomes = out;
  localStorage.setItem('nomes.v1', JSON.stringify(out));
  ready = true;
}

// --------- Entrada ---------
function parseEntradaTurbo(s){
  if(!s) return null;
  const parts = s.trim().toUpperCase().split(/\s+/);
  if (parts.length < 2) return null;
  const len = parseInt(parts[0],10);
  if (!Number.isFinite(len) || len < 2) return null;
  const letters = normalize(parts.slice(1).join('')).slice(0,3);
  if (letters.length < 3) return null;
  return { len, L1:letters[0], L2:letters[1], Lf:letters[2] };
}

function getParams(){
  const turbo = parseEntradaTurbo(document.querySelector('#entradaTurbo').value);
  if (turbo) return turbo;

  const len = parseInt(document.querySelector('#tamanho').value,10);
  const L1 = normalize(document.querySelector('#l1').value).slice(0,1);
  const L2 = normalize(document.querySelector('#l2').value).slice(0,1);
  const Lf = normalize(document.querySelector('#lf').value).slice(0,1);
  if (!Number.isFinite(len) || len<2 || L1.length<1 || L2.length<1 || Lf.length<1) return null;
  return { len, L1, L2, Lf };
}

// --------- Motor ---------
function sugerir({len,L1,L2,Lf}){
  // 1) Filtra por tamanho
  const pool = nomes.filter(n => n.len === len);

  // 2) Regras: TODAS pra frente com wrap: passos ∈ [1..MAX_STEPS]
  const pool2 = pool.filter(n => {
    const d1 = forwardWrapSteps(n.first,  L1); // real->pista
    const d2 = forwardWrapSteps(n.second, L2);
    const d3 = forwardWrapSteps(n.last,   Lf);
    return (d1 >= 1 && d1 <= MAX_STEPS) &&
           (d2 >= 1 && d2 <= MAX_STEPS) &&
           (d3 >= 1 && d3 <= MAX_STEPS);
  });

  if (!pool2.length) return [];

  // 3) Distância ponderada (quanto menor, melhor)
  const scored = pool2.map(n => {
    const d1 = forwardWrapSteps(n.first,  L1);
    const d2 = forwardWrapSteps(n.second, L2);
    const d3 = forwardWrapSteps(n.last,   Lf);
    const wdist = d1*weights.first + d2*weights.second + d3*weights.last;
    return { ...n, d1, d2, d3, wdist };
  });

  // 4) Ordena por menor distância; empate por ordem alfabética
  scored.sort((a,b)=> a.wdist - b.wdist || (a.norm < b.norm ? -1 : 1));
  return scored.slice(0,50);
}

function confFromWdist(w){
  // Mapeamento simples de confiança (ajuste livre)
  const c = Math.max(0, 100 - (w*10));
  return Math.round(c);
}

// --------- UI ---------
function renderResultado(cands, {L1,L2,Lf}){
  const sec = document.querySelector('#resultado');
  const top1 = document.querySelector('#top1');
  const conf = document.querySelector('#conf');
  const lista = document.querySelector('#lista');

  if (cands.length === 0){
    sec.hidden = false;
    top1.textContent = '— nenhum candidato —';
    conf.textContent = 'Confiança: 0%';
    lista.innerHTML = '';
    return;
  }

  const best = cands[0];
  sec.hidden = false;
  top1.textContent = best.raw;
  conf.textContent = `Confiança: ${confFromWdist(best.wdist)}%`;

  lista.innerHTML = '';
  const top5 = cands.slice(0,5);
  for (const n of top5){
    const li = document.createElement('li');
    li.textContent =
      `${n.raw} — dist ${n.wdist.toFixed(2)} ` +
      `(1ª: ${n.first}→${L1} +${forwardWrapSteps(n.first,L1)}, ` +
      `2ª: ${n.second}→${L2} +${forwardWrapSteps(n.second,L2)}, ` +
      `últ: ${n.last}→${Lf} +${forwardWrapSteps(n.last,Lf)})`;
    lista.appendChild(li);
  }
}

function limpar(){
  document.querySelector('#entradaTurbo').value = '';
  document.querySelector('#tamanho').value = '';
  document.querySelector('#l1').value = '';
  document.querySelector('#l2').value = '';
  document.querySelector('#lf').value = '';
  document.querySelector('#resultado').hidden = true;
}

// --------- Boot ---------
document.addEventListener('DOMContentLoaded', async () => {
  // Service Worker
  if ('serviceWorker' in navigator) {
    try { await navigator.serviceWorker.register('./sw.js'); } catch {}
  }

  // Carrega nomes
  await loadNames();

  // Controles
  const btnSug = document.querySelector('#btnSugerir');
  const btnImp = document.querySelector('#btnImportar');
  const btnFecharImp = document.querySelector('#btnFecharImportador');
  const btnSalvarLista = document.querySelector('#btnSalvarLista');
  const btnLimpar = document.querySelector('#btnLimpar');

  btnSug.addEventListener('click', () => {
    if (!ready){ alert('Importe ou adicione a lista de nomes primeiro.'); return; }
    const params = getParams();
    if (!params){ alert('Preencha: tamanho e as 3 letras (L1’, L2’, Lf’).'); return; }
    const cands = sugerir(params);
    renderResultado(cands, params);
  });

  // Importador (colagem manual)
  if (btnImp) btnImp.addEventListener('click', ()=> {
    document.querySelector('#importador').hidden = false;
  });
  if (btnFecharImp) btnFecharImp.addEventListener('click', ()=> {
    document.querySelector('#importador').hidden = true;
  });
  if (btnSalvarLista) btnSalvarLista.addEventListener('click', async ()=> {
    const txt = document.querySelector('#textareaLista').value;
    await indexNamesFromText(txt);
    document.querySelector('#importador').hidden = true;
    alert(`Lista salva (${nomes.length} nomes).`);
  });

  // Limpar
  if (btnLimpar) btnLimpar.addEventListener('click', limpar);

  // Enter na entrada turbo
  const entradaTurbo = document.querySelector('#entradaTurbo');
  if (entradaTurbo) entradaTurbo.addEventListener('keydown', (e)=>{
    if(e.key==='Enter') btnSug.click();
  });
});
