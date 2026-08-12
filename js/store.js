/* store.js — estado em memória e geração das entradas.
 *
 * A app carrega tudo para memória no arranque (são poucos milhares de
 * registos, no máximo) e escreve em IndexedDB a cada alteração. Assim os
 * ecrãs desenham-se sem esperar por consultas assíncronas.
 */
var CAD = CAD || {};

CAD.store = (function () {
  'use strict';

  var d = CAD.dates, db = CAD.db, sch = CAD.schedule;

  var estado = {
    blocos: [],       // horário
    blocosPorId: {},
    semanas: {},      // weekId -> { id, inicio, variacao, nota }
    entradas: {},     // id -> entrada
    tarefas: {},      // id -> tarefa
    cursos: [],
    cursosAtivos: {}, // faixa -> cursoId
    definicoes: {}
  };

  function carregar() {
    return Promise.all([
      db.todosBlocos(), db.todasSemanas(), db.todasEntradas(),
      db.todasTarefas(), db.todasDefinicoes()
    ]).then(function (r) {
      estado.blocos = r[0];
      estado.blocosPorId = {};
      estado.blocos.forEach(function (b) { estado.blocosPorId[b.id] = b; });

      estado.semanas = {};
      r[1].forEach(function (s) { estado.semanas[s.id] = s; });

      estado.entradas = {};
      r[2].forEach(function (e) { estado.entradas[e.id] = e; });

      estado.tarefas = {};
      r[3].forEach(function (t) { estado.tarefas[t.id] = t; });

      estado.definicoes = r[4] || {};
      estado.cursos = estado.definicoes.cursos || [];
      estado.cursosAtivos = estado.definicoes.cursosAtivos || {};
      return estado;
    });
  }

  function vazia() { return estado.blocos.length === 0; }

  function bloco(id) { return estado.blocosPorId[id]; }

  /* --- semanas --- */
  function semana(weekId) {
    if (!estado.semanas[weekId]) {
      estado.semanas[weekId] = {
        id: weekId,
        inicio: d.inicioDaSemana(weekId),
        variacao: sch.VARIACAO_OMISSAO,
        nota: ''
      };
      db.guardarSemana(estado.semanas[weekId]);
    }
    return estado.semanas[weekId];
  }

  function definirVariacao(weekId, variacao) {
    var s = semana(weekId);
    s.variacao = variacao;
    return db.guardarSemana(s).then(function () { return gerarSemana(weekId); });
  }

  /* --- geração de entradas ---
   *
   * Chamado ao abrir um dia ou uma semana. Cria o que falta e passa a "na"
   * os blocos que a variação desligou — mas nunca toca em registos já feitos.
   */
  function gerarDia(data) {
    var weekId = d.weekId(data);
    var variacao = semana(weekId).variacao;
    var dia = d.diaSemana(data);
    var doDia = estado.blocos.filter(function (b) { return b.dia === dia; });
    var ativos = {};
    sch.blocosDoDia(estado.blocos, dia, variacao).forEach(function (b) { ativos[b.id] = true; });

    var mudadas = [];
    doDia.forEach(function (b) {
      var id = db.entryId(data, b.id);
      var e = estado.entradas[id];

      if (ativos[b.id]) {
        if (!e) {
          e = {
            id: id, weekId: weekId, data: data, blockId: b.id,
            nomeSnapshot: b.nome, faixa: b.faixa, hora: b.hora,
            estado: db.ESTADOS.PENDENTE, motivo: '', resultado: '', minutos: 0,
            curso: b.curso ? (estado.cursosAtivos[b.faixa] || null) : null
          };
          estado.entradas[id] = e;
          mudadas.push(e);
        } else if (e.estado === db.ESTADOS.NA) {
          e.estado = db.ESTADOS.PENDENTE;
          mudadas.push(e);
        }
      } else {
        if (!e) {
          e = {
            id: id, weekId: weekId, data: data, blockId: b.id,
            nomeSnapshot: b.nome, faixa: b.faixa, hora: b.hora,
            estado: db.ESTADOS.NA, motivo: '', resultado: '', minutos: 0, curso: null
          };
          estado.entradas[id] = e;
          mudadas.push(e);
        } else if (e.estado === db.ESTADOS.PENDENTE) {
          // só desliga o que ainda não foi registado; feito e falhado ficam
          e.estado = db.ESTADOS.NA;
          mudadas.push(e);
        }
      }
    });

    return mudadas.length ? db.guardarEntradas(mudadas) : Promise.resolve(0);
  }

  function gerarSemana(weekId) {
    var dias = d.diasDaSemana(weekId);
    return dias.reduce(function (p, data) {
      return p.then(function () { return gerarDia(data); });
    }, Promise.resolve());
  }

  /* --- leitura --- */
  function entradasDoDia(data) {
    return Object.keys(estado.entradas)
      .map(function (k) { return estado.entradas[k]; })
      .filter(function (e) { return e.data === data; })
      .sort(function (a, b) { return a.hora.localeCompare(b.hora); });
  }

  function entradasDaSemana(weekId) {
    return Object.keys(estado.entradas)
      .map(function (k) { return estado.entradas[k]; })
      .filter(function (e) { return e.weekId === weekId; })
      .sort(function (a, b) {
        return a.data.localeCompare(b.data) || a.hora.localeCompare(b.hora);
      });
  }

  function todasEntradas() {
    return Object.keys(estado.entradas).map(function (k) { return estado.entradas[k]; });
  }

  function entrada(id) { return estado.entradas[id]; }

  /* --- escrita de entradas --- */
  function marcarFeito(id, minutos, resultado) {
    var e = estado.entradas[id];
    if (!e) return Promise.resolve();
    var b = bloco(e.blockId);
    e.estado = db.ESTADOS.FEITO;
    e.minutos = minutos === undefined || minutos === null ? (b ? b.minutos : 0) : minutos;
    e.resultado = resultado || '';
    e.motivo = '';
    return db.guardarEntrada(e);
  }

  function marcarFalhado(id, motivo) {
    var e = estado.entradas[id];
    if (!e) return Promise.resolve();
    e.estado = db.ESTADOS.FALHADO;
    e.motivo = motivo || '';
    e.minutos = 0;
    e.resultado = '';
    return db.guardarEntrada(e);
  }

  function limparEstado(id) {
    var e = estado.entradas[id];
    if (!e) return Promise.resolve();
    e.estado = db.ESTADOS.PENDENTE;
    e.minutos = 0;
    e.motivo = '';
    e.resultado = '';
    return db.guardarEntrada(e);
  }

  /* --- tarefas --- */
  function tarefasDoDia(data) {
    return Object.keys(estado.tarefas)
      .map(function (k) { return estado.tarefas[k]; })
      .filter(function (t) { return t.data === data; })
      .sort(function (a, b) { return (a.criadoEm || '').localeCompare(b.criadoEm || ''); });
  }

  function tarefasDaSemana(weekId) {
    return Object.keys(estado.tarefas)
      .map(function (k) { return estado.tarefas[k]; })
      .filter(function (t) { return t.weekId === weekId; })
      .sort(function (a, b) { return (a.data || '').localeCompare(b.data || ''); });
  }

  function criarTarefa(texto, data) {
    var t = {
      id: db.novoId('t'),
      texto: texto,
      data: data,
      weekId: d.weekId(data),
      feita: false,
      nota: '',
      criadoEm: new Date().toISOString()
    };
    estado.tarefas[t.id] = t;
    return db.guardarTarefa(t).then(function () { return t; });
  }

  function alternarTarefa(id) {
    var t = estado.tarefas[id];
    if (!t) return Promise.resolve();
    t.feita = !t.feita;
    return db.guardarTarefa(t);
  }

  function apagarTarefa(id) {
    delete estado.tarefas[id];
    return db.apagarTarefa(id);
  }

  /* --- horário --- */
  function guardarBloco(b) {
    estado.blocosPorId[b.id] = b;
    var i = estado.blocos.findIndex(function (x) { return x.id === b.id; });
    if (i === -1) estado.blocos.push(b); else estado.blocos[i] = b;
    estado.blocos.sort(function (a, c) { return a.dia - c.dia || a.hora.localeCompare(c.hora); });
    return db.guardarBloco(b);
  }

  /* Apagar um bloco não apaga o histórico: as entradas guardam `nomeSnapshot`,
     por isso os registos antigos continuam legíveis nos gráficos. */
  function apagarBloco(id) {
    delete estado.blocosPorId[id];
    estado.blocos = estado.blocos.filter(function (b) { return b.id !== id; });
    var pendentes = todasEntradas().filter(function (e) {
      return e.blockId === id && e.estado === db.ESTADOS.PENDENTE;
    });
    pendentes.forEach(function (e) { delete estado.entradas[e.id]; });
    return db.apagarBloco(id).then(function () {
      return Promise.all(pendentes.map(function (e) { return db.apagarEntrada(e.id); }));
    });
  }

  function carregarHorarioSugerido() {
    var copia = CAD.schedule.HORARIO_SUGERIDO.map(function (b) {
      return JSON.parse(JSON.stringify(b));
    });
    return db.guardarBlocos(copia)
      .then(function () { return guardarCursos(CAD.schedule.CURSOS_SUGERIDOS, CAD.schedule.CURSOS_ATIVOS_SUGERIDOS); })
      .then(carregar);
  }

  /* --- cursos --- */
  function guardarCursos(cursos, ativos) {
    estado.cursos = cursos;
    if (ativos) estado.cursosAtivos = ativos;
    estado.definicoes.cursos = cursos;
    estado.definicoes.cursosAtivos = estado.cursosAtivos;
    return Promise.all([
      db.guardarDefinicao('cursos', cursos),
      db.guardarDefinicao('cursosAtivos', estado.cursosAtivos)
    ]);
  }

  function curso(id) {
    return estado.cursos.filter(function (c) { return c.id === id; })[0];
  }

  function definirCursoAtivo(faixa, cursoId) {
    estado.cursosAtivos[faixa] = cursoId;
    estado.definicoes.cursosAtivos = estado.cursosAtivos;
    return db.guardarDefinicao('cursosAtivos', estado.cursosAtivos);
  }

  /* --- definições avulsas --- */
  function definicao(chave, omissao) {
    return estado.definicoes[chave] === undefined ? omissao : estado.definicoes[chave];
  }
  function definir(chave, valor) {
    estado.definicoes[chave] = valor;
    return db.guardarDefinicao(chave, valor);
  }

  return {
    estado: estado,
    carregar: carregar, vazia: vazia, bloco: bloco,
    semana: semana, definirVariacao: definirVariacao,
    gerarDia: gerarDia, gerarSemana: gerarSemana,
    entradasDoDia: entradasDoDia, entradasDaSemana: entradasDaSemana,
    todasEntradas: todasEntradas, entrada: entrada,
    marcarFeito: marcarFeito, marcarFalhado: marcarFalhado, limparEstado: limparEstado,
    tarefasDoDia: tarefasDoDia, tarefasDaSemana: tarefasDaSemana,
    criarTarefa: criarTarefa, alternarTarefa: alternarTarefa, apagarTarefa: apagarTarefa,
    guardarBloco: guardarBloco, apagarBloco: apagarBloco,
    carregarHorarioSugerido: carregarHorarioSugerido,
    guardarCursos: guardarCursos, curso: curso, definirCursoAtivo: definirCursoAtivo,
    definicao: definicao, definir: definir
  };
})();
