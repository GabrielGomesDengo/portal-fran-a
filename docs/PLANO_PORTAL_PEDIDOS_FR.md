# Plano de construção — Portal de Pedidos França (Dengo)

> Versão 0.2 — 10/11/2026. Revisado com base nos arquivos reais: invoice e packing list
> do SHIP 2611 (PDF + Excel com 12 abas), planilha de pedido de novembro (modelo vazio)
> e controle de volume do SHIP 2610 (pedido preenchido com plano do PCP).

## 1. Objetivo

Substituir a planilha de pedido enviada pela loja da França por um portal web onde:

- a França monta o pedido como em um e-commerce, a partir do portfólio disponível;
- Supply valida e ajusta; PCP planeja a produção respeitando o *contract date*;
- Operações confere o recebimento, mede OTIF, preenche o packing list, gera a invoice
  e o arquivo com os dados para emissão da NF no SAP.

Tudo em um único lugar, com histórico, status e documentos gerados automaticamente.

## 2. Perfis de acesso

| Perfil | O que faz | O que vê |
|---|---|---|
| **França (FR)** | Cria/edita pedido, aceita ou recusa ajustes de Supply, acompanha status | Portfólio, carrinho, seus pedidos, plano de produção (somente leitura), documentos |
| **Supply** | Valida o pedido, edita tudo (itens, qtd, data de embarque), recusa ou aprova | Todos os pedidos, fila de validação, histórico de alterações |
| **PCP** | Informa o que será produzido, quantidades e datas; conclui o plano; agenda reunião Teams | Pedidos aprovados, plano de produção, coluna de data mínima de produção |
| **Operações** | Informa recebimento físico, preenche packing list, gera invoice e arquivo SAP | Pedidos com plano concluído, KPIs OTIF, packing list, invoice |
| **Admin** | Cadastra usuários, portfólio, shelf life, contract date, preços, parâmetros | Tudo |

Cada perfil só enxerga as etapas que lhe cabem. Supply, PCP e Operações são perfis internos
(Dengo Brasil); França é externo. O portal terá idioma PT/FR (textos em arquivo de tradução;
a primeira entrega pode ser PT com os rótulos-chave em FR).

## 3. Ciclo de vida do pedido (máquina de estados)

```
RASCUNHO (FR montando)
   │ enviar pedido  → gera Excel "resumo do pedido" (tipo nota)
   ▼
ENVIADO ──────────────► EM_VALIDACAO_SUPPLY
                            │
          ┌─────────────────┼──────────────────┐
          ▼                 ▼                  ▼
   APROVADO_SUPPLY   AJUSTADO_SUPPLY     RECUSADO_SUPPLY
   (sem alterações)  (houve edição)      (motivo obrigatório)
          │                 │                  │
          │                 ▼                  ▼
          │        AGUARDANDO_FR ◄─────────────┘
          │          │ FR aceita        │ FR recusa
          │          ▼                  ▼
          └──────► APROVADO ────► CANCELADO (FR faz novo pedido)
                      │
                      ▼
                 EM_PLANEJAMENTO_PCP
                      │ PCP conclui + agenda Teams
                      ▼
                 PLANO_CONCLUIDO
                      │
                      ▼
                 EM_RECEBIMENTO (Operações informa qtd física; OTIF atualiza)
                      │
                      ▼
                 PACKING_LIST
                      │ gerar invoice
                      ▼
                 INVOICE_GERADA
                      │ gerar arquivo SAP / NF emitida
                      ▼
                 CONCLUIDO
```

Toda mudança de status e toda edição de linha ficam registradas em um **histórico
(audit log)**: quem, quando, campo, valor anterior, valor novo. Isso é o que permite à
França ver exatamente o que Supply alterou.

## 4. Regras de negócio centrais

### 4.1 Antecedência de 60 dias
- Ao iniciar um pedido, a FR escolhe a **data esperada de embarque na fábrica** em um
  calendário que só habilita datas ≥ hoje + 60 dias (parâmetro configurável pelo Admin).
- A lista de itens só abre depois de a data ser informada, porque a data alimenta os
  cálculos de shelf life.

### 4.2 Shelf life × contract date (regra real, extraída das planilhas)

O contract date **não é por SKU**: é uma tabela por faixa de shelf life. Cada SKU tem seu
shelf life (aba `cadastros` / `PMD`) e a faixa define quantas semanas de validade o item
precisa ter ao chegar na França.

| Shelf life (dias) | Mín. semanas restantes na chegada | Dias mínimos restantes | Dias para produzir e embarcar | % mínima do shelf life |
|---|---|---|---|---|
| 365 | 28 | 196 | 169 | 54% |
| 210 | 17 | 119 | 91 | 57% |
| 180 | 15 | 105 | 75 | 58% |
| 150 | 13 | 91 | 59 | 61% |
| 120 | 11 | 77 | 43 | 64% |
| 90 | 9 | 63 | 27 | 70% |

Fonte: aba `contract date` da planilha de pedido (versão mais recente). A aba
`CONTRACT DATE` do arquivo da invoice tem valores antigos (210→18, 180→1, 120→11) e
será descartada. A tabela fica **editável pelo Admin**, com histórico de versões, porque
ela muda e cada pedido precisa guardar a versão que foi usada.

Cálculos (função pura testada, mesma no banco e na tela):

- **Data mínima de produção** = data de embarque − "dias para produzir e embarcar" da faixa
  (é exatamente a coluna `PRODUZIR APÓS` / `data minima de produção` da planilha atual).
- **Validade do lote** = data de produção + shelf life.
- **Semanas restantes na chegada** = (validade − data de chegada FR) / 7
  (a invoice hoje usa a *delivery date* como referência; o portal usa data de embarque +
  transit time, parametrizável).
- **Atende contract date?** = semanas restantes ≥ mínimo da faixa. Se não atende, o portal
  mostra o **% de conformidade** (semanas restantes / mínimo), igual à coluna
  `% of contract date compliance` da invoice.
- **Fonte oficial do shelf life é o SAP** (decisão de 10/11/2026); o cadastro da França
  é só referência e gera alerta quando diverge.
- SKU sem shelf life cadastrado aparece como **"SEM REGRA"** e bloqueia o envio até o
  Admin corrigir, em vez de passar em branco como hoje.

**Credit note.** Hoje a aba `CREDIT NOTE` calcula, para cada item fora do contract date,
se a França aceita e o valor de crédito sobre o COGS. O portal reproduz isso: quando um lote
embarcado não atende, a linha entra numa lista "aceite França" e o valor da credit note
é calculado a partir do COGS incluindo customs.

### 4.3 Múltiplos por caixa
- Cada SKU tem unidade de medida (UN, CX, KG…) e `multiplo_caixa`.
- No carrinho, a quantidade é sempre arredondada para múltiplos de caixa; o portal mostra
  "12 un = 2 caixas". Preços são "aproximados", com aviso claro de que a invoice final
  é o documento válido.

### 4.4 OTIF (calculado automaticamente a partir do recebimento)
Base de comparação: o **plano do PCP** (o que foi prometido), não o pedido original —
com a opção de alternar para "vs pedido original" na aba de KPIs.

| KPI | Fórmula |
|---|---|
| OTIF volume | Σ qtd recebida / Σ qtd planejada |
| OTIF SKU | nº de SKUs recebidos com qtd ≥ planejada / nº de SKUs planejados |
| OTIF shelf life | nº de linhas recebidas que atendem o contract date / nº de linhas recebidas |
| On-time | linhas recebidas até a data planejada / linhas planejadas |

Exibidos por pedido e consolidados por mês/semestre, com gráficos simples.

## 5. Módulos e telas

### 5.1 Comum
- Login com e-mail/senha (Supabase Auth), perfil vinculado ao usuário.
- Cabeçalho com status do pedido em forma de "linha do tempo" (etapas concluídas,
  atual, futuras) — é isso que torna o fluxo autoexplicativo.
- Painel inicial por perfil: "o que está esperando a minha ação".

### 5.2 França
1. **Novo pedido → passo 1: data de embarque** (calendário com dias bloqueados antes de
   hoje + 60; como o embarque sai sempre na segunda-feira, o calendário destaca as
   segundas e mostra a chegada prevista na França na quarta seguinte).
2. **Passo 2: portfólio** — cards/linhas com foto (opcional), SKU, descrição, UM, múltiplo
   por caixa, preço aproximado, shelf life, campo de quantidade com +/− por caixa, filtro
   por categoria, busca.
3. **Passo 3: carrinho** — resumo com subtotal por item, total estimado, peso/volume
   estimado (se tivermos dados de peso por caixa), editar quantidades, remover itens.
4. **Enviar pedido** — confirmação, geração do Excel "Resumo do Pedido" (modelo tipo
   nota: cabeçalho com nº do pedido, datas, loja; linhas com SKU, descrição, qtd, caixas,
   preço, total) e e-mail de notificação para Supply.
5. **Meus pedidos** — lista com status, acesso aos ajustes feitos por Supply (diff lado a
   lado: solicitado × ajustado), botões "Aceitar alterações" / "Recusar e cancelar".

### 5.3 Supply
- Fila de validação. Tela do pedido com edição completa: adicionar/remover SKU, alterar
  quantidade, alterar data de embarque, observação por linha e geral.
- Botões: **Aprovar sem alteração**, **Enviar ajustes para FR**, **Recusar** (motivo
  obrigatório).
- Aviso automático nas linhas em que a data mínima de produção já é inviável.

### 5.4 PCP
- Lista de pedidos aprovados. Grade por item com colunas:
  SKU · Qtd aprovada · **Data mínima de produção** · Data máxima de produção ·
  Qtd que será produzida · Data de produção · Validade calculada · Atende contract date ·
  Qtd não atendida · Motivo.
- Coluna "vamos atender?" com os valores que o PCP já usa: **SIM / AVALIAR / NÃO**, e
  campo de observação livre (ex.: "solicitar da Rodoluki", "problema com matéria-prima").
- Permite dividir uma linha em mais de um lote (datas diferentes).
- Visão alternativa em **programa semanal**: matriz SKU × semana ISO com as quantidades
  programadas (igual à aba `Planilha1` do controle de volume), somando "Programado" e
  comparando com "Demanda".
- Botão **Concluir plano** → bloqueia edição, gera resumo e abre a ação **Agendar reunião
  no Teams** (ver seção 7). O plano fica visível para FR, Supply e Operações.

### 5.5 Operações
1. **Recebimento** — mesma grade do plano, com campo "qtd recebida fisicamente", **lote**,
   data de fabricação e validade por linha; aceita vários recebimentos parciais. Ao salvar,
   a aba KPIs atualiza. Opção de importar o relatório de estoque por lote do SAP (mesmo
   formato da aba `BBE`: item, descrição, em estoque, UM, lote, fabricação, validade) para
   preencher lotes e validades de uma vez.
2. **KPIs** — OTIF volume, SKU, shelf life, on-time; por pedido e consolidado.
3. **Packing list** — espelha o padrão atual. Por pallet: nº, dimensões (padrão
   1,00 × 1,20 × 1,10 m), e linhas com ITEM ID, HS CODE, descrição EN, lote, unidade, qtd,
   peso líquido unitário, peso líquido total, caixas, peso bruto. O portal calcula sozinho
   a partir do cadastro (peso líquido/un, peso bruto/caixa de transporte) e soma a tara:
   master box + wrapping (21 kg = 5 + 16) e pallet (15 kg), ambos parametrizáveis.
   Cabeçalho com nº da invoice relacionada, destino (Dengo Europe SAS, VAT, telefone),
   fornecedor, total de pallets, peso bruto e líquido. Importação em lote via colar/CSV.
4. **Gerar invoice** — consolida o packing list por SKU + lote (chave `ITEM ID & LOTE`,
   como a fórmula atual). Colunas: item nº, ID Dengo, lote, BBE (validade do lote), HS
   code, cost type, descrição, caixas, peso líquido, qtd, unidade, peso bruto, preço BRL,
   total BRL, preço EUR, total EUR. Cabeçalho: data, nº, supplier/importer, incoterm (EXW),
   moeda, due date, **PTAX** do dia (preço EUR × PTAX = BRL), origem. Rodapé: pesos
   totais, dados bancários, transportadora. Exporta Excel e PDF no layout atual.
   Preço vem do cadastro (Interco Price EXW €); o COGS incl. customs fica guardado
   para a credit note.
5. **Arquivo SAP (dados para NF)** — exporta planilha com os campos necessários para
   a emissão da NF: cliente/CNPJ ou ID estrangeiro, incoterm, moeda, NCM, CFOP de
   exportação, código SAP do material, lote, qtd, UM, valor unitário/total, pesos, nº
   da invoice, nº do packing list, etc. A lista exata de campos será fechada com você
   (como key user SAP) a partir do que a transação de faturamento exige.

### 5.6 Admin
- Portfólio, importado da aba `PMD` (o "master data" de produto que hoje vem do Airtable):
  código SAP BR, código França (FR00xxx), código da ferramenta de pedido FR, descrição
  BR/EN/FR, família, categoria, status, unidade (Unit/Kg), shelf life, preço interco EXW €,
  COGS € incl. customs, qtd padrão por caixa, peso líquido/un, peso bruto/caixa, HS code
  (NCM), composição e percentuais (gordura/proteína do leite, amido, açúcar) usados na
  aba `FT` para a alfândega.
- Tabela de contract date por faixa de shelf life (ver 4.2), com versões.
- Tara de pallet, master box/wrapping, dimensões padrão.
- Parâmetros: antecedência (60 dias), transit time, lead time interno, e-mails de
  notificação.
- Usuários e perfis.
- Importação do portfólio e das tabelas por Excel/CSV (para carregar os arquivos que
  você já tem).

## 6. Modelo de dados (Postgres / Supabase)

```
perfil_usuario        (user_id, nome, perfil: fr|supply|pcp|operacoes|admin, ativo)
parametro             (chave, valor)                     -- 60 dias, transit, lead time
produto               (sku, descricao_pt, descricao_fr, um, multiplo_caixa, preco_aprox,
                       moeda, categoria, ncm, codigo_sap, peso_caixa_kg, ativo)
produto_codigo        (sku, sistema: sap_br|fr_item|fr_ordering_tool, codigo)   -- de-para
contract_date_regra   (versao, shelf_life_dias, min_semanas_chegada, dias_produzir_embarcar)
lote_estoque          (sku, lote, qtd, um, fabricacao, validade, importado_em)   -- aba BBE
pedido                (id, numero, criado_por, data_embarque, data_chegada_fr_prevista,
                       status, moeda, observacao, criado_em)
pedido_item           (pedido_id, sku, qtd_solicitada, qtd_aprovada, preco_aprox, obs)
pedido_evento         (pedido_id, de_status, para_status, usuario, motivo, data)
pedido_alteracao      (pedido_id, item/sku, campo, valor_antigo, valor_novo, usuario, data)
plano_producao        (pedido_id, sku, lote_seq, qtd_planejada, data_producao,
                       data_min_producao*, validade_calc*, atende_contract*, motivo_nao_atend)
recebimento           (plano_id, qtd_recebida, data_recebimento, usuario)
packing_list          (pedido_id, numero, data, tara_master_box, tara_pallet)
packing_list_pallet   (packing_list_id, numero, dimensoes, peso_bruto*, peso_liquido*)
packing_list_linha    (pallet_id, sku, lote, qtd, um, caixas, peso_liq_un*, peso_bruto*)
invoice               (pedido_id, numero, data, due_date, incoterm, moeda, ptax, totais…)
invoice_linha         (invoice_id, sku, lote, bbe, hs_code, qtd, caixas, pesos, preco_eur,
                       preco_brl*, semanas_restantes*, atende_contract*, pct_conformidade*)
credit_note           (invoice_linha_id, aceite_franca, cogs_eur, valor_credito*)
```
`*` colunas geradas por função SQL para garantir que o cálculo é o mesmo em todas as telas.
Segurança por **RLS**: cada perfil só lê/escreve o que a tabela de permissões permite
(a FR nunca vê pedidos de outras lojas, se houver mais de uma no futuro).

## 7. Integrações e documentos gerados

| Documento / ação | Como |
|---|---|
| Excel "Resumo do Pedido" | Gerado no navegador (biblioteca `exceljs`), também salvo no Storage do Supabase e anexado ao pedido |
| Packing list (Excel/PDF) | Mesma abordagem, com o layout do padrão que você enviar |
| Invoice comercial (Excel/PDF) | Consolidação do packing list; numeração sequencial própria |
| Arquivo SAP (Excel/CSV) | Layout fechado com você; opção futura de carga direta via LSMW/interface |
| Reunião Teams | Fase 1: botão abre o Outlook/Teams com convite pré-preenchido (título, participantes, pauta com link do pedido). Fase 2: integração com Microsoft Graph para criar a reunião automaticamente |
| Notificações por e-mail | Edge Function do Supabase (Resend ou SMTP corporativo) a cada mudança de status |

## 8. Stack técnica (reaproveitando a base deste repositório)

- **Front:** Vite + React + TypeScript + Tailwind, PWA, roteamento por perfil.
- **Back:** Supabase (Postgres, Auth, RLS, Storage, Edge Functions, Realtime).
- **Documentos:** `exceljs` para Excel, `pdf-lib` ou impressão HTML→PDF para PDF.
- **Deploy:** Vercel (front) + Supabase (dados). Domínio próprio, HTTPS.
- **Testes:** Vitest para as funções puras (shelf life, data mínima, OTIF, múltiplos por
  caixa) e testes de RLS em SQL.

Este repositório é dedicado ao portal. A estrutura, a configuração e o padrão de código
vêm do app gest-o-financeira (Vite + React + TS + Supabase), já validados em produção.

## 9. Fases de entrega

| Fase | Entrega | O que o usuário já consegue fazer |
|---|---|---|
| **0 — Fundação (1 semana)** | Repo, Supabase, auth, perfis, cadastro de portfólio, importação dos arquivos-base, parâmetros | Admin carrega portfólio, shelf life e contract date |
| **1 — Pedido FR (2 semanas)** | Calendário 60 dias, portfólio, carrinho, envio, Excel resumo, "Meus pedidos" | FR faz o pedido de ponta a ponta |
| **2 — Supply (1 semana)** | Fila, edição completa, aprovar/ajustar/recusar, diff para FR aceitar/recusar, audit log, e-mails | Ciclo FR ↔ Supply fechado |
| **3 — PCP (1–2 semanas)** | Grade de produção, data mínima, validade calculada, semáforo, lotes, concluir plano, convite Teams | Plano de produção validado contra o contract date |
| **4 — Operações (2 semanas)** | Recebimento, KPIs OTIF, packing list, invoice, arquivo SAP | Ciclo completo até a NF |
| **5 — Refino (1 semana)** | Tradução FR, dashboards consolidados, ajustes de usabilidade com os usuários reais | Go-live |

Cada fase termina com uma demonstração; o portal fica publicado desde a Fase 1 para
testes com o time.

## 10. O que os arquivos enviados mostraram

| Arquivo | O que é | Como entra no portal |
|---|---|---|
| `INVOICE_SHIP_2611.xlsx` (12 abas) | A "planilha-mãe" do embarque. `PACKING LIST` é digitada; `INVOICE` é toda fórmula em cima dela + `PMD` + `BBE`; `CONTRACT DATE`, `CREDIT NOTE`, `FT`, `BULK`, `CROSS DOCK`, `PCT` são derivadas | Vira o módulo Operações inteiro (seção 5.5). `PMD` e `PRODUCT INFO` alimentam o cadastro; `BBE` é o estoque por lote do SAP |
| `INVOICE_SHIP_2611_108321.pdf` | Layout final da invoice comercial | Modelo do PDF/Excel gerado |
| `pl_SHIP_2611.pdf` | Layout final do packing list, uma página por pallet | Modelo do PDF/Excel gerado |
| `pedido_de_novembro_ship_1126.xlsx` | Modelo vazio do pedido (data de embarque, itens, cálculos de data mínima) | É exatamente o fluxo FR → PCP que o portal substitui |
| `VOLUME_SHIP_2610 - controle BR.xlsx` | O mesmo modelo preenchido: 30 itens, plano do PCP (SIM/AVALIAR, semana, obs) e programa semanal | Base para validar os cálculos do portal contra um caso real |

**Portfólio inicial.** O portfólio disponível para pedido no portal é a lista de SKUs
efetivamente embarcados para a França nos últimos 10 meses (dinâmica SKU × soma de
quantidade, pouco mais de 100 SKUs: barras 20 g e 80 g, bombons, quebra-quebra to go e
a granel, drágeas, trufas, gotas, ribbons, panetones, ovos, latas). Regras:

- Esses SKUs nascem com status **ativo**; os demais itens do `PMD`/`cadastros` ficam
  cadastrados mas **inativos**, e o Admin ativa quando um item novo entrar.
- A quantidade dos últimos 10 meses fica guardada por SKU e aparece para a França como
  referência ("você pediu X nos últimos 10 meses") e para Supply como sinal de item fora
  do padrão.
- O portal recalcula essa lista a cada embarque concluído, então o portfólio "vivo" passa a
  ser "SKUs embarcados na janela de N meses" (N parametrizável, padrão 10).

Pontos importantes que os arquivos revelaram:

- **Há pelo menos três sistemas de código** para o mesmo produto: código SAP BR
  (1000xxx, 1300xxx, 2000xxx, 5200xxx), código França (FR00xxx) e o código da ferramenta
  de pedido da França (coluna "Product Search Field" do `PMD`). O portal precisa de uma
  tabela de-para e sempre mostrar o código SAP e o código FR lado a lado.
- A aba `PCT` mostra que a França concilia a invoice contra o **nº de purchase order** dela
  (`Ship.202406-PA00143`). Vale ter um campo "PO França" no pedido.
- O preço interco vem do `PMD` (Interco Price EXW €) e a aba `3TRI INTERCOMP PRICES` é a
  tabela trimestral. O portal guarda preço com vigência (trimestre).
- A conversão para BRL usa a **PTAX** informada manualmente na invoice. O portal pode buscar
  a PTAX do dia automaticamente na API do Banco Central, com opção de sobrescrever.
- A invoice de novembro teve 42 itens, 8 pallets, 1.593 kg brutos, € 24.178,71.

## 11. Pontos a confirmar com você

- Lead time interno entre produção e embarque (qualidade, paletização).
- Confirmar que a tabela de contract date da planilha de pedido (28/17/15/13/11/9 semanas)
  é a vigente, e quem pode alterá-la. Faixas que aparecem no histórico e não têm regra:
  360, 500, 100 e 135 dias.
- Qual código a França deve enxergar no portal: FR00xxx, o código da ferramenta de pedido
  ou os dois.
- Se o OTIF deve comparar com o plano do PCP ou com o pedido original (proposta: plano,
  com opção de alternar).
- Campos exatos exigidos pelo SAP para a NF de exportação (vamos listar juntos a partir
  da transação usada). Dos arquivos já temos: código do material, lote, qtd, UM, NCM,
  valor EUR, PTAX, valor BRL, pesos líquido/bruto, incoterm, dados do importador e da
  transportadora.
- Se a França terá mais de um usuário/loja e se Supply pode criar pedido em nome da FR.
- Se a credit note deve ser gerada pelo portal ou só calculada e exportada.
