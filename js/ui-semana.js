/* ui-semana.js — ecrã Semana.
 *
 * Grelha proporcional: a altura de cada bloco é a sua duração real, e as
 * colunas são os sete dias. É a mesma leitura do horário em papel — vê-se
 * de relance onde estão os buracos e onde o dia está carregado.
 *
 * A escala ajusta-se ao horário: começa uma hora antes do bloco mais cedo e
 * acaba uma hora depois do mais tarde, para não desperdiçar ecrã com a noite.
 */
var CAD = CAD || {};
CAD.ui = CAD.ui || {};

CAD.ui.semana = (function () {
  'use strict';

  var d = CAD.dates, db = CAD.db, store = CAD.store, sch = CAD.schedule;
  var esc = function (t) { return CAD.ui.sheet.esc(t); };

  var MIN_POR_LINHA = 15;   // cada linha da grelha = 15 minutos
  var ALTURA_LINHA = 5;     // px por linha -> 20px por hora

  function render(contexto) {
    if (!store.estado.blocos.length) {
      return '<div class="head"><div><div class="sub">Cadência</div><h1>Sem horário</h1></div></div>' +
        '<div class="banner"><b>A app está vazia.</b> Carrega ou cria o horário em Definições.</div>';
    }

    var weekId = contexto.semana;
    var semana = store.semana(weekId);
    var dias = d.diasDaSemana(weekId);
    var entradas = store.entradasDaSemana(weekId);
    var reais = entradas.filter(function (e) { return e.estado !== db.ESTADOS.NA; });
    var feitas = reais.filter(function (e) { return e.estado === db.ESTADOS.FEITO; });
    var minutos = feitas.reduce(function (s, e) { return s + (e.minutos || 0); }, 0);
    var hoje = d.hoje();
    var semanaAtual = d.weekId(hoje);

    return '<div class="head">' +
      '<div>' +
      '<div class="sub">' + esc(d.rotuloSemanaCurto(weekId)) + ' · ' + esc(sch.VARIACOES[semana.variacao].nome) + '</div>' +
      '<h1>' + esc(d.rotuloSemana(weekId)) + '</h1>' +
      '</div>' +
      '<div class="aside"><b>' + feitas.length + '/' + reais.length + '</b><br>' +
      d.duracao(minutos) + ' reais</div>' +
      '</div>' +

      '<div class="daynav">' +
      '<button type="button" data-sem="-1" aria-label="Semana anterior">←</button>' +
      '<button type="button" data-sem="0"' + (weekId === semanaAtual ? ' aria-pressed="true"' : '') + '>esta semana</button>' +
      '<button type="button" data-sem="1" aria-label="Semana seguinte"' +
      (weekId >= semanaAtual ? ' disabled' : '') + '>→</button>' +
      '</div>' +

      '<div class="chips">' +
      sch.TODAS_VARIACOES.map(function (v) {
        return '<button type="button" class="chip" data-var-sem="' + v + '" aria-pressed="' +
          (v === semana.variacao) + '">' + esc(sch.VARIACOES[v].nome) + '</button>';
      }).join('') +
      '</div>' +
      '<p class="chip-note">' + esc(sch.VARIACOES[semana.variacao].nota) + '</p>' +

      grelha(weekId, dias, entradas, hoje) +
      legenda(entradas) +
      resumoFaixas(weekId, entradas) +
      entregas(entradas);
  }

  /* --- a grelha proporcional --- */
  function grelha(weekId, dias, entradas, hoje) {
    var visiveis = entradas.filter(function (e) { return e.estado !== db.ESTADOS.NA; });
    var todos = visiveis.length ? visiveis : entradas;
    if (!todos.length) return '<p class="empty">Nenhum bloco nesta semana.</p>';

    var inicios = todos.map(function (e) { return d.minutosDeHora(e.hora); });
    var fins = todos.map(function (e) {
      var b = store.bloco(e.blockId);
      return d.minutosDeHora(e.hora) + (b ? b.minutos : 60);
    });

    // arredonda para a hora certa, com uma hora de folga de cada lado
    var inicio = Math.max(0, Math.floor((Math.min.apply(null, inicios) - 60) / 60) * 60);
    var fim = Math.min(1440, Math.ceil((Math.max.apply(null, fins) + 60) / 60) * 60);
    var linhas = Math.ceil((fim - inicio) / MIN_POR_LINHA);

    var marcas = '';
    for (var m = inicio; m <= fim; m += 60) {
      var linha = Math.round((m - inicio) / MIN_POR_LINHA) + 1;
      marcas += '<div class="tick" style="grid-row:' + linha + '">' + d.horaDeMinutos(m) + '</div>';
    }

    var colunas = dias.map(function (data, i) {
      var doDia = entradas.filter(function (e) { return e.data === data; });
      var blocos = doDia.map(function (e) {
        var b = store.bloco(e.blockId);
        var dur = b ? b.minutos : 60;
        var ini = d.minutosDeHora(e.hora);
        var linhaIni = Math.round((ini - inicio) / MIN_POR_LINHA) + 1;
        var linhaFim = Math.max(linhaIni + 1, Math.round((ini + dur - inicio) / MIN_POR_LINHA) + 1);
        var faixa = sch.faixa(e.faixa);
        var classe = e.estado === db.ESTADOS.FEITO ? 'g-done'
          : e.estado === db.ESTADOS.FALHADO ? 'g-fail'
            : e.estado === db.ESTADOS.NA ? 'g-na' : 'g-pend';
        var curto = dur <= 30 ? ' curto' : '';

        return '<div class="gb ' + classe + curto + '" style="--c:' + faixa.cor +
          ';grid-row:' + linhaIni + '/' + linhaFim + '" data-entrada="' + e.id +
          '" title="' + esc(e.nomeSnapshot) + ' · ' + esc(e.hora) + ' · ' + d.duracao(dur) + '">' +
          '<span class="gn">' + esc(e.nomeSnapshot) + '</span>' +
          (dur > 45 ? '<span class="gt">' + esc(e.hora) + '</span>' : '') +
          '</div>';
      }).join('');

      var rot = d.rotuloDiaCurto(data);
      return '<div class="gcol' + (data === hoje ? ' hoje' : '') + '" ' +
        'style="grid-template-rows:repeat(' + linhas + ',' + ALTURA_LINHA + 'px)">' +
        blocos + '</div>';
    }).join('');

    var cabecalhos = dias.map(function (data) {
      var rot = d.rotuloDiaCurto(data);
      var doDia = store.entradasDoDia(data).filter(function (e) { return e.estado !== db.ESTADOS.NA; });
      var ok = doDia.filter(function (e) { return e.estado === db.ESTADOS.FEITO; }).length;
      return '<div class="ghead' + (data === hoje ? ' hoje' : '') + '">' +
        '<span class="gd">' + rot.nome + '</span>' +
        '<b>' + rot.num + '</b>' +
        (doDia.length ? '<span class="gc">' + ok + '/' + doDia.length + '</span>' : '<span class="gc">—</span>') +
        '</div>';
    }).join('');

    return '<div class="gridwrap"><div class="gridcal">' +
      '<div class="ghead"></div>' + cabecalhos +
      '<div class="gutter" style="grid-template-rows:repeat(' + linhas + ',' + ALTURA_LINHA + 'px)">' +
      marcas + '</div>' +
      colunas +
      '</div></div>';
  }

  function legenda(entradas) {
    var presentes = {};
    entradas.forEach(function (e) { if (e.estado !== db.ESTADOS.NA) presentes[e.faixa] = true; });
    var chaves = sch.ORDEM_FAIXAS.filter(function (f) { return presentes[f]; });
    if (!chaves.length) return '';
    return '<div class="legend">' + chaves.map(function (f) {
      return '<span class="key"><i style="background:' + sch.FAIXAS[f].cor + '"></i>' +
        esc(sch.FAIXAS[f].nome) + '</span>';
    }).join('') +
      '<span class="key"><i class="ghost-key"></i>por registar</span>' +
      '<span class="key"><i class="fail-key"></i>não cumprido</span>' +
      '</div>';
  }

  function resumoFaixas(weekId, entradas) {
    var linhas = sch.ORDEM_FAIXAS.map(function (f) {
      var fe = entradas.filter(function (e) { return e.faixa === f && e.estado !== db.ESTADOS.NA; });
      if (!fe.length) return '';
      var ok = fe.filter(function (e) { return e.estado === db.ESTADOS.FEITO; }).length;
      return CAD.charts.barraProgresso(sch.FAIXAS[f].nome, ok, fe.length, sch.FAIXAS[f].cor, '');
    }).join('');
    if (!linhas) return '';
    return '<div class="card"><div class="cap">Faixas desta semana</div>' + linhas + '</div>';
  }

  function entregas(entradas) {
    var com = entradas.filter(function (e) { return e.resultado; });
    return '<div class="card"><div class="cap">Entregue</div>' +
      (com.length
        ? com.map(function (e) {
          return '<div class="reason"><span>' + esc(e.resultado) + '</span><b>' +
            d.rotuloDiaCurto(e.data).nome + '</b></div>';
        }).join('')
        : '<p class="empty">Nada registado nesta semana.</p>') +
      '</div>';
  }

  function tratarClique(ev, contexto, redesenhar) {
    var nav = ev.target.closest('[data-sem]');
    if (nav) {
      var passo = Number(nav.dataset.sem);
      var atual = d.weekId(d.hoje());
      contexto.semana = passo === 0 ? atual : d.deslocarSemana(contexto.semana, passo);
      if (d.semanasEntre(atual, contexto.semana) > 0) contexto.semana = atual;
      store.gerarSemana(contexto.semana).then(redesenhar);
      return true;
    }

    var chip = ev.target.closest('[data-var-sem]');
    if (chip) {
      store.definirVariacao(contexto.semana, chip.dataset.varSem).then(function () {
        redesenhar();
        CAD.ui.sheet.aviso('Semana marcada como ' + sch.VARIACOES[chip.dataset.varSem].nome.toLowerCase());
      });
      return true;
    }

    var bloco = ev.target.closest('[data-entrada]');
    if (bloco) {
      var e = store.entrada(bloco.dataset.entrada);
      if (!e || e.estado === db.ESTADOS.NA) return true;
      if (e.estado === db.ESTADOS.FEITO) { store.limparEstado(e.id).then(redesenhar); return true; }
      if (e.estado === db.ESTADOS.FALHADO) { store.limparEstado(e.id).then(redesenhar); return true; }
      var b = store.bloco(e.blockId);
      if (b && b.pedeResultado) CAD.ui.sheet.registar(e.id, 'feito', redesenhar);
      else store.marcarFeito(e.id).then(function () { redesenhar(); CAD.ui.sheet.aviso('Feito'); });
      return true;
    }

    return false;
  }

  return { render: render, tratarClique: tratarClique };
})();
