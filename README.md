# Portal de Pedidos França — Dengo

Portal web para a loja da França montar pedidos à fábrica, com validação por Supply,
planejamento de produção pelo PCP (shelf life × contract date), conferência de
recebimento e OTIF pelo time de Operações, packing list, invoice e arquivo para NF no SAP.

- Plano de construção: [docs/PLANO_PORTAL_PEDIDOS_FR.md](docs/PLANO_PORTAL_PEDIDOS_FR.md)
- Dados-semente e decisões de carga: [data/seed/README.md](data/seed/README.md)

**Stack:** Vite + React 19 + TypeScript + Tailwind v4 · Supabase (Auth + Postgres + RLS) ·
ExcelJS · Vitest · Vercel.

## Rodando localmente

```bash
cp .env.example .env      # preencha VITE_SUPABASE_ANON_KEY (Supabase > Project Settings > API)
npm install
npm run dev
```

Outros comandos: `npm run build`, `npm run preview`, `npm test`, `npm run typecheck`.

## Banco (Supabase)

Projeto `portal-franca` (ref `qrmoovmqxmnbuhzjdwyd`, região São Paulo). As migrations em
`supabase/migrations/` já estão aplicadas: `001_schema.sql` (tabelas, enum de status,
função `minimo_dias_chegada` que espelha o motor TS) e `002_rls.sql` (políticas por perfil).

Carga inicial feita a partir de `data/seed/`: 292 produtos (131 ativos = portfólio dos
últimos 10 meses), parâmetros e tabela de contract date versão 1.

## Perfis e primeiro acesso

Quem cria conta entra como **França** e **inativo**. Um Admin ativa e define o perfil em
*Usuários*. O primeiro Admin é promovido por SQL:

```sql
update perfil_usuario set perfil = 'admin', ativo = true where email = 'seu@email';
```

## Deploy na Vercel

Produção: **https://portal-fran-a.vercel.app** (projeto `portal-fran-a` no time dengo-projects1; cada push na `main` publica sozinho).

Importar o repositório (framework Vite), cadastrar `VITE_SUPABASE_URL` e
`VITE_SUPABASE_ANON_KEY`. `vercel.json` reescreve as rotas para `index.html`. No Supabase,
adicionar a URL da Vercel em *Authentication > URL Configuration*.

## Estrutura

```
src/
  dominio/contractDate.ts   # motor shelf life × contract date (regra proporcional), testado contra 386 linhas reais
  dominio/caixas.ts         # arredondamento para múltiplos de caixa
  dominio/calendario.ts     # datas civis 'yyyy-MM-dd' sem Date
  dados/                    # acesso ao Supabase (produtos, pedidos, parâmetros, contract date)
  documentos/resumoPedido.ts# Excel "Resumo do Pedido"
  telas/pedidos/            # NovoPedido (data → itens → carrinho → envio), Pedidos, Pedido
  telas/admin/              # Portfólio, Parâmetros + contract date, Usuários
  components/               # Layout por perfil, rotas protegidas, linha do tempo do pedido
supabase/migrations/        # esquema e RLS
data/seed/                  # CSVs extraídos das planilhas atuais
```

## Estado das fases

- [x] Fase 0 — fundação: repo, Supabase, auth, perfis, portfólio, parâmetros, carga inicial
- [x] Fase 1 — pedido França: calendário 60 dias, portfólio, carrinho, envio, Excel do pedido
- [x] Fase 2 — Supply: edição completa, aprovar/ajustar/recusar, aceite da França, trilha de alterações; Admin reabre ou reprova pedido aprovado
- [x] Fase 3 — PCP: janela mínima (contract date) e máxima (estoque D+1, 7 dias antes do embarque), lotes, programa semanal, convite no Teams; plano segue editável após concluir
- [x] Fase 4 — Operações: recebimento com confirmação de lote/fabricação/quantidade, OTIF (volume, SKU, shelf life, on-time), KPIs, packing list e invoice em PDF/Excel, credit note
- [ ] Arquivo para NF no SAP — versão preliminar com 24 campos; aguardando a lista oficial de campos
- [ ] Notificações por e-mail — aguardando definição do provedor
- [ ] Fase 5 — tradução FR, dashboards, refino com usuários
