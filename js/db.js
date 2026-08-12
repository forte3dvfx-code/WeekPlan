/* db.js — IndexedDB.
 *
 * Cinco stores:
 *   blocks    o horário. Agora vive aqui e não em código, para ser editável.
 *   weeks     uma por semana ISO, guarda a variação escolhida
 *   entries   uma por bloco por dia real
 *   tasks     tarefas e planos avulsos, ligados a um dia ou a uma semana
 *   settings  pares chave/valor (curso activo, lembrete de backup)
 *
 * IndexedDB e não localStorage porque os gráficos varrem centenas de entradas
 * por faixa e por semana — sem índices isso obrigaria a ler tudo para memória
 * a cada abertura.
 */
var CAD = CAD || {};

CAD.db = (function () {
  'use strict';

  var DB_NAME = 'cadencia';
  var DB_VERSION = 1;

  /* Os quatro estados. "na" é para blocos que a variação da semana desligou:
     não contam como falha em lado nenhum. É isto que impede a app de
     transformar folga autorizada em culpa. */
  var ESTADOS = {
    PENDENTE: 'pendente',
    FEITO: 'feito',
    FALHADO: 'falhado',
    NA: 'na'
  };

  var dbPromise = null;

  function open() {
    if (dbPromise) return dbPromise;

    dbPromise = new Promise(function (resolve, reject) {
      var pedido = indexedDB.open(DB_NAME, DB_VERSION);

      pedido.onupgradeneeded = function (evento) {
        var db = evento.target.result;

        if (!db.objectStoreNames.contains('blocks')) {
          var blocks = db.createObjectStore('blocks', { keyPath: 'id' });
          blocks.createIndex('porDia', 'dia');
        }
        if (!db.objectStoreNames.contains('weeks')) {
          db.createObjectStore('weeks', { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains('entries')) {
          var entries = db.createObjectStore('entries', { keyPath: 'id' });
          entries.createIndex('porData', 'data');      // ecrã Hoje
          entries.createIndex('porSemana', 'weekId');  // ecrã Semana
          entries.createIndex('porFaixa', 'faixa');    // gráficos
          entries.createIndex('porCurso', 'curso');    // horas por curso
        }
        if (!db.objectStoreNames.contains('tasks')) {
          var tasks = db.createObjectStore('tasks', { keyPath: 'id' });
          tasks.createIndex('porData', 'data');
          tasks.createIndex('porSemana', 'weekId');
        }
        if (!db.objectStoreNames.contains('settings')) {
          db.createObjectStore('settings', { keyPath: 'chave' });
        }
      };

      pedido.onsuccess = function () { resolve(pedido.result); };
      pedido.onerror = function () { reject(pedido.error); };
      pedido.onblocked = function () {
        reject(new Error('Fecha os outros separadores da app e tenta outra vez.'));
      };
    });

    return dbPromise;
  }

  /* Envolve uma transacção numa promessa. */
  function tx(stores, modo, trabalho) {
    return open().then(function (db) {
      return new Promise(function (resolve, reject) {
        var transacao = db.transaction(stores, modo);
        var resultado;
        transacao.oncomplete = function () { resolve(resultado); };
        transacao.onerror = function () { reject(transacao.error); };
        transacao.onabort = function () { reject(transacao.error); };
        Promise.resolve(trabalho(transacao))
          .then(function (valor) { resultado = valor; })
          .catch(reject);
      });
    });
  }

  function req(pedido) {
    return new Promise(function (resolve, reject) {
      pedido.onsuccess = function () { resolve(pedido.result); };
      pedido.onerror = function () { reject(pedido.error); };
    });
  }

  /* Id da entrada: determinístico (data + bloco). Regenerar um dia que já foi
     registado reescreve as mesmas chaves em vez de duplicar. É o que permite
     mudar a variação a meio da semana sem perder registos. */
  function entryId(data, blockId) { return data + '__' + blockId; }

  /* Id novo para blocos e tarefas criados pelo utilizador. */
  function novoId(prefixo) {
    return prefixo + '-' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* --- blocos (o horário) --- */
  function todosBlocos() {
    return tx('blocks', 'readonly', function (t) {
      return req(t.objectStore('blocks').getAll());
    }).then(function (lista) {
      return lista.sort(function (a, b) {
        return a.dia - b.dia || a.hora.localeCompare(b.hora);
      });
    });
  }
  function guardarBloco(bloco) {
    return tx('blocks', 'readwrite', function (t) {
      return req(t.objectStore('blocks').put(bloco));
    });
  }
  function guardarBlocos(lista) {
    return tx('blocks', 'readwrite', function (t) {
      var store = t.objectStore('blocks');
      lista.forEach(function (b) { store.put(b); });
      return lista.length;
    });
  }
  function apagarBloco(id) {
    return tx('blocks', 'readwrite', function (t) {
      return req(t.objectStore('blocks').delete(id));
    });
  }

  /* --- semanas --- */
  function obterSemana(id) {
    return tx('weeks', 'readonly', function (t) { return req(t.objectStore('weeks').get(id)); });
  }
  function guardarSemana(semana) {
    return tx('weeks', 'readwrite', function (t) { return req(t.objectStore('weeks').put(semana)); });
  }
  function todasSemanas() {
    return tx('weeks', 'readonly', function (t) {
      return req(t.objectStore('weeks').getAll());
    }).then(function (l) {
      return l.sort(function (a, b) { return a.inicio.localeCompare(b.inicio); });
    });
  }

  /* --- entradas --- */
  function obterEntrada(id) {
    return tx('entries', 'readonly', function (t) { return req(t.objectStore('entries').get(id)); });
  }
  function guardarEntrada(entrada) {
    entrada.atualizadoEm = new Date().toISOString();
    return tx('entries', 'readwrite', function (t) {
      return req(t.objectStore('entries').put(entrada));
    });
  }
  function guardarEntradas(lista) {
    var marca = new Date().toISOString();
    return tx('entries', 'readwrite', function (t) {
      var store = t.objectStore('entries');
      lista.forEach(function (e) { e.atualizadoEm = marca; store.put(e); });
      return lista.length;
    });
  }
  function porIndice(store, indice, valor, ordenar) {
    return tx(store, 'readonly', function (t) {
      return req(t.objectStore(store).index(indice).getAll(valor));
    }).then(function (l) { return ordenar ? l.sort(ordenar) : l; });
  }
  var porDataHora = function (a, b) {
    return a.data.localeCompare(b.data) || (a.hora || '').localeCompare(b.hora || '');
  };
  function entradasDoDia(data) { return porIndice('entries', 'porData', data, porDataHora); }
  function entradasDaSemana(id) { return porIndice('entries', 'porSemana', id, porDataHora); }
  function entradasDaFaixa(f) { return porIndice('entries', 'porFaixa', f, porDataHora); }
  function entradasDoCurso(c) { return porIndice('entries', 'porCurso', c, porDataHora); }
  function todasEntradas() {
    return tx('entries', 'readonly', function (t) {
      return req(t.objectStore('entries').getAll());
    }).then(function (l) { return l.sort(porDataHora); });
  }
  function apagarEntrada(id) {
    return tx('entries', 'readwrite', function (t) {
      return req(t.objectStore('entries').delete(id));
    });
  }

  /* --- tarefas --- */
  function guardarTarefa(tarefa) {
    return tx('tasks', 'readwrite', function (t) { return req(t.objectStore('tasks').put(tarefa)); });
  }
  function apagarTarefa(id) {
    return tx('tasks', 'readwrite', function (t) { return req(t.objectStore('tasks').delete(id)); });
  }
  function tarefasDoDia(data) { return porIndice('tasks', 'porData', data, null); }
  function tarefasDaSemana(id) { return porIndice('tasks', 'porSemana', id, null); }
  function todasTarefas() {
    return tx('tasks', 'readonly', function (t) { return req(t.objectStore('tasks').getAll()); });
  }

  /* --- definições --- */
  function obterDefinicao(chave, omissao) {
    return tx('settings', 'readonly', function (t) {
      return req(t.objectStore('settings').get(chave));
    }).then(function (linha) {
      return linha ? linha.valor : (omissao === undefined ? null : omissao);
    });
  }
  function guardarDefinicao(chave, valor) {
    return tx('settings', 'readwrite', function (t) {
      return req(t.objectStore('settings').put({ chave: chave, valor: valor }));
    });
  }
  function todasDefinicoes() {
    return tx('settings', 'readonly', function (t) {
      return req(t.objectStore('settings').getAll());
    }).then(function (linhas) {
      var out = {};
      linhas.forEach(function (l) { out[l.chave] = l.valor; });
      return out;
    });
  }

  /* --- exportar / importar --- */
  function exportarTudo() {
    return Promise.all([todosBlocos(), todasSemanas(), todasEntradas(), todasTarefas(), todasDefinicoes()])
      .then(function (r) {
        return {
          app: 'cadencia',
          versao: DB_VERSION,
          exportadoEm: new Date().toISOString(),
          blocks: r[0], weeks: r[1], entries: r[2], tasks: r[3], settings: r[4]
        };
      });
  }

  /* Funde por omissão: o que existe é reescrito, o resto mantém-se.
     Só apaga tudo se `substituir` for true — e isso exige confirmação no ecrã. */
  function importarTudo(dump, opcoes) {
    opcoes = opcoes || {};
    if (!dump || dump.app !== 'cadencia') {
      return Promise.reject(new Error('Este ficheiro não é um backup da Cadência.'));
    }
    return tx(['blocks', 'weeks', 'entries', 'tasks', 'settings'], 'readwrite', function (t) {
      if (opcoes.substituir) {
        ['blocks', 'weeks', 'entries', 'tasks', 'settings'].forEach(function (s) {
          t.objectStore(s).clear();
        });
      }
      (dump.blocks || []).forEach(function (b) { t.objectStore('blocks').put(b); });
      (dump.weeks || []).forEach(function (w) { t.objectStore('weeks').put(w); });
      (dump.entries || []).forEach(function (e) { t.objectStore('entries').put(e); });
      (dump.tasks || []).forEach(function (k) { t.objectStore('tasks').put(k); });
      Object.keys(dump.settings || {}).forEach(function (c) {
        t.objectStore('settings').put({ chave: c, valor: dump.settings[c] });
      });
      return {
        blocos: (dump.blocks || []).length,
        semanas: (dump.weeks || []).length,
        entradas: (dump.entries || []).length,
        tarefas: (dump.tasks || []).length
      };
    });
  }

  function apagarTudo() {
    return tx(['blocks', 'weeks', 'entries', 'tasks', 'settings'], 'readwrite', function (t) {
      ['blocks', 'weeks', 'entries', 'tasks', 'settings'].forEach(function (s) {
        t.objectStore(s).clear();
      });
      return true;
    });
  }

  return {
    DB_NAME: DB_NAME, DB_VERSION: DB_VERSION, ESTADOS: ESTADOS,
    open: open, entryId: entryId, novoId: novoId,
    todosBlocos: todosBlocos, guardarBloco: guardarBloco, guardarBlocos: guardarBlocos, apagarBloco: apagarBloco,
    obterSemana: obterSemana, guardarSemana: guardarSemana, todasSemanas: todasSemanas,
    obterEntrada: obterEntrada, guardarEntrada: guardarEntrada, guardarEntradas: guardarEntradas,
    entradasDoDia: entradasDoDia, entradasDaSemana: entradasDaSemana,
    entradasDaFaixa: entradasDaFaixa, entradasDoCurso: entradasDoCurso,
    todasEntradas: todasEntradas, apagarEntrada: apagarEntrada,
    guardarTarefa: guardarTarefa, apagarTarefa: apagarTarefa,
    tarefasDoDia: tarefasDoDia, tarefasDaSemana: tarefasDaSemana, todasTarefas: todasTarefas,
    obterDefinicao: obterDefinicao, guardarDefinicao: guardarDefinicao, todasDefinicoes: todasDefinicoes,
    exportarTudo: exportarTudo, importarTudo: importarTudo, apagarTudo: apagarTudo
  };
})();
