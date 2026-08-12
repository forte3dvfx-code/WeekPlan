# Cadência

Registo semanal de blocos, tarefas e progresso. PWA offline-first, sem contas,
sem servidor e sem analytics. Os dados vivem só no dispositivo.

## Estrutura

```
cadencia/
├── index.html          página única, carrega os scripts por ordem
├── manifest.json       nome, ícones e cores da app instalada
├── sw.js               service worker (cache offline)
├── css/
│   └── style.css
├── js/
│   ├── dates.js        datas reais e semanas ISO
│   ├── db.js           IndexedDB: blocks, weeks, entries, tasks, settings
│   ├── schedule.js     faixas, variações e o horário sugerido
│   ├── store.js        estado em memória e geração de entradas
│   ├── export.js       exportar/importar JSON e CSV
│   ├── charts.js       gráficos SVG à mão, sem bibliotecas
│   ├── ui-sheet.js     folha de detalhe e diálogos
│   ├── ui-hoje.js      ecrã Hoje
│   ├── ui-semana.js    ecrã Semana (grelha proporcional)
│   ├── ui-evolucao.js  ecrã Evolução
│   ├── ui-definicoes.js  editor de horário, cursos, dados
│   └── app.js          arranque, navegação, lembrete de backup
└── icons/
    ├── icon-192.png
    └── icon-512.png
```

**A ordem dos `<script>` no `index.html` importa.** Cada ficheiro depende dos
anteriores. Se acrescentares um ficheiro novo, mete-o antes do `app.js`.

## Testar no computador

Abre o `index.html` com duplo clique. Não precisa de servidor local — os
scripts são clássicos, sem módulos ES.

O service worker não regista em `file://`. É normal e não afecta nada: a app
funciona na mesma, só não fica em cache offline. Para testar essa parte:

```
python -m http.server 8000
```

e abre `http://localhost:8000`.

## Publicar no GitHub Pages

Sobe a pasta `cadencia/` inteira para o repositório.

**Pelo desktop:** arrasta a pasta para a página do repositório.

**Pelo telemóvel:** o browser do GitHub não aceita pastas. Vai directo aos URLs
de cada uma, e envia os ficheiros em lotes:

```
github.com/[user]/[repo]/upload/main/cadencia
github.com/[user]/[repo]/upload/main/cadencia/css
github.com/[user]/[repo]/upload/main/cadencia/js
github.com/[user]/[repo]/upload/main/cadencia/icons
```

## Sempre que alterares um ficheiro

Incrementa a versão da cache no `sw.js`:

```js
const CACHE_VERSAO = 'cadencia-v1';   // -> 'cadencia-v2', 'cadencia-v3', ...
```

Sem isto o telemóvel continua a servir a versão antiga. Depois de publicar,
**abre a app duas vezes**: a primeira instala o novo service worker, a segunda
passa a usá-lo.

## Primeiro arranque

A app começa vazia. Em **Definições** podes:

- criar blocos um a um
- importar um backup JSON
- carregar o horário sugerido (37 blocos), editável ou apagável depois

## Modelo de dados

**blocks** — o horário. `id`, `nome`, `faixa`, `dia` (0 domingo … 6 sábado),
`hora`, `minutos`, `variacoes[]`, `pedeResultado`, `curso`, `nota`.

**weeks** — uma por semana ISO. `id` (`2026-W33`), `inicio`, `variacao`, `nota`.

**entries** — uma por bloco por dia real. Guarda `data` (dia real) e `weekId`
(semana ISO, derivada da data). Estados: `pendente`, `feito`, `falhado`, `na`.

O `id` da entrada é `data__blockId` — determinístico. Regenerar um dia reescreve
as mesmas chaves em vez de duplicar, o que permite mudar a variação a meio da
semana sem perder registos.

Cada entrada guarda `nomeSnapshot`: o nome do bloco no momento do registo. Por
isso apagar ou renomear um bloco não reescreve o histórico nos gráficos.

**tasks** — tarefas avulsas ligadas a um dia.

**settings** — cursos, curso activo por faixa, intervalo e data do último backup.

## Backup

O lembrete usa o intervalo definido em Definições (3, 7, 14, 30 dias ou nunca).
O "adiar até amanhã" fica em `localStorage`; tudo o resto em IndexedDB.

Exporta de vez em quando. Os dados existem só neste dispositivo — se limpares
os dados do browser, desaparecem.
