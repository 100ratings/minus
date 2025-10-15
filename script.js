// =====================
// Nomes — script.js
// Lógica: até 10 passos
// 1ª e 2ª letras: pista à FRENTE (real -> pista) entre +1..+10
// Última letra:   pista ATRÁS   (real -> pista) entre -1..-10
// =====================

// Config
const MAX_STEPS = 10;                  // altere se quiser permitir mais/menos passos
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
const stepsForward  = (real, pista) => code(pista) - code(real); // pode ser negativo
const stepsBackward = (real, pista) => code(real) - code(pista); // idem

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

  // 2) Regras: 1ª e 2ª à frente (1..MAX); última atrás (1..MAX)
  const pool2 = pool.filter(n => {
    const d1 = stepsForward(n.first,  L1); // real->pista
    const d2 = stepsForward(n.second, L2);
    const d3 = stepsBackward(n.last,  Lf);
    return (d1 >= 1 && d1 <= MAX_STEPS) &&
           (d2 >= 1 && d2 <= MAX_STEPS) &&
           (d3 >= 1 && d3 <= MAX_STEPS);
  });

  if (!pool2.length) return [];

  // 3) Distância ponderada (quanto menor, melhor)
  const scored = pool2.map(n => {
    const d1 = stepsForward(n.first,  L1);
    const d2 = stepsForward(n.second, L2);
    const d3 = stepsBackward(n.last,  Lf);
    const wdist = d1*weights.first + d2*weights.second + d3*weights.last;
    return { ...n, d1, d2, d3, wdist };
  });

  // 4) Ordena por menor distância; empate por ordem alfabética
  scored.sort((a,b)=> a.wdist - b.wdist || (a.norm < b.norm ? -1 : 1));
  return scored.slice(0,50);
}

function confFromWdist(w){
  // 0 passos -> 100% (na prática nunca é 0 porque mínimo é 1+1+1 ponderado)
  // ~10 passos ponderados -> ~0%
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
    // Exibe as relações na forma: real -> pista (passos)
    const li = document.createElement('li');
    li.textContent = `${n.raw} — dist ${n.wdist.toFixed(2)} `
      + `(1ª: ${n.first}→${L1} +${stepsForward(n.first,L1)}, `
      + `2ª: ${n.second}→${L2} +${stepsForward(n.second,L2)}, `
      + `últ: ${n.last}→${Lf} -${stepsBackward(n.last,Lf)})`;
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
    if (!ready){ alert('Impor­te ou adicione a lista de nomes primeiro.'); return; }
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
