/* charts.js — gráficos em SVG, sem bibliotecas.
 *
 * Escolhi desenhar à mão em vez de usar Chart.js para manter zero dependências
 * e funcionar offline sem CDN. O custo é este ficheiro; o ganho é a app não
 * partir se um CDN cair ou o telemóvel estiver sem rede.
 */
var CAD = CAD || {};

CAD.charts = (function () {
  'use strict';

  var d = CAD.dates;

  function esc(t) {
    return String(t === null || t === undefined ? '' : t)
      .replace(/[&<>"]/g, function (c) {
        return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c];
      });
  }

  /* Barras por semana, com o alvo dessa semana como fundo.
     `dados` = [{ weekId, feito, alvo, variacao }] */
  function barrasSemanais(dados, opcoes) {
    opcoes = opcoes || {};
    var cor = opcoes.cor || 'var(--py)';
    if (!dados.length) return '<p class="empty">Sem semanas registadas.</p>';

    var largura = Math.max(300, dados.length * 56);
    var altura = 152;
    var pad = { t: 16, b: 40, l: 6, r: 6 };
    var coluna = (largura - pad.l - pad.r) / dados.length;
    var barra = Math.min(26, coluna * 0.5);
    var teto = Math.max.apply(null, dados.map(function (x) {
      return Math.max(x.alvo || 0, x.feito || 0);
    })) || 1;
    var escala = function (v) { return (altura - pad.t - pad.b) * (v / teto); };

    var out = '<svg class="chart" viewBox="0 0 ' + largura + ' ' + altura + '" ' +
      'width="' + largura + '" height="' + altura + '" role="img" aria-label="' +
      esc(opcoes.titulo || 'Evolução por semana') + '">';

    dados.forEach(function (x, i) {
      var cx = pad.l + coluna * i + coluna / 2;
      var xx = cx - barra / 2;
      var hAlvo = escala(x.alvo || 0);
      var hFeito = escala(x.feito || 0);
      var base = altura - pad.b;

      if (x.alvo) {
        out += '<rect class="track-bg" x="' + xx + '" y="' + (base - hAlvo) +
          '" width="' + barra + '" height="' + hAlvo + '" rx="3"/>';
      }
      if (x.feito) {
        out += '<rect x="' + xx + '" y="' + (base - hFeito) +
          '" width="' + barra + '" height="' + hFeito + '" rx="3" fill="' + cor + '"/>';
      }
      out += '<text class="val" x="' + cx + '" y="' + (base - Math.max(hAlvo, hFeito) - 6) +
        '" text-anchor="middle">' + (x.feito || 0) + '</text>';

      // eixo com as datas reais, não só o número da semana
      out += '<text x="' + cx + '" y="' + (base + 15) + '" text-anchor="middle">' +
        esc(d.rotuloSemana(x.weekId).replace(/ /g, '\u00A0')) + '</text>';

      var marca = x.variacao === 'producao' ? 'produção'
        : x.variacao === 'recuperacao' ? 'recuper.'
          : x.variacao === 'leve' ? 'leve' : '';
      if (marca) {
        out += '<text x="' + cx + '" y="' + (base + 28) +
          '" text-anchor="middle" fill="var(--build)">' + marca + '</text>';
      }
    });

    return out + '</svg>';
  }

  /* Linha de minutos por semana. Boa para ver tendência de volume total. */
  function linhaSemanal(dados, opcoes) {
    opcoes = opcoes || {};
    var cor = opcoes.cor || 'var(--look)';
    if (dados.length < 2) return '<p class="empty">Precisa de pelo menos duas semanas.</p>';

    var largura = Math.max(300, dados.length * 56);
    var altura = 132;
    var pad = { t: 16, b: 32, l: 8, r: 8 };
    var teto = Math.max.apply(null, dados.map(function (x) { return x.valor; })) || 1;
    var passo = (largura - pad.l - pad.r) / (dados.length - 1);
    var y = function (v) { return altura - pad.b - (altura - pad.t - pad.b) * (v / teto); };

    var pontos = dados.map(function (x, i) {
      return (pad.l + passo * i) + ',' + y(x.valor);
    });

    var out = '<svg class="chart" viewBox="0 0 ' + largura + ' ' + altura + '" ' +
      'width="' + largura + '" height="' + altura + '" role="img" aria-label="' +
      esc(opcoes.titulo || 'Minutos por semana') + '">';

    // área sob a linha, para dar peso visual sem acrescentar cor
    out += '<polygon points="' + pad.l + ',' + (altura - pad.b) + ' ' + pontos.join(' ') +
      ' ' + (pad.l + passo * (dados.length - 1)) + ',' + (altura - pad.b) +
      '" fill="' + cor + '" opacity=".12"/>';
    out += '<polyline points="' + pontos.join(' ') + '" fill="none" stroke="' + cor +
      '" stroke-width="2" stroke-linejoin="round" stroke-linecap="round"/>';

    dados.forEach(function (x, i) {
      var cx = pad.l + passo * i;
      out += '<circle cx="' + cx + '" cy="' + y(x.valor) + '" r="3" fill="' + cor + '"/>';
      if (i === 0 || i === dados.length - 1 || dados.length <= 6) {
        out += '<text x="' + cx + '" y="' + (altura - pad.b + 15) + '" text-anchor="middle">' +
          esc(d.rotuloSemanaCurto(x.weekId)) + '</text>';
      }
    });

    return out + '</svg>';
  }

  /* Uma linha de progresso: rótulo, barra e valor. */
  function barraProgresso(rotulo, valor, alvo, cor, sufixo) {
    var pc = alvo > 0 ? Math.min(100, (valor / alvo) * 100) : 0;
    return '<div class="barrow" style="--c:' + cor + '">' +
      '<span class="lb' + (valor > 0 ? ' on' : '') + '">' + esc(rotulo) + '</span>' +
      '<span class="tr"><i style="width:' + pc.toFixed(1) + '%"></i></span>' +
      '<span class="vv">' + esc(valor) + '/' + esc(alvo) + (sufixo || '') + '</span>' +
      '</div>';
  }

  return {
    barrasSemanais: barrasSemanais,
    linhaSemanal: linhaSemanal,
    barraProgresso: barraProgresso
  };
})();
