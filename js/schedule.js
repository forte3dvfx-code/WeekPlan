/* schedule.js — faixas, variações, cursos e o horário sugerido.
 *
 * A app arranca VAZIA. Este ficheiro só define os vocabulários (faixas,
 * variações) e guarda o horário que desenhámos como proposta, para poderes
 * carregá-lo com um toque em Definições — ou ignorá-lo e criar o teu.
 */
var CAD = CAD || {};

CAD.schedule = (function () {
  'use strict';

  var DOM = 0, SEG = 1, TER = 2, QUA = 3, QUI = 4, SEX = 5, SAB = 6;

  /* As variações desligam blocos sem os apagar. */
  var VARIACOES = {
    base: { id: 'base', nome: 'Base', nota: 'O padrão da semana.' },
    producao: { id: 'producao', nome: 'Produção', nota: 'Semana pesada. As tardes cedem, as manhãs mantêm-se.' },
    leve: { id: 'leve', nome: 'Leve', nota: 'Energia alta e sem urgências. Não é para ser a norma.' },
    recuperacao: { id: 'recuperacao', nome: 'Recuperação', nota: 'Depois de crunch ou doença. Uma semana, não duas.' }
  };
  var VARIACAO_OMISSAO = 'base';
  var TODAS_VARIACOES = ['base', 'producao', 'leve', 'recuperacao'];

  /* As faixas agrupam blocos para a cor e para os gráficos.
     Podes editar os nomes; os ids são usados nos registos e não devem mudar. */
  var FAIXAS = {
    python: { id: 'python', nome: 'Python', cor: '#5FB8D6' },
    build: { id: 'build', nome: 'Build', cor: '#E4A33F' },
    vex: { id: 'vex', nome: 'VEX', cor: '#B58CE2' },
    lookdev: { id: 'lookdev', nome: 'Lookdev', cor: '#5DD59B' },
    zbrush: { id: 'zbrush', nome: 'ZBrush', cor: '#E0755E' },
    corpo: { id: 'corpo', nome: 'Corpo', cor: '#8A93A8' },
    cabeca: { id: 'cabeca', nome: 'Cabeça', cor: '#697388' },
    outro: { id: 'outro', nome: 'Outro', cor: '#5B6478' }
  };
  var ORDEM_FAIXAS = ['python', 'build', 'vex', 'lookdev', 'zbrush', 'corpo', 'cabeca', 'outro'];

  function faixa(id) { return FAIXAS[id] || FAIXAS.outro; }
  function cor(id) { return faixa(id).cor; }

  /* Cursos sugeridos. Vivem em `settings` depois de carregados, e são
     editáveis. `alvoHoras` alimenta as barras de progresso. */
  var CURSOS_SUGERIDOS = [
    { id: 'py-basics', nome: 'How to Not Suck at Python', faixa: 'python', alvoHoras: 25, ordem: 1 },
    { id: 'py-houdini', nome: 'Python for Houdini Artists', faixa: 'python', alvoHoras: 60, ordem: 2 },
    { id: 'py-prod', nome: 'Python for Production', faixa: 'python', alvoHoras: 70, ordem: 3 },
    { id: 'vex-horikawa', nome: 'VEX — Junichiro Horikawa', faixa: 'vex', alvoHoras: 30, ordem: 4 },
    { id: 'vox-cinema', nome: 'Voxyde — Cinematic Environment', faixa: 'lookdev', alvoHoras: 23, ordem: 5 },
    { id: 'vox-particles', nome: 'Voxyde — Particle FX', faixa: 'lookdev', alvoHoras: 35, ordem: 6 }
  ];

  var CURSOS_ATIVOS_SUGERIDOS = {
    python: 'py-basics',
    vex: 'vex-horikawa',
    lookdev: 'vox-cinema'
  };

  /* --- horário sugerido ---
   *
   * Campos de um bloco:
   *   id            estável; nunca reutilizar um id para outro bloco
   *   nome          o que aparece na lista
   *   faixa         chave de FAIXAS
   *   dia           0 domingo … 6 sábado
   *   hora          "HH:MM"
   *   minutos       duração planeada; o registo real pode ser menor
   *   variacoes     em que variações este bloco existe
   *   pedeResultado abre a folha de detalhe ao marcar como feito
   *   curso         true se as horas somam ao curso activo da faixa
   *   nota          contexto curto
   */
  var T = TODAS_VARIACOES;
  var BL = ['base', 'leve'];

  function repetir(dias, molde) {
    return dias.map(function (d) {
      var b = {};
      Object.keys(molde).forEach(function (k) { b[k] = molde[k]; });
      b.dia = d;
      b.id = molde.id + '-' + d;
      return b;
    });
  }

  var HORARIO_SUGERIDO = [
    { id: 'py-seg', nome: 'Python', faixa: 'python', dia: SEG, hora: '07:30', minutos: 105, variacoes: T, curso: true, nota: 'Aprender — vídeo e notas' },
    { id: 'py-ter', nome: 'Python', faixa: 'python', dia: TER, hora: '07:30', minutos: 105, variacoes: ['base', 'producao', 'leve'], curso: true, nota: 'Praticar — sem o vídeo aberto' },
    { id: 'py-qua', nome: 'Python', faixa: 'python', dia: QUA, hora: '07:30', minutos: 105, variacoes: T, curso: true, nota: 'Aprender — vídeo e notas' },
    { id: 'py-qui', nome: 'Python', faixa: 'python', dia: QUI, hora: '07:30', minutos: 105, variacoes: T, curso: true, nota: 'Praticar — sem o vídeo aberto' },

    { id: 'build-seg', nome: 'Build', faixa: 'build', dia: SEG, hora: '17:00', minutos: 60, variacoes: BL, pedeResultado: true, nota: 'O que foi para a equipa?' },
    { id: 'build-ter', nome: 'Build', faixa: 'build', dia: TER, hora: '17:00', minutos: 60, variacoes: BL, pedeResultado: true, nota: 'O que foi para a equipa?' },
    { id: 'build-qua', nome: 'Build', faixa: 'build', dia: QUA, hora: '17:00', minutos: 60, variacoes: BL, pedeResultado: true, nota: 'O que foi para a equipa?' },
    { id: 'build-qui', nome: 'Build', faixa: 'build', dia: QUI, hora: '17:00', minutos: 60, variacoes: BL, pedeResultado: true, nota: 'O que foi para a equipa?' },
    { id: 'build-qui-extra', nome: 'Build extra', faixa: 'build', dia: QUI, hora: '18:15', minutos: 90, variacoes: ['leve'], pedeResultado: true, nota: 'Só em semana leve' },

    { id: 'vex-sex', nome: 'VEX', faixa: 'vex', dia: SEX, hora: '16:00', minutos: 120, variacoes: BL, curso: true, nota: 'Playlist Horikawa — por problema real' },
    { id: 'lookdev-sab', nome: 'Cinematic Environment', faixa: 'lookdev', dia: SAB, hora: '10:30', minutos: 150, variacoes: BL, curso: true, nota: 'Bloco longo, depois do café' },
    { id: 'zbrush-dom', nome: 'ZBrush', faixa: 'zbrush', dia: DOM, hora: '11:00', minutos: 120, variacoes: T, nota: 'Prazer, sem metas' },

    { id: 'cafe-sab', nome: 'Café', faixa: 'cabeca', dia: SAB, hora: '09:00', minutos: 75, variacoes: T, nota: 'Rotina, não meta' },
    { id: 'cafe-dom', nome: 'Café', faixa: 'cabeca', dia: DOM, hora: '09:30', minutos: 75, variacoes: T, nota: 'Rotina, não meta' }
  ]
    .concat(repetir([SEG, TER, QUA, QUI, SEX], { id: 'crossfit', nome: 'CrossFit', faixa: 'corpo', hora: '12:30', minutos: 60, variacoes: T }))
    .concat(repetir([SEG, TER, QUA, QUI, SEX], { id: 'mob', nome: 'Mobilidade', faixa: 'corpo', hora: '13:30', minutos: 5, variacoes: T, nota: 'Couch stretch · torácica · peitoral' }))
    .concat(repetir([SEG, QUA, SEX], { id: 'passadeira', nome: 'Passadeira', faixa: 'corpo', hora: '18:00', minutos: 45, variacoes: BL, nota: 'Podcast. Sem meta de passos.' }))
    .concat(repetir([SEG, TER, QUA, QUI, SEX], { id: 'piano', nome: 'Piano', faixa: 'cabeca', hora: '21:30', minutos: 30, variacoes: T, nota: 'Independência das mãos' }))
    .concat(repetir([SEG, TER, QUA, QUI, SEX], { id: 'leitura', nome: 'Leitura', faixa: 'cabeca', hora: '22:00', minutos: 30, variacoes: T }));

  /* Bloco novo com valores por omissão sensatos. */
  function blocoVazio(dia) {
    return {
      id: CAD.db.novoId('b'),
      nome: '',
      faixa: 'outro',
      dia: dia === undefined ? 1 : dia,
      hora: '09:00',
      minutos: 60,
      variacoes: TODAS_VARIACOES.slice(),
      pedeResultado: false,
      curso: false,
      nota: ''
    };
  }

  /* Filtra os blocos de um dia numa variação, ordenados por hora. */
  function blocosDoDia(blocos, dia, variacao) {
    return blocos
      .filter(function (b) { return b.dia === dia && (b.variacoes || []).indexOf(variacao) !== -1; })
      .sort(function (a, b) { return a.hora.localeCompare(b.hora); });
  }

  function blocosDaVariacao(blocos, variacao) {
    return blocos.filter(function (b) { return (b.variacoes || []).indexOf(variacao) !== -1; });
  }

  return {
    VARIACOES: VARIACOES, VARIACAO_OMISSAO: VARIACAO_OMISSAO, TODAS_VARIACOES: TODAS_VARIACOES,
    FAIXAS: FAIXAS, ORDEM_FAIXAS: ORDEM_FAIXAS, faixa: faixa, cor: cor,
    CURSOS_SUGERIDOS: CURSOS_SUGERIDOS, CURSOS_ATIVOS_SUGERIDOS: CURSOS_ATIVOS_SUGERIDOS,
    HORARIO_SUGERIDO: HORARIO_SUGERIDO,
    blocoVazio: blocoVazio, blocosDoDia: blocosDoDia, blocosDaVariacao: blocosDaVariacao
  };
})();
