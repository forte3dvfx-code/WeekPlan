/* app.js — ecrãs e lógica da Cadência.
 *
 * Tudo é carregado para memória no arranque (são poucos milhares de registos
 * no máximo) e cada alteração escreve logo em IndexedDB. Os ecrãs são texto
 * HTML desenhado de novo a cada mudança; os cliques chegam todos a um só
 * sítio (`acoes`, no fim), através de atributos data-act.
 *
 * Ideia central: a rotina é a lista de blocos que se repetem. Um dia mostra
 * os blocos desse dia da semana. Só quando marcas um bloco é que nasce um
 * registo — o que não tem registo está por fazer.
 */

const APP_VERSION = 'v2.1';

/* ================================================================
   Datas — sempre texto "YYYY-MM-DD", nunca Date, para não haver
   surpresas de fuso horário.
   ================================================================ */
const MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
const DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
const DIAS_CURTOS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb'];
const ORDEM_DIAS = [1, 2, 3, 4, 5, 6, 0];   // a semana começa à segunda

function toISO(d) {
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
}
function fromISO(t) { const p = t.split('-'); return new Date(+p[0], p[1] - 1, +p[2], 12); }
const hoje = () => toISO(new Date());
function addDays(t, n) { const d = fromISO(t); d.setDate(d.getDate() + n); return toISO(d); }
const diaSemana = (t) => fromISO(t).getDay();
function segundaDe(t) { const d = diaSemana(t); return addDays(t, -(d === 0 ? 6 : d - 1)); }
const diasDaSemana = (seg) => [0, 1, 2, 3, 4, 5, 6].map((i) => addDays(seg, i));
const diasEntre = (a, b) => Math.round((fromISO(b) - fromISO(a)) / 86400000);

/* Semana ISO: "2026-W44" (guardado nos registos) e o número para mostrar */
function weekId(t) {
  const qui = addDays(segundaDe(t), 3);
  const ano = fromISO(qui).getFullYear();
  const primeira = segundaDe(toISO(new Date(ano, 0, 4, 12)));
  return ano + '-W' + String(Math.round(diasEntre(primeira, segundaDe(t)) / 7) + 1).padStart(2, '0');
}
const numSemana = (t) => Number(weekId(t).split('-W')[1]);

function rotuloDia(t) { const d = fromISO(t); return DIAS[d.getDay()] + ', ' + d.getDate() + ' ' + MESES[d.getMonth()]; }
function rotuloSemana(seg) {
  const a = fromISO(seg), b = fromISO(addDays(seg, 6));
  return MESES[a.getMonth()] === MESES[b.getMonth()]
    ? a.getDate() + '–' + b.getDate() + ' ' + MESES[a.getMonth()]
    : a.getDate() + ' ' + MESES[a.getMonth()] + ' – ' + b.getDate() + ' ' + MESES[b.getMonth()];
}
function duracao(min) {
  min = Math.round(min || 0);
  if (min < 60) return min + 'm';
  const h = Math.floor(min / 60), r = min % 60;
  return h + 'h' + (r ? String(r).padStart(2, '0') : '');
}
const horas = (min) => (Math.round(min / 6) / 10).toString().replace('.', ',') + 'h';

/* ================================================================
   Estado
   ================================================================ */
const AREAS_OMISSAO = [
  { id: 'python', nome: 'Python', cor: '#3E9CC4' },
  { id: 'build', nome: 'Build', cor: '#D9912A' },
  { id: 'vex', nome: 'VEX', cor: '#9B6FD6' },
  { id: 'lookdev', nome: 'Lookdev', cor: '#3DBD82' },
  { id: 'zbrush', nome: 'ZBrush', cor: '#D9654C' },
  { id: 'corpo', nome: 'Corpo', cor: '#5B7BD6' },
  { id: 'cabeca', nome: 'Cabeça', cor: '#C2569B' },
  { id: 'outro', nome: 'Outro', cor: '#8A8F9C' }
];
const MOTIVOS = ['Cansaço', 'Trabalho', 'Imprevisto', 'Esqueci-me', 'Doente'];

const S = {
  blocks: [], entries: {}, tasks: {}, set: {},
  view: 'hoje',
  dia: hoje(),            // dia aberto em Hoje
  semana: segundaDe(hoje()),
  evo: 8                  // semanas visíveis em Evolução
};

const cfg = (k, omissao) => (S.set[k] === undefined ? omissao : S.set[k]);
async function setCfg(k, v) { S.set[k] = v; await DB.setSetting(k, v); }

const areas = () => cfg('areas', AREAS_OMISSAO);
const area = (id) => areas().find((a) => a.id === id) || { id: 'outro', nome: 'Outro', cor: '#8A8F9C' };
const bloco = (id) => S.blocks.find((b) => b.id === id);
const reg = (data, blockId) => S.entries[data + '__' + blockId];
const ativo = (b, data) => b.desde <= data && (!b.ate || data <= b.ate);

/* Blocos de um dia, por hora. Um bloco editado guarda a versão antiga com
   data de fim (`ate`): assim o passado continua a contar o que estava planeado. */
function blocosDoDia(data) {
  const dw = diaSemana(data);
  return S.blocks.filter((b) => b.dias.includes(dw) && ativo(b, data)).sort((a, b) => a.hora.localeCompare(b.hora));
}

function resumoDia(data) {
  const r = { total: 0, feitos: 0, falhados: 0, minPlan: 0, minFeito: 0 };
  blocosDoDia(data).forEach((b) => {
    r.total++;
    r.minPlan += b.minutos;
    const e = reg(data, b.id);
    if (e && e.estado === 'feito') { r.feitos++; r.minFeito += e.minutos || 0; }
    else if (e && e.estado === 'falhado') r.falhados++;
  });
  return r;
}

/* Soma vários dias. Dias futuros não contam: a semana a meio não é falha. */
function resumoDias(datas) {
  const h = hoje();
  return datas.filter((d) => d <= h).map(resumoDia).reduce((a, r) => {
    Object.keys(a).forEach((k) => { a[k] += r[k]; });
    return a;
  }, { total: 0, feitos: 0, falhados: 0, minPlan: 0, minFeito: 0 });
}
const pct = (r) => (r.total ? Math.round(r.feitos / r.total * 100) : 0);

const tarefasDoDia = (data) => Object.values(S.tasks).filter((t) => t.data === data)
  .sort((a, b) => (a.feita - b.feita) || (a.criadoEm || '').localeCompare(b.criadoEm || ''));
const tarefasAtrasadas = () => Object.values(S.tasks).filter((t) => !t.feita && t.data < hoje())
  .sort((a, b) => a.data.localeCompare(b.data));

async function carregar() {
  const [blocks, entries, tasks, set] = await Promise.all([
    DB.all('blocks'), DB.all('entries'), DB.all('tasks'), DB.getSettings()
  ]);
  S.blocks = blocks.map(DB.normalizarBloco);
  S.entries = {};
  entries.forEach((e) => { S.entries[e.id] = DB.normalizarEntrada(e); });
  S.tasks = {};
  tasks.forEach((t) => { S.tasks[t.id] = t; });
  S.set = set;
}

/* ================================================================
   Escrita
   ================================================================ */
async function registar(data, blockId, estado, minutos, nota) {
  const id = data + '__' + blockId;
  if (!estado) {
    delete S.entries[id];
    return DB.del('entries', id);
  }
  const b = bloco(blockId);
  const e = {
    id, data, weekId: weekId(data), blockId,
    nomeSnapshot: b.nome, area: b.area, hora: b.hora, estado,
    minutos: estado === 'feito' ? (minutos == null ? b.minutos : minutos) : 0,
    nota: nota || '',
    atualizadoEm: new Date().toISOString()
  };
  S.entries[id] = e;
  return DB.put('entries', e);
}

function temHistorico(blockId) {
  const h = hoje();
  return Object.values(S.entries).some((e) => e.blockId === blockId && e.data < h);
}

/* Registos de hoje em diante passam de um bloco para outro (ou desaparecem). */
async function moverRegistos(deId, paraId) {
  const h = hoje();
  for (const e of Object.values(S.entries)) {
    if (e.blockId !== deId || e.data < h) continue;
    delete S.entries[e.id];
    await DB.del('entries', e.id);
    if (!paraId) continue;
    e.blockId = paraId;
    e.id = e.data + '__' + paraId;
    S.entries[e.id] = e;
    await DB.put('entries', e);
  }
}

function porNoEstado(b) {
  const i = S.blocks.findIndex((x) => x.id === b.id);
  if (i === -1) S.blocks.push(b); else S.blocks[i] = b;
}

/* Mudar dias, hora ou duração de um bloco com passado: a versão antiga
   fecha ontem e nasce uma nova a partir de hoje. Nome, área e nota
   mudam em todo o lado. */
async function guardarBloco(novo) {
  const antigo = bloco(novo.id);
  const mudouHorario = antigo && (antigo.hora !== novo.hora || antigo.minutos !== novo.minutos ||
    antigo.dias.slice().sort().join() !== novo.dias.slice().sort().join());

  if (antigo && mudouHorario && temHistorico(antigo.id)) {
    const fecho = Object.assign({}, antigo, { nome: novo.nome, area: novo.area, nota: novo.nota, ate: addDays(hoje(), -1) });
    novo = Object.assign({}, novo, { id: DB.novoId('b'), desde: hoje() });
    delete novo.ate;
    await DB.put('blocks', fecho);
    porNoEstado(fecho);
    await moverRegistos(antigo.id, novo.id);
  }
  await DB.put('blocks', novo);
  porNoEstado(novo);
}

async function apagarBloco(id) {
  const b = bloco(id);
  await moverRegistos(id, null);
  if (temHistorico(id)) {
    b.ate = addDays(hoje(), -1);   // fica no histórico, sai da rotina
    await DB.put('blocks', b);
  } else {
    S.blocks = S.blocks.filter((x) => x.id !== id);
    await DB.del('blocks', id);
  }
}

/* A versão 1 tinha um bloco por dia ("Python" de segunda, de terça…).
   Blocos iguais em tudo menos no dia juntam-se num só, com vários dias;
   os registos passam para o bloco que fica. */
function gruposRepetidos() {
  const h = hoje(), grupos = {};
  S.blocks.filter((b) => !b.ate || b.ate >= h).forEach((b) => {
    const k = [b.nome.trim().toLowerCase(), b.area, b.hora, b.minutos, b.desde, b.ate || ''].join('|');
    (grupos[k] || (grupos[k] = [])).push(b);
  });
  return Object.values(grupos).filter((g) => g.length > 1);
}

async function juntarRepetidos() {
  let n = 0;
  for (const g of gruposRepetidos()) {
    const fica = g[0];
    for (const b of g.slice(1)) {
      fica.dias = [...new Set(fica.dias.concat(b.dias))];
      if (!fica.nota && b.nota) fica.nota = b.nota;
      for (const e of Object.values(S.entries).filter((x) => x.blockId === b.id)) {
        delete S.entries[e.id];
        await DB.del('entries', e.id);
        e.blockId = fica.id;
        e.id = e.data + '__' + fica.id;
        S.entries[e.id] = e;
        await DB.put('entries', e);
      }
      S.blocks = S.blocks.filter((x) => x.id !== b.id);
      await DB.del('blocks', b.id);
      n++;
    }
    await DB.put('blocks', fica);
  }
  return n;
}

async function guardarTarefa(t) { S.tasks[t.id] = t; await DB.put('tasks', t); }
async function apagarTarefa(id) { delete S.tasks[id]; await DB.del('tasks', id); }

/* ================================================================
   Pequenos desenhos (SVG à mão, sem bibliotecas)
   ================================================================ */
const esc = (t) => String(t == null ? '' : t).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

const ICON = {
  check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
  x: '<svg viewBox="0 0 24 24"><path d="M7 7l10 10M17 7L7 17"/></svg>',
  more: '<svg viewBox="0 0 24 24"><circle cx="5" cy="12" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="19" cy="12" r="1.4"/></svg>',
  left: '<svg viewBox="0 0 24 24"><path d="M15 5l-7 7 7 7"/></svg>',
  right: '<svg viewBox="0 0 24 24"><path d="M9 5l7 7-7 7"/></svg>',
  plus: '<svg viewBox="0 0 24 24"><path d="M12 5v14M5 12h14"/></svg>',
  pen: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16z"/></svg>'
};

function anel(p, tam = 96, traco = 10, cor = 'var(--accent)') {
  const r = (tam - traco) / 2, c = 2 * Math.PI * r, m = tam / 2;
  return `<svg class="ring" viewBox="0 0 ${tam} ${tam}" width="${tam}" height="${tam}" aria-hidden="true">` +
    `<circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="var(--track)" stroke-width="${traco}"/>` +
    `<circle cx="${m}" cy="${m}" r="${r}" fill="none" stroke="${cor}" stroke-width="${traco}" stroke-linecap="round"` +
    ` stroke-dasharray="${c.toFixed(1)}" stroke-dashoffset="${(c * (1 - Math.min(1, p))).toFixed(1)}" transform="rotate(-90 ${m} ${m})"/></svg>`;
}

/* Barras verticais. dados: [{rot, v, txt, atual}] */
function barras(dados, max, unidade) {
  const W = 320, H = 150, base = 124, topo = 14;
  const n = dados.length, passo = W / n, larg = Math.min(26, passo * 0.56);
  max = max || Math.max(1, ...dados.map((d) => d.v));
  const svg = dados.map((d, i) => {
    const h = Math.max(d.v > 0 ? 3 : 0, (d.v / max) * (base - topo));
    const x = i * passo + (passo - larg) / 2;
    return `<rect x="${x.toFixed(1)}" y="${(base - h).toFixed(1)}" width="${larg.toFixed(1)}" height="${h.toFixed(1)}" rx="6" class="${d.atual ? 'bar now' : 'bar'}"/>` +
      `<text x="${(x + larg / 2).toFixed(1)}" y="${(base - h - 5).toFixed(1)}" class="bar-v">${esc(d.txt != null ? d.txt : d.v + (unidade || ''))}</text>` +
      `<text x="${(x + larg / 2).toFixed(1)}" y="${H - 6}" class="bar-l">${esc(d.rot)}</text>`;
  }).join('');
  return `<svg class="chart" viewBox="0 0 ${W} ${H}" role="img"><line x1="0" x2="${W}" y1="${base + .5}" y2="${base + .5}" class="axis"/>${svg}</svg>`;
}

function barraProgresso(nome, feito, total, cor, extra) {
  const p = total ? Math.min(100, feito / total * 100) : 0;
  return `<div class="pbar"><div class="pbar-top"><span><i class="dot" style="background:${cor}"></i>${esc(nome)}</span>` +
    `<b>${extra || feito + '/' + total}</b></div><div class="pbar-track"><div style="width:${p}%;background:${cor}"></div></div></div>`;
}

/* ================================================================
   Ecrã Hoje
   ================================================================ */
function saudacao() {
  const h = new Date().getHours();
  return h < 6 ? 'Boa noite' : h < 13 ? 'Bom dia' : h < 20 ? 'Boa tarde' : 'Boa noite';
}

function viewHoje() {
  const data = S.dia, h = hoje();
  const r = resumoDia(data);
  const lista = blocosDoDia(data);
  const seg = segundaDe(data);
  const eHoje = data === h;

  const titulo = eHoje ? saudacao() : DIAS[diaSemana(data)];
  const sub = rotuloDia(data) + ' · Semana ' + numSemana(data);

  const faixa = diasDaSemana(seg).map((d) => {
    const rd = resumoDia(d);
    const p = rd.total ? rd.feitos / rd.total : 0;
    const cls = ['wd', d === data ? 'sel' : '', d === h ? 'today' : '', d > h ? 'fut' : ''].join(' ');
    return `<button type="button" class="${cls}" data-act="dia" data-d="${d}">` +
      `<span>${DIAS_CURTOS[diaSemana(d)].slice(0, 3)}</span><b>${fromISO(d).getDate()}</b>` +
      `<i class="wd-ring">${rd.total ? anel(d > h ? 0 : p, 22, 3.2) : '<em></em>'}</i></button>`;
  }).join('');

  let proximo = '';
  if (eHoje) {
    const agora = new Date().toTimeString().slice(0, 5);
    const nx = lista.find((b) => !reg(data, b.id) && b.hora >= agora) || lista.find((b) => !reg(data, b.id));
    if (nx) proximo = `<div class="next"><span>A seguir</span><b>${esc(nx.nome)}</b><em>${esc(nx.hora)}</em></div>`;
  }

  const resumo = r.total
    ? `<section class="card hero">${anel(r.feitos / r.total, 96, 10)}
        <div class="hero-txt"><div class="big">${r.feitos}<s>/${r.total}</s></div>
        <div class="muted">${duracao(r.minFeito)} de ${duracao(r.minPlan)}${r.falhados ? ' · ' + r.falhados + ' não cumprido' + (r.falhados > 1 ? 's' : '') : ''}</div>
        ${proximo}</div></section>`
    : '';

  const linhas = lista.length
    ? `<div class="list">${lista.map((b) => linhaBloco(data, b)).join('')}</div>`
    : `<p class="empty">${S.blocks.length ? 'Nada na rotina para este dia.' : 'A rotina está vazia. Cria o primeiro bloco em <a href="#" data-act="ir" data-v="ajustes">Ajustes</a>.'}</p>`;

  const tarefas = tarefasDoDia(data);
  const atrasadas = eHoje ? tarefasAtrasadas() : [];

  return `<header class="head"><p class="sub">${esc(sub)}</p><h1>${esc(titulo)}</h1></header>
    ${eHoje ? avisoBackup() : ''}
    <div class="weeknav">
      <button type="button" class="icon-btn" data-act="semana-dia" data-n="-7" aria-label="Semana anterior">${ICON.left}</button>
      <div class="week-strip">${faixa}</div>
      <button type="button" class="icon-btn" data-act="semana-dia" data-n="7" aria-label="Semana seguinte">${ICON.right}</button>
    </div>
    ${eHoje ? '' : '<button type="button" class="pill-link" data-act="dia" data-d="' + h + '">Voltar a hoje</button>'}
    ${resumo}
    <div class="section-head"><h2>Rotina</h2><span>${lista.length ? r.feitos + ' de ' + r.total : ''}</span></div>
    ${linhas}
    <div class="section-head"><h2>Tarefas</h2><span>${tarefas.filter((t) => t.feita).length}/${tarefas.length}</span></div>
    <form class="add-row" data-form="tarefa"><input id="novaTarefa" type="text" placeholder="Nova tarefa…" autocomplete="off" enterkeyhint="done">
      <button type="submit" class="icon-btn solid" aria-label="Acrescentar">${ICON.plus}</button></form>
    <div class="list">${tarefas.map(linhaTarefa).join('')}</div>
    ${atrasadas.length ? `<div class="section-head"><h2>Por fazer de outros dias</h2><button type="button" data-act="trazer-todas">Trazer todas</button></div>
      <div class="list">${atrasadas.map((t) => linhaTarefa(t, true)).join('')}</div>` : ''}`;
}

function linhaBloco(data, b) {
  const e = reg(data, b.id);
  const a = area(b.area);
  const estado = e ? e.estado : '';
  let sub = b.hora + ' · ' + duracao(b.minutos);
  if (estado === 'feito' && e.minutos !== b.minutos) sub = b.hora + ' · ' + duracao(e.minutos) + ' <s>' + duracao(b.minutos) + '</s>';
  if (estado === 'falhado') sub = b.hora + ' · não cumprido';
  else if (!e && b.nota) sub += ' · ' + esc(b.nota);
  // O tick marca com um toque; tocar no nome abre o registo para escrever um comentário.
  const comentario = e && e.nota
    ? `<span class="nt">${ICON.pen}${esc(e.nota)}</span>`
    : e && estado === 'feito' ? `<span class="nt add">${ICON.pen}Acrescentar comentário</span>` : '';
  return `<div class="row ${estado}" style="--c:${a.cor}">
    <button type="button" class="tick" data-act="toggle" data-d="${data}" data-b="${b.id}" aria-label="Marcar ${esc(b.nome)}">${estado === 'falhado' ? ICON.x : ICON.check}</button>
    <button type="button" class="row-main" data-act="registo" data-d="${data}" data-b="${b.id}">
      <span class="nm">${esc(e ? e.nomeSnapshot : b.nome)}</span><span class="tm">${sub}</span>${comentario}</button>
    <span class="tag">${esc(a.nome)}</span>
    <button type="button" class="icon-btn ghost" data-act="registo" data-d="${data}" data-b="${b.id}" aria-label="Mais opções">${ICON.more}</button>
  </div>`;
}

function linhaTarefa(t, atrasada) {
  return `<div class="row task ${t.feita ? 'feito' : ''}" style="--c:var(--muted)">
    <button type="button" class="tick" data-act="tarefa" data-id="${t.id}" aria-label="Marcar tarefa">${ICON.check}</button>
    <button type="button" class="row-main" data-act="tarefa" data-id="${t.id}"><span class="nm">${esc(t.texto)}</span>
      ${atrasada ? '<span class="tm">' + esc(rotuloDia(t.data)) + '</span>' : ''}</button>
    ${atrasada ? `<button type="button" class="chip small" data-act="trazer" data-id="${t.id}">Hoje</button>` : ''}
    <button type="button" class="icon-btn ghost" data-act="tarefa-menu" data-id="${t.id}" aria-label="Opções da tarefa">${ICON.more}</button>
  </div>`;
}

function avisoBackup() {
  const intervalo = Number(cfg('intervaloBackup', 7));
  if (!intervalo || !Object.keys(S.entries).length) return '';
  const ultimo = cfg('ultimoBackup', null);
  if (ultimo && diasEntre(ultimo, hoje()) < intervalo) return '';
  try { if (localStorage.getItem('cadencia-backup-adiado') === hoje()) return ''; } catch (e) { /* sem storage */ }
  const txt = ultimo ? 'Última cópia há ' + diasEntre(ultimo, hoje()) + ' dias.' : 'Ainda não fizeste nenhuma cópia.';
  return `<div class="banner"><div><b>Cópia de segurança</b><span>${txt} Os dados vivem só neste telemóvel.</span></div>
    <div class="banner-acts"><button type="button" class="btn ghost" data-act="adiar-backup">Amanhã</button>
    <button type="button" class="btn" data-act="backup-agora">Fazer agora</button></div></div>`;
}

/* ================================================================
   Ecrã Semana
   ================================================================ */
function viewSemana() {
  const seg = S.semana, h = hoje();
  const dias = diasDaSemana(seg);
  const r = resumoDias(dias);
  const tarefas = Object.values(S.tasks).filter((t) => t.data >= seg && t.data <= dias[6]);
  const atual = seg === segundaDe(h);

  const cartoes = dias.map((d) => {
    const lista = blocosDoDia(d), rd = resumoDia(d);
    const nT = tarefas.filter((t) => t.data === d);
    const chips = lista.map((b) => {
      const e = reg(d, b.id);
      return `<button type="button" class="bchip ${e ? e.estado : ''}" style="--c:${area(b.area).cor}" data-act="toggle" data-d="${d}" data-b="${b.id}">` +
        `<em>${esc(b.hora)}</em>${esc(b.nome)}${e && e.nota ? '<i class="has-note" title="' + esc(e.nota) + '">' + ICON.pen + '</i>' : ''}</button>`;
    }).join('');
    return `<section class="card day ${d === h ? 'today' : ''} ${d > h ? 'fut' : ''}">
      <button type="button" class="day-head" data-act="abrir-dia" data-d="${d}">
        <span><b>${DIAS[diaSemana(d)]}</b> ${fromISO(d).getDate()} ${MESES[fromISO(d).getMonth()]}</span>
        <span class="muted">${rd.total ? rd.feitos + '/' + rd.total : ''}${nT.length ? ' · ' + nT.filter((t) => t.feita).length + '/' + nT.length + ' tarefas' : ''}</span></button>
      ${chips ? '<div class="bchips">' + chips + '</div>' : '<p class="empty small">Livre</p>'}
    </section>`;
  }).join('');

  // por área: só dias até hoje
  const porArea = {};
  dias.filter((d) => d <= h).forEach((d) => blocosDoDia(d).forEach((b) => {
    const x = porArea[b.area] || (porArea[b.area] = { feitos: 0, total: 0, min: 0 });
    x.total++;
    const e = reg(d, b.id);
    if (e && e.estado === 'feito') { x.feitos++; x.min += e.minutos || 0; }
  }));
  const barrasArea = areas().filter((a) => porArea[a.id]).map((a) =>
    barraProgresso(a.nome, porArea[a.id].feitos, porArea[a.id].total, a.cor, porArea[a.id].feitos + '/' + porArea[a.id].total + ' · ' + duracao(porArea[a.id].min))).join('');

  const notas = Object.values(S.entries).filter((e) => e.data >= seg && e.data <= dias[6] && e.nota)
    .sort((a, b) => a.data.localeCompare(b.data));

  return `<header class="head"><p class="sub">${esc(rotuloSemana(seg))}</p><h1>Semana ${numSemana(seg)}</h1></header>
    <div class="navrow">
      <button type="button" class="icon-btn" data-act="semana" data-n="-7" aria-label="Semana anterior">${ICON.left}</button>
      <button type="button" class="chip ${atual ? 'on' : ''}" data-act="semana" data-n="0">Esta semana</button>
      <button type="button" class="icon-btn" data-act="semana" data-n="7" aria-label="Semana seguinte">${ICON.right}</button>
    </div>
    <div class="stats">
      <div class="stat card"><b>${pct(r)}%</b><span>cumprido</span></div>
      <div class="stat card"><b>${horas(r.minFeito)}</b><span>de ${horas(r.minPlan)}</span></div>
      <div class="stat card"><b>${tarefas.filter((t) => t.feita).length}/${tarefas.length}</b><span>tarefas</span></div>
    </div>
    ${cartoes}
    ${barrasArea ? '<section class="card"><h3>Por área</h3><p class="cap">Até hoje</p>' + barrasArea + '</section>' : ''}
    ${notas.length ? '<section class="card"><h3>Notas da semana</h3>' + notas.map((e) =>
      `<div class="note-line"><span class="dot" style="background:${area(e.area).cor}"></span><span><b>${esc(e.nomeSnapshot)}</b> ${esc(e.nota)}</span><em>${DIAS_CURTOS[diaSemana(e.data)]}</em></div>`).join('') + '</section>' : ''}`;
}

/* ================================================================
   Ecrã Evolução
   ================================================================ */
function viewEvolucao() {
  const h = hoje();
  const registos = Object.values(S.entries);
  if (!registos.length) {
    return `<header class="head"><p class="sub">Evolução</p><h1>Ainda sem dados</h1></header>
      <p class="empty">Marca alguns blocos no ecrã Hoje. Os gráficos aparecem a partir do primeiro registo.</p>`;
  }

  const primeiro = registos.reduce((m, e) => (e.data < m ? e.data : m), h);
  const atual = segundaDe(h);
  let semanas = [];
  for (let i = S.evo - 1; i >= 0; i--) {
    const s = addDays(atual, -7 * i);
    if (addDays(s, 6) >= primeiro) semanas.push(s);
  }
  if (!semanas.length) semanas = [atual];

  const porSemana = semanas.map((s) => ({ s, r: resumoDias(diasDaSemana(s)) }));
  const curto = semanas.length > 12;
  const rot = (s) => (curto ? String(fromISO(s).getDate()) : 'S' + numSemana(s));
  const total = porSemana.reduce((a, x) => { a.f += x.r.feitos; a.t += x.r.total; a.m += x.r.minFeito; return a; }, { f: 0, t: 0, m: 0 });

  // horas por área no período
  const de = semanas[0];
  const minArea = {};
  registos.forEach((e) => { if (e.estado === 'feito' && e.data >= de) minArea[e.area] = (minArea[e.area] || 0) + (e.minutos || 0); });
  const maxArea = Math.max(1, ...Object.values(minArea));
  const linhasArea = areas().filter((a) => minArea[a.id]).sort((a, b) => minArea[b.id] - minArea[a.id])
    .map((a) => barraProgresso(a.nome, minArea[a.id], maxArea, a.cor, horas(minArea[a.id]))).join('');

  // consistência por bloco (pelo nome, para juntar versões do mesmo bloco)
  const habitos = {};
  semanas.forEach((s) => diasDaSemana(s).filter((d) => d <= h && d >= primeiro).forEach((d) => blocosDoDia(d).forEach((b) => {
    const x = habitos[b.nome] || (habitos[b.nome] = { f: 0, t: 0, cor: area(b.area).cor });
    x.t++;
    const e = reg(d, b.id);
    if (e && e.estado === 'feito') x.f++;
  })));
  const linhasHab = Object.keys(habitos).filter((n) => habitos[n].t >= 2)
    .sort((a, b) => habitos[b].f / habitos[b].t - habitos[a].f / habitos[a].t)
    .map((n) => barraProgresso(n, habitos[n].f, habitos[n].t, habitos[n].cor, Math.round(habitos[n].f / habitos[n].t * 100) + '%')).join('');

  // motivos
  const motivos = {};
  registos.forEach((e) => {
    if (e.estado === 'falhado' && e.nota && e.data >= de) {
      const k = e.nota.trim().toLowerCase();
      (motivos[k] || (motivos[k] = { txt: e.nota.trim(), n: 0 })).n++;
    }
  });
  const listaMot = Object.values(motivos).sort((a, b) => b.n - a.n).slice(0, 6);

  return `<header class="head"><p class="sub">Desde ${esc(rotuloDia(semanas[0]))}</p><h1>Evolução</h1></header>
    <div class="chips-row">${[4, 8, 12, 26].map((n) => `<button type="button" class="chip ${S.evo === n ? 'on' : ''}" data-act="evo" data-n="${n}">${n} semanas</button>`).join('')}</div>
    <div class="stats">
      <div class="stat card"><b>${total.t ? Math.round(total.f / total.t * 100) : 0}%</b><span>cumprido</span></div>
      <div class="stat card"><b>${horas(total.m)}</b><span>registadas</span></div>
      <div class="stat card"><b>${sequencia()}</b><span>dias seguidos</span></div>
    </div>
    <section class="card"><h3>Cumprido por semana</h3><p class="cap">Blocos feitos sobre os planeados, até hoje</p>
      ${barras(porSemana.map((x) => ({ rot: rot(x.s), v: pct(x.r), txt: curto ? '' : pct(x.r) + '%', atual: x.s === atual })), 100)}</section>
    <section class="card"><h3>Horas por semana</h3><p class="cap">Tempo real registado</p>
      ${barras(porSemana.map((x) => ({ rot: rot(x.s), v: Math.round(x.r.minFeito / 6) / 10, txt: curto ? '' : horas(x.r.minFeito), atual: x.s === atual })))}</section>
    ${linhasArea ? '<section class="card"><h3>Horas por área</h3><p class="cap">No período</p>' + linhasArea + '</section>' : ''}
    ${linhasHab ? '<section class="card"><h3>Consistência</h3><p class="cap">Quantas vezes cada bloco foi feito</p>' + linhasHab + '</section>' : ''}
    <section class="card"><h3>Porque falhou</h3><p class="cap">Se um motivo se repete, o problema não é disciplina</p>
      ${listaMot.length ? listaMot.map((m) => `<div class="note-line"><span>${esc(m.txt)}</span><em>${m.n}×</em></div>`).join('') : '<p class="empty small">Nenhum motivo registado.</p>'}</section>`;
}

/* Dias seguidos com tudo feito. Dias sem nada planeado não quebram a série;
   hoje só conta se já estiver completo. */
function sequencia() {
  let n = 0, d = hoje();
  const r0 = resumoDia(d);
  if (!(r0.total && r0.feitos === r0.total)) d = addDays(d, -1);
  for (let i = 0; i < 400; i++, d = addDays(d, -1)) {
    const r = resumoDia(d);
    if (!r.total) continue;
    if (r.feitos === r.total) n++; else break;
  }
  return n;
}

/* ================================================================
   Ecrã Ajustes
   ================================================================ */
function diasTexto(dias) {
  const s = dias.slice().sort((a, b) => ORDEM_DIAS.indexOf(a) - ORDEM_DIAS.indexOf(b));
  if (s.length === 7) return 'Todos os dias';
  if (s.join() === '1,2,3,4,5') return 'Dias úteis';
  if (s.join() === '6,0') return 'Fim de semana';
  return s.map((d) => DIAS_CURTOS[d]).join(' ');
}

function viewAjustes() {
  const h = hoje();
  const rotina = S.blocks.filter((b) => !b.ate || b.ate >= h);
  const grupos = areas().map((a) => {
    const bs = rotina.filter((b) => b.area === a.id).sort((x, y) => x.hora.localeCompare(y.hora));
    if (!bs.length) return '';
    return `<p class="group-cap"><i class="dot" style="background:${a.cor}"></i>${esc(a.nome)}</p><div class="list">` + bs.map((b) =>
      `<button type="button" class="row plain" style="--c:${a.cor}" data-act="editar-bloco" data-b="${b.id}">
        <span class="bar-c"></span><span class="row-main"><span class="nm">${esc(b.nome)}</span>
        <span class="tm">${diasTexto(b.dias)} · ${esc(b.hora)} · ${duracao(b.minutos)}</span></span>${ICON.right}</button>`).join('') + '</div>';
  }).join('');
  const semArea = rotina.filter((b) => !areas().some((a) => a.id === b.area));
  const repetidos = gruposRepetidos().reduce((s, g) => s + g.length, 0);
  const tema = cfg('tema', 'auto');
  const intervalo = Number(cfg('intervaloBackup', 7));
  const ultimo = cfg('ultimoBackup', null);

  return `<header class="head"><p class="sub">Cadência ${APP_VERSION}</p><h1>Ajustes</h1></header>
    <div class="section-head"><h2>Rotina</h2><button type="button" data-act="novo-bloco">+ Bloco</button></div>
    ${repetidos ? `<div class="banner"><div><b>Blocos repetidos</b><span>${repetidos} blocos iguais em dias diferentes podem ficar num só, com vários dias. O histórico mantém-se.</span></div>
      <div class="banner-acts"><button type="button" class="btn" data-act="juntar">Juntar</button></div></div>` : ''}
    ${rotina.length ? grupos + (semArea.length ? '<div class="list">' + semArea.map((b) => `<button type="button" class="row plain" data-act="editar-bloco" data-b="${b.id}"><span class="row-main"><span class="nm">${esc(b.nome)}</span></span></button>`).join('') + '</div>' : '')
      : '<p class="empty">Ainda não há blocos. Um bloco é algo que se repete: "Python, 2ª a 5ª às 07:30, 1h45".</p>'}
    <div class="section-head"><h2>Áreas</h2><button type="button" data-act="nova-area">+ Área</button></div>
    <div class="card areas">${areas().map((a) => `<button type="button" class="area-chip" data-act="editar-area" data-id="${a.id}"><i class="dot" style="background:${a.cor}"></i>${esc(a.nome)}</button>`).join('')}</div>

    <div class="section-head"><h2>Aspeto</h2></div>
    <div class="seg">${[['auto', 'Automático'], ['light', 'Claro'], ['dark', 'Escuro']].map(([v, t]) =>
      `<button type="button" class="${tema === v ? 'on' : ''}" data-act="tema" data-v="${v}">${t}</button>`).join('')}</div>

    <div class="section-head"><h2>Dados</h2></div>
    <section class="card">
      <p class="cap">${ultimo ? 'Última cópia: ' + esc(rotuloDia(ultimo)) : 'Ainda sem cópias.'} Os dados ficam só neste dispositivo.</p>
      <div class="btn-grid">
        <button type="button" class="btn" data-act="exportar">Exportar JSON</button>
        <button type="button" class="btn ghost" data-act="importar">Importar JSON</button>
        <button type="button" class="btn ghost" data-act="csv">Exportar CSV</button>
      </div>
      <h3 class="mt">Google Drive</h3>
      <p class="cap">Uma cópia na pasta "Cadência" do teu Drive. Só funciona na versão publicada.</p>
      <div class="btn-grid">
        <button type="button" class="btn" data-act="drive-backup">Copiar para o Drive</button>
        <button type="button" class="btn ghost" data-act="drive-restore">Trazer do Drive</button>
      </div>
      <h3 class="mt">Lembrete de cópia</h3>
      <div class="seg">${[[3, '3 dias'], [7, '7 dias'], [14, '14 dias'], [0, 'Nunca']].map(([v, t]) =>
        `<button type="button" class="${intervalo === v ? 'on' : ''}" data-act="intervalo" data-v="${v}">${t}</button>`).join('')}</div>
    </section>
    <button type="button" class="btn danger wide" data-act="apagar-tudo">Apagar todos os dados</button>
    <input type="file" id="ficheiro" accept="application/json,.json" hidden>`;
}

/* ================================================================
   Folha (bottom sheet) e aviso
   ================================================================ */
function abrirFolha(html) {
  const f = document.getElementById('sheet');
  f.innerHTML = '<div class="grab"></div>' + html;
  document.body.classList.add('sheet-open');
  const campo = f.querySelector('[autofocus]');
  if (campo) setTimeout(() => campo.focus(), 250);
}
function fecharFolha() { document.body.classList.remove('sheet-open'); }

let toastTimer = null;
function aviso(txt) {
  const t = document.getElementById('toast');
  t.textContent = txt;
  t.classList.add('show');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove('show'), 2200);
}

/* Comentários anteriores do mesmo bloco (pelo nome): um toque repete-os,
   útil quando o livro ou o projeto é o mesmo de ontem. */
function notasAnteriores(b, data) {
  const vistas = new Set();
  return Object.values(S.entries)
    .filter((e) => e.nomeSnapshot === b.nome && e.estado === 'feito' && e.nota && e.data < data)
    .sort((x, y) => y.data.localeCompare(x.data))
    .filter((e) => !vistas.has(e.nota) && vistas.add(e.nota))
    .slice(0, 4);
}

function folhaRegisto(data, blockId) {
  const b = bloco(blockId), e = reg(data, blockId);
  const futuro = data > hoje();
  const anteriores = notasAnteriores(b, data);
  abrirFolha(`<p class="sub">${esc(rotuloDia(data))} · ${esc(b.hora)}</p><h2>${esc(b.nome)}</h2>
    ${futuro ? '<p class="cap">Este dia ainda não chegou. Podes marcar na mesma, se já o fizeste antes.</p>' : ''}
    <label class="field"><span>Comentário</span><textarea id="fNota" rows="3" placeholder="${esc(b.nota || 'O que fizeste, ou porque não deu')}" autofocus>${esc(e ? e.nota : '')}</textarea></label>
    ${anteriores.length ? `<div class="prev"><span>Anteriores</span>${anteriores.map((x) =>
      `<button type="button" class="chip small" data-act="motivo" data-v="${esc(x.nota)}">${esc(x.nota)}</button>`).join('')}</div>` : ''}
    <label class="field"><span>Tempo (minutos)</span>
      <div class="stepper"><button type="button" data-act="step" data-n="-15">−15</button>
      <input id="fMin" type="number" inputmode="numeric" min="0" step="5" value="${e && e.estado === 'feito' ? e.minutos : b.minutos}">
      <button type="button" data-act="step" data-n="15">+15</button></div></label>
    <div class="prev"><span>Se não deu</span>${MOTIVOS.map((m) => `<button type="button" class="chip small" data-act="motivo" data-v="${m}">${m}</button>`).join('')}</div>
    <div class="sheet-acts">
      <button type="button" class="btn ok" data-act="guardar-registo" data-d="${data}" data-b="${blockId}" data-e="feito">Feito</button>
      <button type="button" class="btn warn" data-act="guardar-registo" data-d="${data}" data-b="${blockId}" data-e="falhado">Não cumprido</button>
    </div>
    ${e ? `<button type="button" class="btn ghost wide" data-act="guardar-registo" data-d="${data}" data-b="${blockId}" data-e="">Limpar registo</button>` : ''}`);
}

function folhaBloco(b) {
  const novo = !b;
  b = b || { id: DB.novoId('b'), nome: '', area: areas()[0].id, dias: [1, 2, 3, 4, 5], hora: '09:00', minutos: 60, nota: '', desde: hoje() };
  abrirFolha(`<h2>${novo ? 'Novo bloco' : 'Editar bloco'}</h2>
    <form data-form="bloco" data-id="${b.id}" data-novo="${novo ? 1 : 0}">
    <label class="field"><span>Nome</span><input id="bNome" type="text" value="${esc(b.nome)}" required placeholder="Ex.: Python" ${novo ? 'autofocus' : ''}></label>
    <div class="field"><span>Área</span><div class="chips-row tight" id="bArea">${areas().map((a) =>
      `<button type="button" class="chip ${a.id === b.area ? 'on' : ''}" data-act="pick" data-v="${a.id}" style="--c:${a.cor}"><i class="dot" style="background:${a.cor}"></i>${esc(a.nome)}</button>`).join('')}</div></div>
    <div class="field"><span>Dias</span><div class="days" id="bDias">${ORDEM_DIAS.map((d) =>
      `<button type="button" class="${b.dias.includes(d) ? 'on' : ''}" data-act="toggle-dia" data-v="${d}">${DIAS_CURTOS[d].slice(0, 3)}</button>`).join('')}</div>
      <div class="chips-row tight"><button type="button" class="chip small" data-act="dias" data-v="1,2,3,4,5">Dias úteis</button>
      <button type="button" class="chip small" data-act="dias" data-v="6,0">Fim de semana</button>
      <button type="button" class="chip small" data-act="dias" data-v="1,2,3,4,5,6,0">Todos</button></div></div>
    <div class="two">
      <label class="field"><span>Hora</span><input id="bHora" type="time" value="${esc(b.hora)}" required></label>
      <label class="field"><span>Duração (min)</span><input id="bMin" type="number" inputmode="numeric" min="5" step="5" value="${b.minutos}" required></label>
    </div>
    <div class="chips-row tight">${[15, 30, 45, 60, 90, 120].map((m) => `<button type="button" class="chip small" data-act="dur" data-v="${m}">${duracao(m)}</button>`).join('')}</div>
    <label class="field"><span>Nota ou pergunta (opcional)</span><input id="bNota" type="text" value="${esc(b.nota)}" placeholder="Ex.: Que livro? Quantas páginas?"></label>
    <label class="check"><input id="bPede" type="checkbox" ${b.pedeNota ? 'checked' : ''}>
      <span><b>Pedir comentário ao marcar</b>Ao fazer o tick abre logo o campo do comentário.</span></label>
    ${!novo && temHistorico(b.id) ? '<p class="cap">Mudar dias, hora ou duração vale a partir de hoje. As semanas passadas ficam como estavam.</p>' : ''}
    <div class="sheet-acts"><button type="submit" class="btn">Guardar</button>
    ${novo ? '<button type="button" class="btn ghost" data-act="fechar">Cancelar</button>' : `<button type="button" class="btn danger" data-act="apagar-bloco" data-b="${b.id}">Apagar</button>`}</div>
    </form>`);
}

function folhaArea(a) {
  const nova = !a;
  a = a || { id: DB.novoId('a'), nome: '', cor: '#5B54D6' };
  const usada = S.blocks.some((b) => b.area === a.id && (!b.ate || b.ate >= hoje()));
  abrirFolha(`<h2>${nova ? 'Nova área' : 'Editar área'}</h2>
    <form data-form="area" data-id="${a.id}">
    <label class="field"><span>Nome</span><input id="aNome" type="text" value="${esc(a.nome)}" required ${nova ? 'autofocus' : ''}></label>
    <label class="field"><span>Cor</span><input id="aCor" type="color" value="${esc(a.cor)}"></label>
    <div class="sheet-acts"><button type="submit" class="btn">Guardar</button>
    ${nova || a.id === 'outro' ? '<button type="button" class="btn ghost" data-act="fechar">Cancelar</button>'
      : `<button type="button" class="btn danger" data-act="apagar-area" data-id="${a.id}">${usada ? 'Apagar (blocos passam a Outro)' : 'Apagar'}</button>`}</div>
    </form>`);
}

function folhaTarefa(t) {
  abrirFolha(`<h2>Tarefa</h2><form data-form="editar-tarefa" data-id="${t.id}">
    <label class="field"><span>Texto</span><input id="tTexto" type="text" value="${esc(t.texto)}" required></label>
    <label class="field"><span>Dia</span><input id="tData" type="date" value="${esc(t.data)}" required></label>
    <div class="chips-row tight"><button type="button" class="chip small" data-act="t-dia" data-v="${hoje()}">Hoje</button>
    <button type="button" class="chip small" data-act="t-dia" data-v="${addDays(hoje(), 1)}">Amanhã</button>
    <button type="button" class="chip small" data-act="t-dia" data-v="${addDays(segundaDe(hoje()), 7)}">Próxima segunda</button></div>
    <div class="sheet-acts"><button type="submit" class="btn">Guardar</button>
    <button type="button" class="btn danger" data-act="apagar-tarefa" data-id="${t.id}">Apagar</button></div></form>`);
}

/* ================================================================
   Exportar e importar
   ================================================================ */
function descarregar(nome, conteudo, tipo) {
  const url = URL.createObjectURL(new Blob([conteudo], { type: tipo }));
  const a = document.createElement('a');
  a.href = url;
  a.download = nome;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 4000);   // revogar já cortava o download no telemóvel
}

async function exportarJSON() {
  descarregar('cadencia-' + hoje() + '.json', JSON.stringify(await DB.exportAll(), null, 2), 'application/json');
  await setCfg('ultimoBackup', hoje());
}

/* Ponto e vírgula e BOM: é o que o Excel em português espera. */
function exportarCSV() {
  const linhas = [['Data', 'Dia', 'Semana', 'Bloco', 'Área', 'Hora', 'Estado', 'Minutos', 'Nota']];
  Object.values(S.entries).sort((a, b) => a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora)).forEach((e) => {
    linhas.push([e.data, DIAS[diaSemana(e.data)], e.weekId, e.nomeSnapshot, area(e.area).nome, e.hora,
      e.estado === 'feito' ? 'feito' : 'não cumprido', e.minutos || 0, e.nota || '']);
  });
  const csv = linhas.map((l) => l.map((c) => {
    const t = String(c);
    return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
  }).join(';')).join('\r\n');
  descarregar('cadencia-registos-' + hoje() + '.csv', '﻿' + csv, 'text/csv;charset=utf-8');
}

let ficheiroPendente = null;
function escolherImportacao(ficheiro) {
  const leitor = new FileReader();
  leitor.onload = () => {
    try { ficheiroPendente = JSON.parse(leitor.result); }
    catch (e) { aviso('O ficheiro não é JSON válido.'); return; }
    const n = (ficheiroPendente.blocks || []).length;
    abrirFolha(`<h2>Importar</h2><p class="cap">${esc(ficheiro.name)} · ${n} blocos. Backups da versão 1 também servem.</p>
      <div class="sheet-acts"><button type="button" class="btn" data-act="importar-ok" data-v="fundir">Juntar ao que tenho</button>
      <button type="button" class="btn danger" data-act="importar-ok" data-v="substituir">Substituir tudo</button></div>`);
  };
  leitor.readAsText(ficheiro, 'utf-8');
}

/* ================================================================
   Desenhar, tema, navegação
   ================================================================ */
const VIEWS = { hoje: viewHoje, semana: viewSemana, evolucao: viewEvolucao, ajustes: viewAjustes };

function render(manterScroll) {
  const y = window.scrollY;
  document.getElementById('app').innerHTML = '<main class="main">' + VIEWS[S.view]() + '</main>';
  document.querySelectorAll('.tab').forEach((b) => b.classList.toggle('on', b.dataset.v === S.view));
  window.scrollTo(0, manterScroll ? y : 0);
}
const refrescar = () => render(true);

function irPara(v) {
  S.view = v;
  if (v === 'hoje') S.dia = hoje();
  if (v === 'semana') S.semana = segundaDe(hoje());
  fecharFolha();
  render(false);
}

const escuroMQ = window.matchMedia('(prefers-color-scheme: dark)');
function aplicarTema() {
  const t = cfg('tema', 'auto');
  const escuro = t === 'dark' || (t === 'auto' && escuroMQ.matches);
  document.documentElement.dataset.theme = escuro ? 'dark' : 'light';
  document.querySelector('meta[name="theme-color"]').content = escuro ? '#070B16' : '#ECEAE6';
}
escuroMQ.addEventListener('change', aplicarTema);

/* ================================================================
   Ações — todos os cliques passam por aqui
   ================================================================ */
const acoes = {
  ir: (el) => irPara(el.dataset.v),
  fechar: fecharFolha,

  dia: (el) => { S.dia = el.dataset.d; render(false); },
  'semana-dia': (el) => { S.dia = addDays(S.dia, Number(el.dataset.n)); render(false); },
  semana: (el) => { const n = Number(el.dataset.n); S.semana = n ? addDays(S.semana, n) : segundaDe(hoje()); render(false); },
  'abrir-dia': (el) => { S.view = 'hoje'; S.dia = el.dataset.d; render(false); },
  evo: (el) => { S.evo = Number(el.dataset.n); refrescar(); },

  // um toque: por fazer -> feito -> por fazer; não cumprido volta a por fazer
  toggle: async (el) => {
    const { d, b } = el.dataset;
    if (d > hoje()) { aviso('Ainda não chegou este dia'); return; }
    const e = reg(d, b);
    await registar(d, b, e ? '' : 'feito');
    refrescar();
    if (!e && bloco(b).pedeNota) { folhaRegisto(d, b); return; }   // ex.: Leitura pergunta que livro
    if (!e) {
      const r = resumoDia(d);
      aviso(r.feitos === r.total ? 'Dia completo' : 'Feito');
    }
  },
  registo: (el) => folhaRegisto(el.dataset.d, el.dataset.b),
  step: (el) => { const i = document.getElementById('fMin'); i.value = Math.max(0, (Number(i.value) || 0) + Number(el.dataset.n)); },
  motivo: (el) => { document.getElementById('fNota').value = el.dataset.v; },
  'guardar-registo': async (el) => {
    const { d, b } = el.dataset;
    await registar(d, b, el.dataset.e, Number(document.getElementById('fMin').value) || 0, document.getElementById('fNota').value.trim());
    fecharFolha();
    refrescar();
  },

  tarefa: async (el) => { const t = S.tasks[el.dataset.id]; t.feita = !t.feita; await guardarTarefa(t); refrescar(); },
  'tarefa-menu': (el) => folhaTarefa(S.tasks[el.dataset.id]),
  't-dia': (el) => { document.getElementById('tData').value = el.dataset.v; },
  trazer: async (el) => { const t = S.tasks[el.dataset.id]; t.data = hoje(); await guardarTarefa(t); refrescar(); },
  'trazer-todas': async () => {
    for (const t of tarefasAtrasadas()) { t.data = hoje(); await guardarTarefa(t); }
    refrescar();
  },
  'apagar-tarefa': async (el) => { await apagarTarefa(el.dataset.id); fecharFolha(); refrescar(); aviso('Tarefa apagada'); },

  'novo-bloco': () => folhaBloco(null),
  'editar-bloco': (el) => folhaBloco(bloco(el.dataset.b)),
  pick: (el) => { el.parentElement.querySelectorAll('.chip').forEach((c) => c.classList.toggle('on', c === el)); },
  'toggle-dia': (el) => el.classList.toggle('on'),
  dias: (el) => {
    const v = el.dataset.v.split(',');
    document.querySelectorAll('#bDias button').forEach((b) => b.classList.toggle('on', v.includes(b.dataset.v)));
  },
  dur: (el) => { document.getElementById('bMin').value = el.dataset.v; },
  'apagar-bloco': async (el) => {
    if (!confirm('Apagar este bloco da rotina? Os registos passados ficam.')) return;
    await apagarBloco(el.dataset.b);
    fecharFolha();
    refrescar();
    aviso('Bloco apagado');
  },

  juntar: async () => { const n = await juntarRepetidos(); refrescar(); aviso(n + ' blocos juntados'); },

  'nova-area': () => folhaArea(null),
  'editar-area': (el) => folhaArea(areas().find((a) => a.id === el.dataset.id)),
  'apagar-area': async (el) => {
    const id = el.dataset.id;
    for (const b of S.blocks.filter((x) => x.area === id)) { b.area = 'outro'; await DB.put('blocks', b); }
    await setCfg('areas', areas().filter((a) => a.id !== id));
    fecharFolha();
    refrescar();
  },

  tema: async (el) => { await setCfg('tema', el.dataset.v); aplicarTema(); refrescar(); },
  intervalo: async (el) => { await setCfg('intervaloBackup', Number(el.dataset.v)); refrescar(); },
  'adiar-backup': () => { try { localStorage.setItem('cadencia-backup-adiado', hoje()); } catch (e) { /* sem storage */ } refrescar(); },
  'backup-agora': async () => { await exportarJSON(); refrescar(); aviso('Cópia exportada'); },
  exportar: async () => { await exportarJSON(); refrescar(); aviso('Cópia exportada'); },
  csv: () => { exportarCSV(); aviso('CSV exportado'); },
  importar: () => document.getElementById('ficheiro').click(),
  'importar-ok': async (el) => {
    try {
      const r = await DB.importAll(ficheiroPendente, el.dataset.v === 'substituir');
      await carregar();
      aplicarTema();
      fecharFolha();
      refrescar();
      aviso(r.blocos + ' blocos e ' + r.registos + ' registos importados');
    } catch (e) { aviso(e.message); }
  },
  'drive-backup': async () => {
    try {
      aviso('A ligar ao Drive…');
      await Drive.connect();
      await Drive.backup();
      await setCfg('ultimoBackup', hoje());
      refrescar();
      aviso('Cópia guardada no Drive');
    } catch (e) { aviso('Drive: ' + e.message); }
  },
  'drive-restore': async () => {
    if (!confirm('Juntar a cópia do Drive ao que está neste dispositivo?')) return;
    try {
      await Drive.connect();
      const r = await Drive.restore();
      await carregar();
      refrescar();
      aviso(r.registos + ' registos trazidos do Drive');
    } catch (e) { aviso('Drive: ' + e.message); }
  },
  'apagar-tudo': async () => {
    if (!confirm('Apagar todos os blocos, registos e tarefas deste dispositivo? Exporta primeiro se quiseres guardar.')) return;
    await DB.clearAll();
    await carregar();
    aplicarTema();
    refrescar();
    aviso('Dados apagados');
  }
};

document.addEventListener('click', (ev) => {
  const tab = ev.target.closest('.tab');
  if (tab) { irPara(tab.dataset.v); return; }
  if (ev.target.id === 'scrim') { fecharFolha(); return; }
  const el = ev.target.closest('[data-act]');
  if (!el || !acoes[el.dataset.act]) return;
  ev.preventDefault();
  acoes[el.dataset.act](el);
});

/* Formulários (Enter no teclado do telemóvel também envia) */
const formularios = {
  tarefa: async () => {
    const i = document.getElementById('novaTarefa');
    const texto = i.value.trim();
    if (!texto) return;
    await guardarTarefa({ id: DB.novoId('t'), texto, data: S.dia, weekId: weekId(S.dia), feita: false, criadoEm: new Date().toISOString() });
    refrescar();
    document.getElementById('novaTarefa').focus();
  },
  bloco: async (f) => {
    const dias = [...document.querySelectorAll('#bDias button.on')].map((b) => Number(b.dataset.v));
    if (!dias.length) { aviso('Escolhe pelo menos um dia'); return; }
    const antigo = bloco(f.dataset.id);
    const b = Object.assign({}, antigo || { id: f.dataset.id, desde: hoje() }, {
      nome: document.getElementById('bNome').value.trim(),
      area: (document.querySelector('#bArea .chip.on') || {}).dataset?.v || 'outro',
      dias,
      hora: document.getElementById('bHora').value,
      minutos: Math.max(5, Number(document.getElementById('bMin').value) || 60),
      nota: document.getElementById('bNota').value.trim(),
      pedeNota: document.getElementById('bPede').checked
    });
    await guardarBloco(b);
    fecharFolha();
    refrescar();
    aviso('Bloco guardado');
  },
  area: async (f) => {
    const lista = areas().slice();
    const a = { id: f.dataset.id, nome: document.getElementById('aNome').value.trim(), cor: document.getElementById('aCor').value };
    const i = lista.findIndex((x) => x.id === a.id);
    if (i === -1) lista.splice(lista.length - 1, 0, a); else lista[i] = a;   // "Outro" fica sempre no fim
    await setCfg('areas', lista);
    fecharFolha();
    refrescar();
  },
  'editar-tarefa': async (f) => {
    const t = S.tasks[f.dataset.id];
    t.texto = document.getElementById('tTexto').value.trim() || t.texto;
    t.data = document.getElementById('tData').value || t.data;
    t.weekId = weekId(t.data);
    await guardarTarefa(t);
    fecharFolha();
    refrescar();
  }
};

document.addEventListener('submit', (ev) => {
  const f = ev.target.closest('[data-form]');
  if (!f) return;
  ev.preventDefault();
  formularios[f.dataset.form](f);
});

document.addEventListener('change', (ev) => {
  if (ev.target.id === 'ficheiro' && ev.target.files[0]) {
    escolherImportacao(ev.target.files[0]);
    ev.target.value = '';
  }
});

/* Ao voltar à app noutro dia, Hoje passa a ser o dia novo. */
let ultimoDia = hoje();
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState !== 'visible' || hoje() === ultimoDia) return;
  ultimoDia = hoje();
  if (S.view === 'hoje') S.dia = hoje();
  refrescar();
});

/* ================================================================
   Arranque
   ================================================================ */
async function init() {
  try {
    await carregar();
    aplicarTema();
    render(false);
    // pede ao browser para não apagar os dados quando faltar espaço
    if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  } catch (e) {
    document.getElementById('app').innerHTML = '<main class="main"><header class="head"><h1>Erro ao arrancar</h1></header><p class="empty">' + esc(e.message) + '</p></main>';
  }
}

if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

init();
