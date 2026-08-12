/* ui-hoje.js — ecrã Hoje.
 *
 * A acção principal custa um toque. Escrever é sempre opcional, excepto nos
 * blocos marcados como "pede resultado".
 */
var CAD = CAD || {};
CAD.ui = CAD.ui || {};

CAD.ui.hoje = (function () {
  'use strict';

  var d = CAD.dates, db = CAD.db, store = CAD.store, sch = CAD.schedule;
  var esc = function (t) { return CAD.ui.sheet.esc(t); };

  function render(contexto) {
    var data = contexto.data;
    var weekId = d.weekId(data);
    var semana = store.semana(weekId);
    var lista = store.entradasDoDia(data);
    var tarefas = store.tarefasDoDia(data);
    var reais = lista.filter(function (e) { return e.estado !== db.ESTADOS.NA; });
    var feitos = reais.filter(function (e) { return e.estado === db.ESTADOS.FEITO; });

    if (!store.estado.blocos.length) return vazio();

    var html =
      '<div class="head">' +
      '<div>' +
      '<div class="sub">' + esc(d.rotuloSemanaCurto(weekId)) + ' · ' + esc(d.rotuloSemana(weekId)) + '</div>' +
      '<h1>' + esc(d.rotuloDia(data)) + '</h1>' +
      '</div>' +
      '<div class="aside"><b>' + feitos.length + '/' + reais.length + '</b><br>blocos</div>' +
      '</div>' +

      '<div class="daynav">' +
      '<button type="button" data-dia="-1" aria-label="Dia anterior">←</button>' +
      '<button type="button" data-dia="0"' + (data === d.hoje() ? ' aria-pressed="true"' : '') + '>hoje</button>' +
      '<button type="button" data-dia="1" aria-label="Dia seguinte"' +
      (data >= d.hoje() ? ' disabled' : '') + '>→</button>' +
      '</div>' +

      '<div class="chips">' +
      sch.TODAS_VARIACOES.map(function (v) {
        return '<button type="button" class="chip" data-var="' + v + '" aria-pressed="' +
          (v === semana.variacao) + '">' + esc(sch.VARIACOES[v].nome) + '</button>';
      }).join('') +
      '</div>' +
      '<p class="chip-note">' + esc(sch.VARIACOES[semana.variacao].nota) + '</p>';

    if (!reais.length) {
      html += '<p class="empty">Nenhum bloco neste dia — nesta variação da semana.</p>';
    } else {
      html += '<div class="rows">' + lista.map(linha).join('') + '</div>';
    }

    html +=
      '<div class="secthead">' +
      '<h3>Tarefas</h3>' +
      '<button type="button" class="add" data-nova-tarefa="' + data + '">+ Nova</button>' +
      '</div>';

    html += tarefas.length
      ? '<div class="rows">' + tarefas.map(linhaTarefa).join('') + '</div>'
      : '<p class="empty">Sem tarefas avulsas.</p>';

    return html;
  }

  function vazio() {
    return '<div class="head"><div><div class="sub">Cadência</div><h1>Sem horário</h1></div></div>' +
      '<div class="banner"><b>A app está vazia.</b> Vai a Definições para criar os teus blocos, ' +
      'importar um backup, ou carregar o horário sugerido de uma só vez.</div>' +
      '<div class="acts" style="margin-top:16px">' +
      '<button type="button" class="solid" data-ir="definicoes">Abrir Definições</button>' +
      '</div>';
  }

  function linha(e) {
    var b = store.bloco(e.blockId);
    var faixa = sch.faixa(e.faixa);
    var planeado = b ? b.minutos : e.minutos;
    var classe = e.estado === db.ESTADOS.FEITO ? 'done'
      : e.estado === db.ESTADOS.FALHADO ? 'fail'
        : e.estado === db.ESTADOS.NA ? 'na' : '';

    var sub;
    if (e.estado === db.ESTADOS.FEITO) {
      sub = e.hora + ' · ' + d.duracao(e.minutos) +
        (e.minutos < planeado ? ' <span class="warn">de ' + d.duracao(planeado) + '</span>' : '') +
        (e.resultado ? ' · ' + esc(e.resultado) : '');
    } else if (e.estado === db.ESTADOS.FALHADO) {
      sub = e.hora + ' · ' + (e.motivo ? esc(e.motivo) : 'sem motivo');
    } else if (e.estado === db.ESTADOS.NA) {
      sub = e.hora + ' · desligado nesta semana';
    } else {
      sub = e.hora + ' · ' + d.duracao(planeado) + (b && b.nota ? ' · ' + esc(b.nota) : '');
    }

    return '<div class="row ' + classe + '" style="--c:' + faixa.cor + '" data-entrada="' + e.id + '">' +
      '<div class="tickbox"><svg viewBox="0 0 24 24" fill="none" stroke-width="3.4" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>' +
      '<div class="meta"><div class="nm">' + esc(e.nomeSnapshot) + '</div>' +
      '<div class="tm">' + sub + '</div></div>' +
      '<div class="tag">' + esc(faixa.nome) + '</div>' +
      (e.estado !== db.ESTADOS.NA
        ? '<button type="button" class="xbtn" data-falhar="' + e.id + '" aria-label="Marcar como não cumprido">×</button>'
        : '') +
      '</div>';
  }

  function linhaTarefa(t) {
    return '<div class="row ' + (t.feita ? 'done' : '') + '" style="--c:var(--dim)" data-tarefa="' + t.id + '">' +
      '<div class="tickbox"><svg viewBox="0 0 24 24" fill="none" stroke-width="3.4" ' +
      'stroke-linecap="round" stroke-linejoin="round"><path d="M20 6L9 17l-5-5"/></svg></div>' +
      '<div class="meta"><div class="nm">' + esc(t.texto) + '</div></div>' +
      '<button type="button" class="xbtn" data-apagar-tarefa="' + t.id + '" aria-label="Apagar tarefa">×</button>' +
      '</div>';
  }

  /* Cliques específicos deste ecrã. Devolve true se tratou o evento. */
  function tratarClique(ev, contexto, redesenhar) {
    var navDia = ev.target.closest('[data-dia]');
    if (navDia) {
      var passo = Number(navDia.dataset.dia);
      contexto.data = passo === 0 ? d.hoje() : d.addDays(contexto.data, passo);
      if (contexto.data > d.hoje()) contexto.data = d.hoje();
      store.gerarDia(contexto.data).then(redesenhar);
      return true;
    }

    var chip = ev.target.closest('[data-var]');
    if (chip) {
      store.definirVariacao(d.weekId(contexto.data), chip.dataset.var).then(function () {
        redesenhar();
        CAD.ui.sheet.aviso('Semana marcada como ' + sch.VARIACOES[chip.dataset.var].nome.toLowerCase());
      });
      return true;
    }

    var falhar = ev.target.closest('[data-falhar]');
    if (falhar) {
      var eF = store.entrada(falhar.dataset.falhar);
      if (eF.estado === db.ESTADOS.FALHADO) store.limparEstado(eF.id).then(redesenhar);
      else CAD.ui.sheet.registar(eF.id, 'falhado', redesenhar);
      return true;
    }

    var apagarT = ev.target.closest('[data-apagar-tarefa]');
    if (apagarT) {
      store.apagarTarefa(apagarT.dataset.apagarTarefa).then(redesenhar);
      return true;
    }

    var tarefa = ev.target.closest('[data-tarefa]');
    if (tarefa) {
      store.alternarTarefa(tarefa.dataset.tarefa).then(redesenhar);
      return true;
    }

    var nova = ev.target.closest('[data-nova-tarefa]');
    if (nova) {
      CAD.ui.sheet.novaTarefa(nova.dataset.novaTarefa, redesenhar);
      return true;
    }

    var linhaEl = ev.target.closest('[data-entrada]');
    if (linhaEl) {
      var e = store.entrada(linhaEl.dataset.entrada);
      if (!e || e.estado === db.ESTADOS.NA) return true;
      if (e.estado === db.ESTADOS.FEITO) { store.limparEstado(e.id).then(redesenhar); return true; }
      var b = store.bloco(e.blockId);
      if (b && b.pedeResultado) CAD.ui.sheet.registar(e.id, 'feito', redesenhar);
      else store.marcarFeito(e.id).then(function () { redesenhar(); CAD.ui.sheet.aviso('Feito'); });
      return true;
    }

    return false;
  }

  return { render: render, tratarClique: tratarClique };
})();
