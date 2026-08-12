/* ui-definicoes.js — ecrã Definições.
 *
 * Editor do horário, cursos, exportação/importação e lembrete de backup.
 * É aqui que a app deixa de ser fixa: os blocos vivem na base de dados.
 */
var CAD = CAD || {};
CAD.ui = CAD.ui || {};

CAD.ui.definicoes = (function () {
  'use strict';

  var d = CAD.dates, db = CAD.db, store = CAD.store, sch = CAD.schedule;
  var esc = function (t) { return CAD.ui.sheet.esc(t); };

  var diaAberto = null;   // qual o dia expandido no editor de horário

  function render(contexto) {
    var blocos = store.estado.blocos;
    var entradas = store.todasEntradas().filter(function (e) {
      return e.estado === db.ESTADOS.FEITO || e.estado === db.ESTADOS.FALHADO;
    });
    var ultimoBackup = store.definicao('ultimoBackup', null);
    var intervalo = store.definicao('intervaloBackup', 7);

    return '<div class="head"><div><div class="sub">Cadência</div><h1>Definições</h1></div>' +
      '<div class="aside"><b>' + blocos.length + '</b><br>blocos</div></div>' +

      seccaoHorario(blocos) +
      seccaoCursos() +
      seccaoDados(entradas.length) +
      seccaoBackup(ultimoBackup, intervalo) +
      seccaoPerigo();
  }

  /* --- horário --- */
  function seccaoHorario(blocos) {
    var html = '<div class="secthead"><h3>Horário</h3>' +
      '<button type="button" class="add" data-novo-bloco="1">+ Bloco</button></div>';

    if (!blocos.length) {
      html += '<div class="banner">Ainda não há blocos. Cria o primeiro, importa um backup, ' +
        'ou carrega o horário sugerido abaixo.</div>' +
        '<div class="acts" style="margin-bottom:18px">' +
        '<button type="button" class="solid" data-carregar-sugerido="1">Carregar horário sugerido</button>' +
        '</div>';
      return html;
    }

    html += '<p class="chip-note">Toca num dia para ver e editar os blocos.</p><div class="dias">';
    for (var i = 1; i <= 7; i++) {
      var dia = i % 7;   // começa à segunda e acaba ao domingo
      var doDia = blocos.filter(function (b) { return b.dia === dia; });
      var aberto = diaAberto === dia;
      var minutos = doDia.reduce(function (s, b) { return s + b.minutos; }, 0);

      html += '<div class="diarow' + (aberto ? ' aberto' : '') + '">' +
        '<button type="button" class="diahead" data-dia-toggle="' + dia + '">' +
        '<span class="dn">' + d.DIAS[dia] + '</span>' +
        '<span class="dc">' + doDia.length + ' · ' + d.duracao(minutos) + '</span>' +
        '<span class="dx">' + (aberto ? '−' : '+') + '</span>' +
        '</button>';

      if (aberto) {
        html += '<div class="diablocos">' +
          (doDia.length
            ? doDia.map(function (b) {
              var faixa = sch.faixa(b.faixa);
              return '<button type="button" class="blocorow" style="--c:' + faixa.cor +
                '" data-editar-bloco="' + b.id + '">' +
                '<span class="bh">' + esc(b.hora) + '</span>' +
                '<span class="bn">' + esc(b.nome) + '</span>' +
                '<span class="bd">' + d.duracao(b.minutos) + '</span>' +
                '</button>';
            }).join('')
            : '<p class="empty">Nenhum bloco neste dia.</p>') +
          '<button type="button" class="add wide" data-novo-bloco="' + dia + '">+ Bloco à ' + d.DIAS[dia].toLowerCase() + '</button>' +
          '</div>';
      }
      html += '</div>';
    }
    return html + '</div>';
  }

  /* --- cursos --- */
  function seccaoCursos() {
    var cursos = store.estado.cursos || [];
    var ativos = store.estado.cursosAtivos || {};

    if (!cursos.length) {
      return '<div class="secthead"><h3>Cursos</h3></div>' +
        '<p class="empty">Sem cursos. Vêm com o horário sugerido, ou podes importá-los.</p>';
    }

    var faixasComCurso = {};
    cursos.forEach(function (c) { faixasComCurso[c.faixa] = true; });

    return '<div class="secthead"><h3>Cursos</h3></div>' +
      '<p class="chip-note">O curso activo de cada faixa é o que recebe as horas registadas.</p>' +
      Object.keys(faixasComCurso).map(function (f) {
        var daFaixa = cursos.filter(function (c) { return c.faixa === f; });
        return '<div class="card"><div class="cap">' + esc(sch.faixa(f).nome) + '</div>' +
          daFaixa.map(function (c) {
            var ativo = ativos[f] === c.id;
            return '<button type="button" class="cursorow' + (ativo ? ' ativo' : '') +
              '" style="--c:' + sch.cor(f) + '" data-curso-ativo="' + f + '|' + c.id + '">' +
              '<span class="ci"></span>' +
              '<span class="cn">' + esc(c.nome) + '</span>' +
              '<span class="ch">' + c.alvoHoras + 'h</span>' +
              '</button>';
          }).join('') + '</div>';
      }).join('');
  }

  /* --- dados --- */
  function seccaoDados(nRegistos) {
    return '<div class="secthead"><h3>Dados</h3></div>' +
      '<p class="chip-note">' + nRegistos + ' registos guardados neste dispositivo. ' +
      'Nada sai daqui sem seres tu a exportar.</p>' +
      '<div class="btnstack">' +
      '<button type="button" class="wide-btn" data-exp="json"><b>Exportar tudo (JSON)</b>' +
      '<small>Backup completo: horário, registos, tarefas e definições</small></button>' +
      '<button type="button" class="wide-btn" data-exp="csv"><b>Exportar registos (CSV)</b>' +
      '<small>Para abrir no Excel. Já vem com acentos corrigidos.</small></button>' +
      '<button type="button" class="wide-btn" data-exp="horario"><b>Exportar só o horário</b>' +
      '<small>Para guardar variantes do plano ou partilhar</small></button>' +
      '<button type="button" class="wide-btn" data-imp="funde"><b>Importar (juntar)</b>' +
      '<small>Acrescenta e actualiza sem apagar o que já existe</small></button>' +
      '<button type="button" class="wide-btn" data-imp="substitui"><b>Importar (substituir)</b>' +
      '<small>Apaga tudo e fica só o conteúdo do ficheiro</small></button>' +
      '</div>' +
      '<input type="file" id="ficheiroImport" accept="application/json,.json" hidden>';
  }

  /* --- lembrete de backup --- */
  function seccaoBackup(ultimo, intervalo) {
    var texto = ultimo
      ? 'Último backup: ' + esc(d.rotuloDia(ultimo)) + '.'
      : 'Ainda não fizeste nenhum backup.';
    var opcoes = [3, 7, 14, 30];

    return '<div class="secthead"><h3>Lembrete de backup</h3></div>' +
      '<p class="chip-note">' + texto + ' A app avisa-te quando passar o intervalo.</p>' +
      '<div class="mins">' +
      opcoes.map(function (n) {
        return '<button type="button" data-intervalo="' + n + '" aria-pressed="' +
          (Number(intervalo) === n) + '">' + n + ' dias</button>';
      }).join('') +
      '<button type="button" data-intervalo="0" aria-pressed="' + (Number(intervalo) === 0) + '">Nunca</button>' +
      '</div>';
  }

  function seccaoPerigo() {
    return '<div class="secthead"><h3>Zona de risco</h3></div>' +
      '<div class="btnstack">' +
      '<button type="button" class="wide-btn perigo-btn" data-apagar-registos="1"><b>Apagar registos</b>' +
      '<small>Mantém o horário, apaga o que registaste</small></button>' +
      '<button type="button" class="wide-btn perigo-btn" data-apagar-tudo="1"><b>Apagar tudo</b>' +
      '<small>Horário, registos, tarefas e definições</small></button>' +
      '</div>' +
      '<p class="rodape">Cadência · dados só neste dispositivo · sem contas, sem analytics</p>';
  }

  /* --- eventos --- */
  function tratarClique(ev, contexto, redesenhar) {
    var sheet = CAD.ui.sheet;

    var toggle = ev.target.closest('[data-dia-toggle]');
    if (toggle) {
      var dia = Number(toggle.dataset.diaToggle);
      diaAberto = diaAberto === dia ? null : dia;
      redesenhar();
      return true;
    }

    var novo = ev.target.closest('[data-novo-bloco]');
    if (novo) {
      var diaNovo = Number(novo.dataset.novoBloco);
      var b = sch.blocoVazio(isNaN(diaNovo) || diaNovo === 1 && novo.dataset.novoBloco === '1' ? (diaAberto === null ? 1 : diaAberto) : diaNovo);
      sheet.editarBloco(b, function () { store.gerarSemana(contexto.semana).then(redesenhar); });
      return true;
    }

    var editar = ev.target.closest('[data-editar-bloco]');
    if (editar) {
      var alvo = store.bloco(editar.dataset.editarBloco);
      if (!alvo) return true;
      var copia = JSON.parse(JSON.stringify(alvo));
      sheet.editarBloco(copia,
        function () { store.gerarSemana(contexto.semana).then(redesenhar); },
        function () { redesenhar(); });
      return true;
    }

    var sugerido = ev.target.closest('[data-carregar-sugerido]');
    if (sugerido) {
      sheet.confirmar('Carregar horário sugerido?',
        'Acrescenta ' + sch.HORARIO_SUGERIDO.length + ' blocos e os cursos. Podes editar ou apagar tudo depois.',
        'Carregar',
        function () {
          store.carregarHorarioSugerido()
            .then(function () { return store.gerarSemana(d.weekId(d.hoje())); })
            .then(function () { redesenhar(); sheet.aviso('Horário carregado'); });
        });
      return true;
    }

    var cursoAtivo = ev.target.closest('[data-curso-ativo]');
    if (cursoAtivo) {
      var partes = cursoAtivo.dataset.cursoAtivo.split('|');
      store.definirCursoAtivo(partes[0], partes[1]).then(function () {
        redesenhar();
        sheet.aviso('Curso activo actualizado');
      });
      return true;
    }

    var exp = ev.target.closest('[data-exp]');
    if (exp) {
      var qual = exp.dataset.exp;
      var p = qual === 'json' ? CAD.exportar.jsonCompleto()
        : qual === 'csv' ? CAD.exportar.csvEntradas()
          : CAD.exportar.jsonHorario();
      p.then(function () {
        if (qual === 'json') {
          store.definir('ultimoBackup', d.hoje()).then(redesenhar);
        }
        sheet.aviso('Ficheiro gerado');
      }).catch(function (erro) { sheet.aviso(erro.message); });
      return true;
    }

    var imp = ev.target.closest('[data-imp]');
    if (imp) {
      var substituir = imp.dataset.imp === 'substitui';
      var input = document.getElementById('ficheiroImport');
      input.onchange = function () {
        var ficheiro = input.files && input.files[0];
        input.value = '';
        if (!ficheiro) return;
        var executar = function () {
          CAD.exportar.importar(ficheiro, substituir).then(function (resumo) {
            return store.gerarSemana(d.weekId(d.hoje())).then(function () {
              redesenhar();
              sheet.aviso(resumo.blocos + ' blocos · ' + resumo.entradas + ' registos importados');
            });
          }).catch(function (erro) { sheet.aviso(erro.message); });
        };
        if (substituir) {
          sheet.confirmar('Substituir tudo?',
            'Apaga o que está na app e fica só o conteúdo do ficheiro. Não há como voltar atrás.',
            'Substituir', executar, true);
        } else executar();
      };
      input.click();
      return true;
    }

    var intervalo = ev.target.closest('[data-intervalo]');
    if (intervalo) {
      store.definir('intervaloBackup', Number(intervalo.dataset.intervalo)).then(redesenhar);
      return true;
    }

    var apagarReg = ev.target.closest('[data-apagar-registos]');
    if (apagarReg) {
      sheet.confirmar('Apagar todos os registos?',
        'O horário mantém-se. Perdes tudo o que marcaste como feito ou falhado, e os gráficos ficam vazios.',
        'Apagar registos',
        function () {
          var ids = store.todasEntradas().map(function (e) { return e.id; });
          Promise.all(ids.map(function (id) { return db.apagarEntrada(id); }))
            .then(function () { return store.carregar(); })
            .then(function () { return store.gerarSemana(d.weekId(d.hoje())); })
            .then(function () { redesenhar(); sheet.aviso('Registos apagados'); });
        }, true);
      return true;
    }

    var apagarTudo = ev.target.closest('[data-apagar-tudo]');
    if (apagarTudo) {
      sheet.confirmar('Apagar tudo?',
        'Horário, registos, tarefas e definições. Exporta um backup antes, se houver alguma dúvida.',
        'Apagar tudo',
        function () {
          db.apagarTudo()
            .then(function () { return store.carregar(); })
            .then(function () { diaAberto = null; redesenhar(); sheet.aviso('Tudo apagado'); });
        }, true);
      return true;
    }

    return false;
  }

  return { render: render, tratarClique: tratarClique };
})();
