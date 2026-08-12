/* dates.js — datas reais e semanas ISO.
 *
 * Script clássico (sem import/export), para poder abrir o index.html
 * directamente no browser sem servidor local.
 *
 * Regra ISO 8601: a semana começa à segunda e a semana 1 é a que contém a
 * primeira quinta-feira. É a convenção do Notion e do calendário do telemóvel.
 *
 * As datas circulam sempre como texto "YYYY-MM-DD", nunca como objectos Date,
 * para não haver surpresas de fuso horário ao guardar em IndexedDB.
 */
var CAD = CAD || {};

CAD.dates = (function () {
  'use strict';

  var MESES = ['Jan', 'Fev', 'Mar', 'Abr', 'Mai', 'Jun', 'Jul', 'Ago', 'Set', 'Out', 'Nov', 'Dez'];
  var DIAS = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'];
  var DIAS_CURTOS = ['Dom', '2ª', '3ª', '4ª', '5ª', '6ª', 'Sáb'];
  var SEMANA_MS = 7 * 24 * 60 * 60 * 1000;

  /* Date -> "YYYY-MM-DD" usando a data LOCAL.
     toISOString() converteria para UTC e às 23h em Portugal saltava um dia. */
  function toISO(date) {
    return date.getFullYear() + '-' +
      String(date.getMonth() + 1).padStart(2, '0') + '-' +
      String(date.getDate()).padStart(2, '0');
  }

  /* "YYYY-MM-DD" -> Date ao meio-dia local.
     O meio-dia evita que a mudança de hora empurre a data para o dia anterior. */
  function fromISO(texto) {
    var p = texto.split('-');
    return new Date(Number(p[0]), Number(p[1]) - 1, Number(p[2]), 12, 0, 0);
  }

  function hoje() { return toISO(new Date()); }

  function addDays(texto, dias) {
    var d = fromISO(texto);
    d.setDate(d.getDate() + dias);
    return toISO(d);
  }

  /* 0 = domingo … 6 = sábado (igual ao Date.getDay nativo). */
  function diaSemana(texto) { return fromISO(texto).getDay(); }

  function segundaDe(texto) {
    var d = diaSemana(texto);
    return addDays(texto, -(d === 0 ? 6 : d - 1));
  }

  /* "2026-W33" */
  function weekId(texto) {
    var segunda = fromISO(segundaDe(texto));
    var quinta = new Date(segunda);
    quinta.setDate(quinta.getDate() + 3);
    var ano = quinta.getFullYear();
    var primeiraSegunda = fromISO(segundaDe(toISO(new Date(ano, 0, 4, 12, 0, 0))));
    var n = Math.round((quinta - primeiraSegunda) / SEMANA_MS) + 1;
    return ano + '-W' + String(n).padStart(2, '0');
  }

  /* Inverso de weekId: devolve a data da segunda-feira. */
  function inicioDaSemana(id) {
    var p = id.split('-W');
    var ano = Number(p[0]), n = Number(p[1]);
    var primeiraSegunda = segundaDe(toISO(new Date(ano, 0, 4, 12, 0, 0)));
    return addDays(primeiraSegunda, (n - 1) * 7);
  }

  function deslocarSemana(id, offset) {
    return weekId(addDays(inicioDaSemana(id), offset * 7));
  }

  function diasDaSemana(id) {
    var inicio = inicioDaSemana(id), out = [];
    for (var i = 0; i < 7; i++) out.push(addDays(inicio, i));
    return out;
  }

  function semanasEntre(de, para) {
    return Math.round((fromISO(inicioDaSemana(para)) - fromISO(inicioDaSemana(de))) / SEMANA_MS);
  }

  /* Lista contínua de semanas. Os gráficos precisam disto: uma semana sem
     registos tem de aparecer como zero, e não desaparecer do eixo. */
  function intervaloSemanas(de, para) {
    var n = semanasEntre(de, para), out = [];
    if (n < 0) return out;
    for (var i = 0; i <= n; i++) out.push(deslocarSemana(de, i));
    return out;
  }

  /* "10–16 Ago" ou "28 Set – 4 Out". É este o rótulo do eixo dos gráficos:
     mostra os dias reais, não só o número da semana. */
  function rotuloSemana(id) {
    var a = fromISO(inicioDaSemana(id));
    var b = fromISO(addDays(inicioDaSemana(id), 6));
    var m1 = MESES[a.getMonth()], m2 = MESES[b.getMonth()];
    return m1 === m2
      ? a.getDate() + '–' + b.getDate() + ' ' + m1
      : a.getDate() + ' ' + m1 + ' – ' + b.getDate() + ' ' + m2;
  }

  function rotuloSemanaCurto(id) {
    return 'S' + id.split('-W')[1].replace(/^0/, '');
  }

  function rotuloDia(texto) {
    var d = fromISO(texto);
    return DIAS[d.getDay()] + ', ' + d.getDate() + ' ' + MESES[d.getMonth()];
  }

  function rotuloDiaCurto(texto) {
    var d = fromISO(texto);
    return { nome: DIAS_CURTOS[d.getDay()], num: d.getDate() };
  }

  /* "07:30" -> 450. Usado para posicionar blocos na grelha proporcional. */
  function minutosDeHora(hhmm) {
    var p = hhmm.split(':');
    return Number(p[0]) * 60 + Number(p[1]);
  }

  /* 450 -> "07:30" */
  function horaDeMinutos(min) {
    var m = ((min % 1440) + 1440) % 1440;
    return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0');
  }

  /* 105 -> "1h45"; 45 -> "45m" */
  function duracao(min) {
    if (min < 60) return min + 'm';
    var h = Math.floor(min / 60), r = min % 60;
    return h + 'h' + (r ? String(r).padStart(2, '0') : '');
  }

  return {
    MESES: MESES, DIAS: DIAS, DIAS_CURTOS: DIAS_CURTOS,
    toISO: toISO, fromISO: fromISO, hoje: hoje, addDays: addDays,
    diaSemana: diaSemana, segundaDe: segundaDe,
    weekId: weekId, inicioDaSemana: inicioDaSemana, deslocarSemana: deslocarSemana,
    diasDaSemana: diasDaSemana, semanasEntre: semanasEntre, intervaloSemanas: intervaloSemanas,
    rotuloSemana: rotuloSemana, rotuloSemanaCurto: rotuloSemanaCurto,
    rotuloDia: rotuloDia, rotuloDiaCurto: rotuloDiaCurto,
    minutosDeHora: minutosDeHora, horaDeMinutos: horaDeMinutos, duracao: duracao
  };
})();
