/* ui-evolucao.js — ecrã Evolução.
 *
 * Mede o que decide o plano, não o que é fácil contar. As semanas marcadas
 * como produção ou recuperação aparecem assinaladas para que um número baixo
 * seja lido como o que é: folga autorizada, não falhanço.
 */
var CAD = CAD || {};
CAD.ui = CAD.ui || {};

CAD.ui.evolucao = (function () {
  'use strict';

  var d = CAD.dates, db = CAD.db, store = CAD.store, sch = CAD.schedule;
  var esc = function (t) { return CAD.ui.sheet.esc(t); };

  var SEMANAS_VISIVEIS = 6;

  function render(contexto) {
    var todas = store.todasEntradas();
    var registadas = todas.filter(function (e) {
      return e.estado === db.ESTADOS.FEITO || e.estado === db.ESTADOS.FALHADO;
    });

    if (!registadas.length) {
      return '<div class="head"><div><div class="sub">Evolução</div><h1>Ainda sem dados</h1></div></div>' +
        '<div class="banner">Regista alguns blocos no ecrã <b>Hoje</b>. ' +
        'Os gráficos aparecem a partir do primeiro registo, e ganham sentido ao fim de duas ou três semanas.</div>';
    }

    var atual = d.weekId(d.hoje());
    var semanas = [];
    for (var i = SEMANAS_VISIVEIS - 1; i >= 0; i--) semanas.push(d.deslocarSemana(atual, -i));

    var totalMin = todas.filter(function (e) { return e.estado === db.ESTADOS.FEITO; })
      .reduce(function (s, e) { return s + (e.minutos || 0); }, 0);

    return '<div class="head">' +
      '<div><div class="sub">' + SEMANAS_VISIVEIS + ' semanas · até ' + esc(d.rotuloSemana(atual)) + '</div>' +
      '<h1>Evolução</h1></div>' +
      '<div class="aside"><b>' + Math.round(totalMin / 60) + 'h</b><br>registadas</div>' +
      '</div>' +

      '<div class="banner">Semanas de <b>produção</b> e <b>recuperação</b> aparecem assinaladas. ' +
      'Um número baixo nessas semanas não é falha — o plano desliza e segue.</div>' +

      graficoFaixaPrincipal(semanas) +
      graficoVolume(semanas) +
      horasPorCurso() +
      contagensDaSemana(atual) +
      motivos(todas);
  }

  /* A faixa com mais blocos planeados é a que manda no plano — normalmente
     as manhãs de estudo. Se o horário for outro, o gráfico acompanha. */
  function faixaPrincipal() {
    var contagem = {};
    store.estado.blocos.forEach(function (b) {
      contagem[b.faixa] = (contagem[b.faixa] || 0) + 1;
    });
    var candidatas = ['python', 'build', 'vex', 'lookdev'].filter(function (f) { return contagem[f]; });
    if (candidatas.length) return candidatas[0];
    var melhor = null;
    Object.keys(contagem).forEach(function (f) {
      if (f === 'cabeca' || f === 'corpo') return;
      if (!melhor || contagem[f] > contagem[melhor]) melhor = f;
    });
    return melhor || Object.keys(contagem)[0];
  }

  function graficoFaixaPrincipal(semanas) {
    var faixa = faixaPrincipal();
    if (!faixa) return '';
    var info = sch.faixa(faixa);

    var dados = semanas.map(function (w) {
      var es = store.entradasDaSemana(w).filter(function (e) { return e.faixa === faixa; });
      return {
        weekId: w,
        feito: es.filter(function (e) { return e.estado === db.ESTADOS.FEITO; }).length,
        alvo: es.filter(function (e) { return e.estado !== db.ESTADOS.NA; }).length,
        variacao: store.semana(w).variacao
      };
    });

    return '<div class="card">' +
      '<h4>' + esc(info.nome) + ' por semana</h4>' +
      '<div class="cap">Blocos cumpridos sobre os que a semana pedia</div>' +
      '<div class="chartwrap">' +
      CAD.charts.barrasSemanais(dados, { cor: info.cor, titulo: info.nome + ' por semana' }) +
      '</div></div>';
  }

  function graficoVolume(semanas) {
    var dados = semanas.map(function (w) {
      var min = store.entradasDaSemana(w)
        .filter(function (e) { return e.estado === db.ESTADOS.FEITO; })
        .reduce(function (s, e) { return s + (e.minutos || 0); }, 0);
      return { weekId: w, valor: Math.round(min / 60 * 10) / 10 };
    });
    var comDados = dados.filter(function (x) { return x.valor > 0; });
    if (comDados.length < 2) return '';

    return '<div class="card">' +
      '<h4>Horas totais por semana</h4>' +
      '<div class="cap">Volume real registado</div>' +
      '<div class="chartwrap">' +
      CAD.charts.linhaSemanal(dados, { cor: 'var(--look)', titulo: 'Horas por semana' }) +
      '</div></div>';
  }

  function horasPorCurso() {
    var cursos = store.estado.cursos || [];
    if (!cursos.length) return '';

    var horas = {};
    store.todasEntradas().forEach(function (e) {
      if (e.estado === db.ESTADOS.FEITO && e.curso) {
        horas[e.curso] = (horas[e.curso] || 0) + (e.minutos || 0);
      }
    });

    var linhas = cursos.slice().sort(function (a, b) {
      return (a.ordem || 0) - (b.ordem || 0);
    }).map(function (c) {
      var h = Math.round((horas[c.id] || 0) / 60 * 10) / 10;
      return CAD.charts.barraProgresso(c.nome, h, c.alvoHoras, sch.cor(c.faixa), 'h');
    }).join('');

    return '<div class="card"><h4>Horas por curso</h4>' +
      '<div class="cap">Acumulado contra o alvo</div>' + linhas + '</div>';
  }

  function contagensDaSemana(weekId) {
    var entradas = store.entradasDaSemana(weekId);
    var porNome = {};
    entradas.forEach(function (e) {
      if (e.estado === db.ESTADOS.NA) return;
      if (!porNome[e.nomeSnapshot]) porNome[e.nomeSnapshot] = { feito: 0, alvo: 0, faixa: e.faixa };
      porNome[e.nomeSnapshot].alvo++;
      if (e.estado === db.ESTADOS.FEITO) porNome[e.nomeSnapshot].feito++;
    });

    // só os que se repetem na semana: contar uma coisa que acontece uma vez não diz nada
    var repetidos = Object.keys(porNome)
      .filter(function (n) { return porNome[n].alvo >= 2; })
      .sort(function (a, b) { return porNome[b].alvo - porNome[a].alvo; })
      .slice(0, 6);

    if (!repetidos.length) return '';

    return '<div class="card"><h4>Esta semana</h4>' +
      '<div class="cap">Contagens simples</div>' +
      '<div class="counts">' +
      repetidos.map(function (n) {
        var x = porNome[n];
        return '<div class="cnt" style="--c:' + sch.cor(x.faixa) + '">' +
          '<div class="n">' + x.feito + '<s>/' + x.alvo + '</s></div>' +
          '<div class="l">' + esc(n) + '</div></div>';
      }).join('') +
      '</div></div>';
  }

  function motivos(todas) {
    var contagem = {};
    todas.forEach(function (e) {
      if (e.estado === db.ESTADOS.FALHADO && e.motivo) {
        var chave = e.motivo.trim().toLowerCase();
        if (!contagem[chave]) contagem[chave] = { texto: e.motivo.trim(), n: 0 };
        contagem[chave].n++;
      }
    });
    var lista = Object.keys(contagem).map(function (k) { return contagem[k]; })
      .sort(function (a, b) { return b.n - a.n; }).slice(0, 6);

    return '<div class="card"><h4>Porque falhou</h4>' +
      '<div class="cap">Se um motivo se repete, o problema não é disciplina</div>' +
      (lista.length
        ? lista.map(function (m) {
          return '<div class="reason"><span>' + esc(m.texto) + '</span><b>' + m.n + '×</b></div>';
        }).join('')
        : '<p class="empty">Nenhum motivo registado.</p>') +
      '</div>';
  }

  function tratarClique() { return false; }

  return { render: render, tratarClique: tratarClique };
})();
