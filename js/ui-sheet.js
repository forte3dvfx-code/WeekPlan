/* ui-sheet.js — folha de detalhe, avisos e diálogos.
 *
 * Uma folha que sobe de baixo em vez de um ecrã novo: mantém o contexto e
 * fecha-se com um toque fora, que é o gesto esperado no telemóvel.
 */
var CAD = CAD || {};

CAD.ui = CAD.ui || {};

CAD.ui.sheet = (function () {
  'use strict';

  var d = CAD.dates, db = CAD.db, store = CAD.store;
  var estadoFolha = null;
  var aoFechar = null;

  function esc(t) {
    return String(t === null || t === undefined ? '' : t)
      .replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
  }

  function el(id) { return document.getElementById(id); }

  function abrir(html, opcoes) {
    opcoes = opcoes || {};
    el('sheet').innerHTML = '<div class="grab"></div>' + html;
    el('sheet').classList.add('on');
    el('scrim').classList.add('on');
    aoFechar = opcoes.aoFechar || null;
    if (opcoes.foco) {
      setTimeout(function () {
        var campo = el(opcoes.foco);
        if (campo) campo.focus();
      }, 260);
    }
  }

  function fechar() {
    el('sheet').classList.remove('on');
    el('scrim').classList.remove('on');
    estadoFolha = null;
    var cb = aoFechar;
    aoFechar = null;
    if (cb) cb();
  }

  var temporizadorAviso;
  function aviso(texto) {
    var t = el('toast');
    t.textContent = texto;
    t.classList.add('on');
    clearTimeout(temporizadorAviso);
    temporizadorAviso = setTimeout(function () { t.classList.remove('on'); }, 2200);
  }

  /* --- registar um bloco --- */
  function registar(entradaId, modo, aoGuardar) {
    var e = store.entrada(entradaId);
    if (!e) return;
    var b = store.bloco(e.blockId);
    var planeado = b ? b.minutos : 60;
    var falhou = modo === 'falhado';

    estadoFolha = { tipo: 'registo', id: entradaId, modo: modo, minutos: e.minutos || planeado, aoGuardar: aoGuardar };

    var opcoes = [
      Math.max(5, Math.round(planeado * 0.3 / 5) * 5),
      Math.max(10, Math.round(planeado * 0.6 / 5) * 5),
      planeado
    ].filter(function (v, i, a) { return a.indexOf(v) === i; });

    abrir(
      '<div class="cap">' + (falhou ? 'Não cumprido' : 'Cumprido') + ' · ' + esc(e.hora) + '</div>' +
      '<h4>' + esc(e.nomeSnapshot) + '</h4>' +
      '<p class="hint">' + (falhou
        ? 'O que atrapalhou? Uma linha chega — e é opcional.'
        : 'O que ficou feito? Isto alimenta a lista de entregas.') + '</p>' +
      '<textarea id="txtFolha" placeholder="' + (falhou
        ? 'Reunião em cima, deadline de vídeo…'
        : 'Script de renomear caches…') + '">' +
      esc(falhou ? e.motivo : e.resultado) + '</textarea>' +
      (falhou ? '' :
        '<div class="mins" id="mins">' +
        opcoes.map(function (m) {
          return '<button type="button" data-min="' + m + '" aria-pressed="' +
            (m === estadoFolha.minutos) + '">' + d.duracao(m) + '</button>';
        }).join('') +
        '</div><p class="hint" style="margin:6px 0 0;font-size:11.5px">' +
        'Quanto tempo mesmo. Planeado: ' + d.duracao(planeado) + '.</p>') +
      '<div class="acts">' +
      '<button type="button" class="ghost" data-folha="cancelar">Cancelar</button>' +
      '<button type="button" class="solid" data-folha="guardar">Guardar</button>' +
      '</div>',
      { foco: 'txtFolha' }
    );
  }

  /* --- editar ou criar um bloco do horário --- */
  function editarBloco(bloco, aoGuardar, aoApagar) {
    var sch = CAD.schedule;
    var novo = !store.bloco(bloco.id);
    estadoFolha = { tipo: 'bloco', bloco: bloco, aoGuardar: aoGuardar, aoApagar: aoApagar };

    abrir(
      '<div class="cap">' + (novo ? 'Novo bloco' : 'Editar bloco') + '</div>' +
      '<h4>' + (novo ? 'Acrescentar ao horário' : esc(bloco.nome || 'Sem nome')) + '</h4>' +

      '<label class="fl">Nome</label>' +
      '<input id="bNome" type="text" value="' + esc(bloco.nome) + '" placeholder="Python, CrossFit, Piano…">' +

      '<div class="grid2">' +
      '<div><label class="fl">Dia</label><select id="bDia">' +
      d.DIAS.map(function (n, i) {
        return '<option value="' + i + '"' + (i === bloco.dia ? ' selected' : '') + '>' + n + '</option>';
      }).join('') + '</select></div>' +
      '<div><label class="fl">Faixa</label><select id="bFaixa">' +
      sch.ORDEM_FAIXAS.map(function (f) {
        return '<option value="' + f + '"' + (f === bloco.faixa ? ' selected' : '') + '>' +
          esc(sch.FAIXAS[f].nome) + '</option>';
      }).join('') + '</select></div>' +
      '</div>' +

      '<div class="grid2">' +
      '<div><label class="fl">Hora</label><input id="bHora" type="time" value="' + esc(bloco.hora) + '"></div>' +
      '<div><label class="fl">Minutos</label><input id="bMin" type="number" min="5" max="600" step="5" value="' + bloco.minutos + '"></div>' +
      '</div>' +

      '<label class="fl">Existe nestas semanas</label>' +
      '<div class="mins" id="bVars">' +
      sch.TODAS_VARIACOES.map(function (v) {
        return '<button type="button" data-var-toggle="' + v + '" aria-pressed="' +
          ((bloco.variacoes || []).indexOf(v) !== -1) + '">' + esc(sch.VARIACOES[v].nome) + '</button>';
      }).join('') + '</div>' +

      '<label class="fl">Nota</label>' +
      '<input id="bNota" type="text" value="' + esc(bloco.nota || '') + '" placeholder="Contexto curto, opcional">' +

      '<div class="switches">' +
      '<button type="button" class="sw" data-flag="pedeResultado" aria-pressed="' + !!bloco.pedeResultado + '">' +
      '<span>Pede resultado</span><small>Abre esta folha ao marcar como feito</small></button>' +
      '<button type="button" class="sw" data-flag="curso" aria-pressed="' + !!bloco.curso + '">' +
      '<span>Conta horas de curso</span><small>Soma ao curso activo da faixa</small></button>' +
      '</div>' +

      '<div class="acts">' +
      (novo ? '' : '<button type="button" class="ghost danger" data-folha="apagar">Apagar</button>') +
      '<button type="button" class="ghost" data-folha="cancelar">Cancelar</button>' +
      '<button type="button" class="solid" data-folha="guardarBloco">Guardar</button>' +
      '</div>',
      { foco: novo ? 'bNome' : null }
    );
  }

  /* --- tarefa avulsa --- */
  function novaTarefa(data, aoGuardar) {
    estadoFolha = { tipo: 'tarefa', data: data, aoGuardar: aoGuardar };
    abrir(
      '<div class="cap">' + esc(d.rotuloDia(data)) + '</div>' +
      '<h4>Nova tarefa</h4>' +
      '<p class="hint">Coisas avulsas que não são blocos do horário.</p>' +
      '<textarea id="txtFolha" placeholder="Preparar reunião de pipeline…"></textarea>' +
      '<div class="acts">' +
      '<button type="button" class="ghost" data-folha="cancelar">Cancelar</button>' +
      '<button type="button" class="solid" data-folha="guardarTarefa">Guardar</button>' +
      '</div>',
      { foco: 'txtFolha' }
    );
  }

  /* --- confirmação --- */
  function confirmar(titulo, texto, rotuloAcao, aoConfirmar, perigo) {
    estadoFolha = { tipo: 'confirmar', aoConfirmar: aoConfirmar };
    abrir(
      '<div class="cap">Confirmar</div>' +
      '<h4>' + esc(titulo) + '</h4>' +
      '<p class="hint">' + esc(texto) + '</p>' +
      '<div class="acts">' +
      '<button type="button" class="ghost" data-folha="cancelar">Cancelar</button>' +
      '<button type="button" class="solid' + (perigo ? ' perigo' : '') + '" data-folha="confirmar">' +
      esc(rotuloAcao) + '</button>' +
      '</div>'
    );
  }

  /* --- eventos internos da folha --- */
  document.addEventListener('click', function (ev) {
    if (!estadoFolha) {
      if (ev.target.id === 'scrim') fechar();
      return;
    }

    var minBtn = ev.target.closest('[data-min]');
    if (minBtn) {
      estadoFolha.minutos = Number(minBtn.dataset.min);
      document.querySelectorAll('[data-min]').forEach(function (b) {
        b.setAttribute('aria-pressed', String(Number(b.dataset.min) === estadoFolha.minutos));
      });
      return;
    }

    var varBtn = ev.target.closest('[data-var-toggle]');
    if (varBtn && estadoFolha.tipo === 'bloco') {
      var v = varBtn.dataset.varToggle;
      var lista = estadoFolha.bloco.variacoes || [];
      var i = lista.indexOf(v);
      if (i === -1) lista.push(v); else lista.splice(i, 1);
      estadoFolha.bloco.variacoes = lista;
      varBtn.setAttribute('aria-pressed', String(lista.indexOf(v) !== -1));
      return;
    }

    var flagBtn = ev.target.closest('[data-flag]');
    if (flagBtn && estadoFolha.tipo === 'bloco') {
      var chave = flagBtn.dataset.flag;
      estadoFolha.bloco[chave] = !estadoFolha.bloco[chave];
      flagBtn.setAttribute('aria-pressed', String(!!estadoFolha.bloco[chave]));
      return;
    }

    var acao = ev.target.closest('[data-folha]');
    if (!acao) {
      if (ev.target.id === 'scrim') fechar();
      return;
    }

    var qual = acao.dataset.folha;

    if (qual === 'cancelar') { fechar(); return; }

    if (qual === 'guardar' && estadoFolha.tipo === 'registo') {
      var texto = (el('txtFolha').value || '').trim();
      var id = estadoFolha.id, modo = estadoFolha.modo, cb = estadoFolha.aoGuardar;
      var p = modo === 'falhado'
        ? store.marcarFalhado(id, texto)
        : store.marcarFeito(id, estadoFolha.minutos, texto);
      p.then(function () {
        fechar();
        if (cb) cb();
        aviso(modo === 'falhado' ? 'Registado' : 'Feito');
      });
      return;
    }

    if (qual === 'guardarBloco' && estadoFolha.tipo === 'bloco') {
      var b = estadoFolha.bloco;
      b.nome = (el('bNome').value || '').trim();
      if (!b.nome) { aviso('Falta o nome do bloco.'); el('bNome').focus(); return; }
      b.dia = Number(el('bDia').value);
      b.faixa = el('bFaixa').value;
      b.hora = el('bHora').value || '09:00';
      b.minutos = Math.max(5, Number(el('bMin').value) || 60);
      b.nota = (el('bNota').value || '').trim();
      if (!b.variacoes.length) b.variacoes = CAD.schedule.TODAS_VARIACOES.slice();
      var cbB = estadoFolha.aoGuardar;
      store.guardarBloco(b).then(function () {
        fechar();
        if (cbB) cbB();
        aviso('Bloco guardado');
      });
      return;
    }

    if (qual === 'apagar' && estadoFolha.tipo === 'bloco') {
      var alvo = estadoFolha.bloco, cbA = estadoFolha.aoApagar;
      confirmar(
        'Apagar "' + alvo.nome + '"?',
        'O histórico já registado mantém-se nos gráficos. Só desaparece do horário daqui para a frente.',
        'Apagar',
        function () {
          store.apagarBloco(alvo.id).then(function () {
            fechar();
            if (cbA) cbA();
            aviso('Bloco apagado');
          });
        },
        true
      );
      return;
    }

    if (qual === 'guardarTarefa' && estadoFolha.tipo === 'tarefa') {
      var t = (el('txtFolha').value || '').trim();
      if (!t) { fechar(); return; }
      var cbT = estadoFolha.aoGuardar, dataT = estadoFolha.data;
      store.criarTarefa(t, dataT).then(function () {
        fechar();
        if (cbT) cbT();
        aviso('Tarefa criada');
      });
      return;
    }

    if (qual === 'confirmar' && estadoFolha.tipo === 'confirmar') {
      var fn = estadoFolha.aoConfirmar;
      fechar();
      if (fn) fn();
      return;
    }
  });

  document.addEventListener('keydown', function (ev) {
    if (ev.key === 'Escape' && estadoFolha) fechar();
  });

  return {
    abrir: abrir, fechar: fechar, aviso: aviso, esc: esc,
    registar: registar, editarBloco: editarBloco,
    novaTarefa: novaTarefa, confirmar: confirmar
  };
})();
