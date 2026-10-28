/* db.js — base de dados (IndexedDB).
 *
 * Quatro stores em uso:
 *   blocks    a rotina: o que se repete todas as semanas
 *   entries   um registo por bloco por dia, só quando é marcado
 *             (feito ou não cumprido). O que não tem registo está por fazer.
 *   tasks     tarefas soltas ligadas a um dia
 *   settings  pares chave/valor (áreas, tema, backup)
 *
 * A base chama-se "cadencia", igual à versão 1. Ao abrir a versão 2 pela
 * primeira vez, os dados antigos são convertidos sozinhos (ver upgrade).
 */

const DB = (function () {
  const NAME = 'cadencia';
  const VERSION = 2;
  const STORES = ['blocks', 'entries', 'tasks', 'settings'];

  let dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;
    dbPromise = new Promise((resolve, reject) => {
      const pedido = indexedDB.open(NAME, VERSION);

      pedido.onupgradeneeded = (ev) => {
        const db = ev.target.result;
        const t = ev.target.transaction;

        if (!db.objectStoreNames.contains('blocks')) db.createObjectStore('blocks', { keyPath: 'id' });
        if (!db.objectStoreNames.contains('entries')) {
          const e = db.createObjectStore('entries', { keyPath: 'id' });
          e.createIndex('porData', 'data');
        }
        if (!db.objectStoreNames.contains('tasks')) {
          const k = db.createObjectStore('tasks', { keyPath: 'id' });
          k.createIndex('porData', 'data');
        }
        if (!db.objectStoreNames.contains('settings')) db.createObjectStore('settings', { keyPath: 'chave' });

        // Vinda da versão 1: blocos com um só dia passam a ter lista de dias,
        // e as entradas "pendente"/"na" (pré-geradas) deixam de ser precisas.
        if (ev.oldVersion === 1) {
          t.objectStore('blocks').openCursor().onsuccess = (c) => {
            const cur = c.target.result;
            if (!cur) return;
            cur.update(normalizarBloco(cur.value));
            cur.continue();
          };
          t.objectStore('entries').openCursor().onsuccess = (c) => {
            const cur = c.target.result;
            if (!cur) return;
            if (!entradaValida(cur.value)) cur.delete();
            cur.continue();
          };
        }
      };

      pedido.onsuccess = () => resolve(pedido.result);
      pedido.onerror = () => reject(pedido.error);
      pedido.onblocked = () => reject(new Error('Fecha os outros separadores da app e tenta outra vez.'));
    });
    return dbPromise;
  }

  /* --- conversão de formatos antigos (base e ficheiros importados) --- */
  function normalizarBloco(b) {
    const out = Object.assign({}, b);
    if (!Array.isArray(out.dias)) out.dias = typeof out.dia === 'number' ? [out.dia] : [];
    delete out.dia;
    delete out.variacoes;
    delete out.curso;
    if (out.pedeNota === undefined) out.pedeNota = !!out.pedeResultado;   // nome da v1
    delete out.pedeResultado;
    if (!out.area) out.area = out.faixa || 'outro';
    delete out.faixa;
    if (!out.desde) out.desde = '2000-01-01';
    return out;
  }

  function entradaValida(e) {
    return e && (e.estado === 'feito' || e.estado === 'falhado');
  }

  function normalizarEntrada(e) {
    const out = Object.assign({}, e);
    if (!out.area) out.area = out.faixa || 'outro';
    delete out.faixa;
    delete out.curso;
    if (out.nota === undefined) out.nota = out.estado === 'falhado' ? (out.motivo || '') : (out.resultado || '');
    delete out.motivo;
    delete out.resultado;
    return out;
  }

  /* --- leitura e escrita genéricas --- */
  function tx(stores, modo, trabalho) {
    return open().then((db) => new Promise((resolve, reject) => {
      const t = db.transaction(stores, modo);
      let resultado;
      t.oncomplete = () => resolve(resultado);
      t.onerror = () => reject(t.error);
      t.onabort = () => reject(t.error);
      resultado = trabalho(t);
    }));
  }

  function all(store) {
    return open().then((db) => new Promise((resolve, reject) => {
      const r = db.transaction(store).objectStore(store).getAll();
      r.onsuccess = () => resolve(r.result || []);
      r.onerror = () => reject(r.error);
    }));
  }

  const put = (store, valor) => tx([store], 'readwrite', (t) => { t.objectStore(store).put(valor); });
  const del = (store, id) => tx([store], 'readwrite', (t) => { t.objectStore(store).delete(id); });

  function getSettings() {
    return all('settings').then((linhas) => {
      const out = {};
      linhas.forEach((l) => { out[l.chave] = l.valor; });
      return out;
    });
  }
  const setSetting = (chave, valor) => put('settings', { chave, valor });

  const novoId = (prefixo) => prefixo + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

  /* --- exportar / importar --- */
  async function exportAll() {
    const [blocks, entries, tasks, settings] = await Promise.all([
      all('blocks'), all('entries'), all('tasks'), getSettings()
    ]);
    return { app: 'cadencia', versao: VERSION, exportadoEm: new Date().toISOString(), blocks, entries, tasks, settings };
  }

  /* Funde por omissão: o que tem o mesmo id é reescrito, o resto fica.
     Aceita backups da versão 1 e converte-os. */
  function importAll(dump, substituir) {
    if (!dump || dump.app !== 'cadencia') {
      return Promise.reject(new Error('Este ficheiro não é um backup da Cadência.'));
    }
    const blocks = (dump.blocks || []).map(normalizarBloco);
    const entries = (dump.entries || []).filter(entradaValida).map(normalizarEntrada);
    const tasks = dump.tasks || [];
    const settings = dump.settings || {};
    return tx(STORES, 'readwrite', (t) => {
      if (substituir) STORES.forEach((s) => t.objectStore(s).clear());
      blocks.forEach((b) => t.objectStore('blocks').put(b));
      entries.forEach((e) => t.objectStore('entries').put(e));
      tasks.forEach((k) => t.objectStore('tasks').put(k));
      // as chaves do Drive e do backup são deste dispositivo: não se importam
      Object.keys(settings).forEach((c) => {
        if (/^(drive|ultimoBackup)/.test(c)) return;
        t.objectStore('settings').put({ chave: c, valor: settings[c] });
      });
      return { blocos: blocks.length, registos: entries.length, tarefas: tasks.length };
    });
  }

  const clearAll = () => tx(STORES, 'readwrite', (t) => STORES.forEach((s) => t.objectStore(s).clear()));

  return {
    open, all, put, del, getSettings, setSetting, novoId,
    normalizarBloco, normalizarEntrada, exportAll, importAll, clearAll
  };
})();
