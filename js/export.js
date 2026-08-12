/* export.js — exportar e importar.
 *
 * JSON completo para backup/restauro, CSV para abrir no Excel.
 * O CSV leva BOM UTF-8: sem isso o Excel português mostra acentos partidos.
 */
var CAD = CAD || {};

CAD.exportar = (function () {
  'use strict';

  var db = CAD.db, d = CAD.dates;

  function descarregar(nome, conteudo, tipo) {
    var blob = new Blob([conteudo], { type: tipo });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = nome;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    // O revoke imediato cortava o download em alguns browsers móveis.
    setTimeout(function () { URL.revokeObjectURL(url); }, 4000);
  }

  function carimbo() {
    var agora = new Date();
    return d.toISO(agora) + '-' +
      String(agora.getHours()).padStart(2, '0') +
      String(agora.getMinutes()).padStart(2, '0');
  }

  function jsonCompleto() {
    return db.exportarTudo().then(function (dump) {
      descarregar('cadencia-' + carimbo() + '.json',
        JSON.stringify(dump, null, 2), 'application/json');
      return dump;
    });
  }

  /* Uma linha por entrada registada. Pendentes e "na" ficam de fora:
     o CSV é para analisar o que aconteceu, não o que estava previsto. */
  function csvEntradas() {
    return db.todasEntradas().then(function (lista) {
      var linhas = [[
        'Data', 'Dia', 'Semana', 'Intervalo', 'Variação', 'Bloco', 'Faixa',
        'Hora', 'Estado', 'Minutos', 'Motivo', 'Resultado'
      ]];
      var semanas = CAD.store.estado.semanas;

      lista.filter(function (e) {
        return e.estado === db.ESTADOS.FEITO || e.estado === db.ESTADOS.FALHADO;
      }).forEach(function (e) {
        var s = semanas[e.weekId];
        linhas.push([
          e.data,
          d.DIAS[d.diaSemana(e.data)],
          e.weekId,
          d.rotuloSemana(e.weekId),
          s ? s.variacao : '',
          e.nomeSnapshot,
          (CAD.schedule.faixa(e.faixa) || {}).nome || e.faixa,
          e.hora,
          e.estado,
          e.minutos || 0,
          e.motivo || '',
          e.resultado || ''
        ]);
      });

      var csv = linhas.map(function (l) {
        return l.map(function (c) {
          var t = String(c === null || c === undefined ? '' : c);
          return /[";\n]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t;
        }).join(';');   // ponto e vírgula: separador do Excel em português
      }).join('\r\n');

      descarregar('cadencia-registos-' + carimbo() + '.csv',
        '\uFEFF' + csv, 'text/csv;charset=utf-8');
      return linhas.length - 1;
    });
  }

  /* Só o horário. Útil para partilhar ou guardar variantes do plano. */
  function jsonHorario() {
    return db.todosBlocos().then(function (blocos) {
      var dump = {
        app: 'cadencia',
        versao: db.DB_VERSION,
        exportadoEm: new Date().toISOString(),
        blocks: blocos, weeks: [], entries: [], tasks: [], settings: {}
      };
      descarregar('cadencia-horario-' + carimbo() + '.json',
        JSON.stringify(dump, null, 2), 'application/json');
      return blocos.length;
    });
  }

  function lerFicheiro(ficheiro) {
    return new Promise(function (resolve, reject) {
      var leitor = new FileReader();
      leitor.onload = function () {
        try { resolve(JSON.parse(leitor.result)); }
        catch (erro) { reject(new Error('O ficheiro não é JSON válido.')); }
      };
      leitor.onerror = function () { reject(new Error('Não foi possível ler o ficheiro.')); };
      leitor.readAsText(ficheiro, 'utf-8');
    });
  }

  function importar(ficheiro, substituir) {
    return lerFicheiro(ficheiro)
      .then(function (dump) { return db.importarTudo(dump, { substituir: !!substituir }); })
      .then(function (resumo) {
        return CAD.store.carregar().then(function () { return resumo; });
      });
  }

  return {
    jsonCompleto: jsonCompleto,
    csvEntradas: csvEntradas,
    jsonHorario: jsonHorario,
    importar: importar,
    descarregar: descarregar
  };
})();
