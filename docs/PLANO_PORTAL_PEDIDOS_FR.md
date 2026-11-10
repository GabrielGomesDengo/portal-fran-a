# Plano de construção — Portal de Pedidos França (Dengo)

> Versão 0.1 — 10/11/2026. Documento vivo: será revisado assim que os arquivos-base
> (packing list, invoice, lista de itens, shelf life, contract date) forem enviados.

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

### 4.2 Shelf life × contract date
Definições por SKU (cadastradas pelo Admin a partir dos arquivos que você vai enviar):

| Campo | Significado |
|---|---|
| `shelf_life_dias` | Validade total do produto a partir da data de produção |
| `contract_date_dias` | Validade mínima restante que o item precisa ter **na chegada à França** (pode ser em dias ou em % da validade total; o portal aceita os dois e converte para dias) |
| `transit_dias` | Tempo entre embarque na fábrica e chegada na FR (parâmetro global, com possibilidade de sobrescrever por pedido) |

Cálculos (feitos no banco/função pura, exibidos em todas as telas relevantes):

- **Data prevista de chegada FR** = data de embarque + `transit_dias`
- **Validade restante na chegada** = (data de produção + `shelf_life_dias`) − data de chegada FR
- **Atende contract date?** = validade restante na chegada ≥ `contract_date_dias`
- **Data mínima de produção** (coluna do PCP) = data de chegada FR + `contract_date_dias` − `shelf_life_dias`
  - Se essa data for anterior a hoje, o item já é alertado como "impossível atender o
    contract date com a data de embarque atual" ainda na fase de Supply.
- **Data máxima de produção** = data de embarque − lead time interno (parâmetro, p.ex. dias
  para liberação de qualidade e paletização).

Assim que o PCP digita a data de produção de uma linha, o portal mostra no mesmo instante
a validade calculada e um semáforo (verde atende / vermelho não atende / amarelo na margem).

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
   hoje + 60; mostra a data prevista de chegada FR).
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
- Permite dividir uma linha em mais de um lote (datas diferentes).
- Botão **Concluir plano** → bloqueia edição, gera resumo e abre a ação **Agendar reunião
  no Teams** (ver seção 7). O plano fica visível para FR, Supply e Operações.

### 5.5 Operações
1. **Recebimento** — mesma grade do plano, com campo "qtd recebida fisicamente" e data de
   recebimento por linha/lote; aceita vários recebimentos parciais. Ao salvar, a aba KPIs
   atualiza.
2. **KPIs** — OTIF volume, SKU, shelf life, on-time; por pedido e consolidado.
3. **Packing list** — cadastro por pallet: nº pallet, SKU, lote, validade, qtd caixas,
   qtd unidades, peso líquido/bruto, dimensões; totais automáticos; importação em lote
   via colar/CSV. Layout espelha o padrão de packing list que você vai enviar.
4. **Gerar invoice** — consolida o packing list por SKU (qtd total, preço unitário,
   total, moeda, incoterm, dados do exportador/importador, pesos totais, nº de pallets)
   no layout da invoice padrão. Exporta Excel e PDF.
5. **Arquivo SAP (dados para NF)** — exporta planilha com os campos necessários para
   a emissão da NF: cliente/CNPJ ou ID estrangeiro, incoterm, moeda, NCM, CFOP de
   exportação, código SAP do material, lote, qtd, UM, valor unitário/total, pesos, nº
   da invoice, nº do packing list, etc. A lista exata de campos será fechada com você
   (como key user SAP) a partir do que a transação de faturamento exige.

### 5.6 Admin
- Portfólio (SKU, descrição PT/FR, UM, múltiplo caixa, preço aprox., moeda, categoria,
  NCM, código SAP, peso por caixa, ativo/inativo).
- Shelf life e contract date por SKU.
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
produto_validade      (sku, shelf_life_dias, contract_date_dias | contract_date_pct)
pedido                (id, numero, criado_por, data_embarque, data_chegada_fr_prevista,
                       status, moeda, observacao, criado_em)
pedido_item           (pedido_id, sku, qtd_solicitada, qtd_aprovada, preco_aprox, obs)
pedido_evento         (pedido_id, de_status, para_status, usuario, motivo, data)
pedido_alteracao      (pedido_id, item/sku, campo, valor_antigo, valor_novo, usuario, data)
plano_producao        (pedido_id, sku, lote_seq, qtd_planejada, data_producao,
                       data_min_producao*, validade_calc*, atende_contract*, motivo_nao_atend)
recebimento           (plano_id, qtd_recebida, data_recebimento, usuario)
packing_list          (pedido_id, numero, data) / packing_list_pallet (…) 
invoice               (pedido_id, numero, data, incoterm, moeda, totais…)
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

## 10. O que preciso dos arquivos que você vai enviar

1. **Lista de itens** — SKU, descrição, UM, múltiplo por caixa, preço aproximado e moeda,
   categoria, peso por caixa (se existir), código SAP e NCM.
2. **Shelf life** — validade total por SKU (dias).
3. **Contract date** — regra mínima de validade na chegada, por SKU ou geral (dias ou %).
4. **Padrão do packing list** — para espelhar colunas, totais e layout.
5. **Padrão da invoice** — cabeçalho (exportador, importador, incoterm, moeda, banco),
   colunas e rodapé.
6. **Planilha de pedido atual** — para garantir que nada do processo de hoje fique de fora.

## 11. Pontos a confirmar com você

- Transit time padrão fábrica → França (dias) e se varia por modal.
- Lead time interno entre produção e embarque (qualidade, paletização).
- Moeda do preço aproximado (EUR ou BRL) e da invoice.
- Se o contract date é em dias ou em % do shelf life.
- Se o OTIF deve comparar com o plano do PCP ou com o pedido original (proposta: plano,
  com opção de alternar).
- Campos exatos exigidos pelo SAP para a NF de exportação (vamos listar juntos a partir
  da transação usada).
- Se a França terá mais de um usuário/loja e se Supply pode criar pedido em nome da FR.
