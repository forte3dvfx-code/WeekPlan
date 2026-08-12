/* app.js — arranque, navegação e lembrete de backup. */
var CAD = CAD || {};

CAD.app = (function () {
  'use strict';

  var d = CAD.dates, store = CAD.store;

  var contexto = {
    ecra: 'hoje',
    data: null,      // dia visível no ecrã Hoje
    semana: null     // semana visível no ecrã Semana
  };

  var ECRAS = {
    hoje: function () { return CAD.ui.hoje; },
    semana: function () { return CAD.ui.semana; },
    evolucao: function () { return CAD.ui.evolucao; },
    definicoes: function () { return CAD.ui.definicoes; }
  };

  function redesenhar() {
    var modulo = ECRAS[contexto.ecra]();
    document.getElementById('view').innerHTML = modulo.render(contexto);
    document.querySelectorAll('nav button[data-nav]').forEach(function (b) {
      b.setAttribute('aria-current', String(b.dataset.nav === contexto.ecra));
    });
    document.getElementById('view').scrollTop = 0;
  }

  function irPara(ecra) {
    contexto.ecra = ecra;
    if (ecra === 'hoje') contexto.data = d.hoje();
    if (ecra === 'semana') contexto.semana = d.weekId(d.hoje());
    var preparar = ecra === 'semana'
      ? store.gerarSemana(contexto.semana)
      : ecra === 'hoje' ? store.gerarDia(contexto.data) : Promise.resolve();
    preparar.then(redesenhar);
  }

  /* Lembrete de backup: mesmo padrão das outras apps — intervalo configurável,
     adiar até amanhã ou desligar de vez. Só localStorage para o "adiar",
     porque é preferência efémera e não vale uma escrita em IndexedDB. */
  function verificarBackup() {
    var intervalo = Number(store.definicao('intervaloBackup', 7));
    if (!intervalo) return;

    var adiado = null;
    try { adiado = localStorage.getItem('cadencia-backup-adiado'); } catch (e) { }
    if (adiado === d.hoje()) return;

    var ultimo = store.definicao('ultimoBackup', null);
    var temRegistos = store.todasEntradas().some(function (e) {
      return e.estado === CAD.db.ESTADOS.FEITO || e.estado === CAD.db.ESTADOS.FALHADO;
    });
    if (!temRegistos) return;

    var passou = !ultimo || d.semanasEntre(d.weekId(ultimo), d.weekId(d.hoje())) * 7 >= intervalo
      || (ultimo && diasEntre(ultimo, d.hoje()) >= intervalo);
    if (!passou) return;

    var texto = ultimo
      ? 'O último backup foi a ' + d.rotuloDia(ultimo) + '. Os dados vivem só neste telemóvel.'
      : 'Ainda não fizeste backup. Os dados vivem só neste telemóvel.';

    CAD.ui.sheet.abrir(
      '<div class="cap">Backup</div>' +
      '<h4>Exportar os dados?</h4>' +
      '<p class="hint">' + texto + '</p>' +
      '<div class="acts">' +
      '<button type="button" class="ghost" data-backup="adiar">Amanhã</button>' +
      '<button type="button" class="solid" data-backup="agora">Exportar</button>' +
      '</div>' +
      '<button type="button" class="linkbtn" data-backup="nunca">Não voltar a avisar</button>'
    );
  }

  function diasEntre(a, b) {
    return Math.round((d.fromISO(b) - d.fromISO(a)) / 86400000);
  }

  /* Eventos globais. Cada ecrã trata primeiro os seus; o que sobra chega aqui. */
  document.addEventListener('click', function (ev) {
    var nav = ev.target.closest('nav button[data-nav]');
    if (nav) { irPara(nav.dataset.nav); return; }

    var atalho = ev.target.closest('[data-ir]');
    if (atalho) { irPara(atalho.dataset.ir); return; }

    var backup = ev.target.closest('[data-backup]');
    if (backup) {
      var qual = backup.dataset.backup;
      if (qual === 'adiar') {
        try { localStorage.setItem('cadencia-backup-adiado', d.hoje()); } catch (e) { }
        CAD.ui.sheet.fechar();
      } else if (qual === 'nunca') {
        store.definir('intervaloBackup', 0).then(function () { CAD.ui.sheet.fechar(); });
      } else {
        CAD.exportar.jsonCompleto().then(function () {
          return store.definir('ultimoBackup', d.hoje());
        }).then(function () {
          CAD.ui.sheet.fechar();
          CAD.ui.sheet.aviso('Backup exportado');
        });
      }
      return;
    }

    var modulo = ECRAS[contexto.ecra]();
    if (modulo.tratarClique) modulo.tratarClique(ev, contexto, redesenhar);
  });

  function arrancar() {
    contexto.data = d.hoje();
    contexto.semana = d.weekId(d.hoje());

    return store.carregar()
      .then(function () {
        if (!store.estado.blocos.length) return null;
        return store.gerarSemana(contexto.semana);
      })
      .then(function () {
        redesenhar();
        setTimeout(verificarBackup, 900);
      })
      .catch(function (erro) {
        document.getElementById('view').innerHTML =
          '<div class="head"><div><h1>Erro ao arrancar</h1></div></div>' +
          '<div class="banner">' + CAD.ui.sheet.esc(erro.message) + '</div>';
      });
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', arrancar);
  } else {
    arrancar();
  }

  /* Service worker: só quando servido por http/https.
     Em file:// o registo falha, e é normal. */
  if ('serviceWorker' in navigator && location.protocol.indexOf('http') === 0) {
    window.addEventListener('load', function () {
      navigator.serviceWorker.register('sw.js').catch(function () { });
    });
  }

  return { contexto: contexto, redesenhar: redesenhar, irPara: irPara };
})();
