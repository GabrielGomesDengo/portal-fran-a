# Dados-semente (extraídos das planilhas atuais em 10/11/2026)

| Arquivo | Origem | Conteúdo |
|---|---|---|
| `cadastros_shelf_life.csv` | aba `cadastros` do controle de volume SHIP 2610 | SKU SAP, descrição BR e shelf life (dias). Só os 1.818 SKUs com shelf informado (a aba tem 8.872 materiais). |
| `pmd_produtos.csv` | aba `PMD` da planilha da invoice SHIP 2611 (master data da França, origem Airtable) | 291 produtos: código da ferramenta de pedido FR, SKU SAP, descrições EN/FR, família, unidade, shelf, preço interco EXW €, COGS €, qtd por caixa, pesos, HS code. |
| `product_info_fr.csv` | aba `PRODUCT INFO` | 126 itens com código França FR00xxx, descrições e preço €. |
| `divergencias_shelf_life.csv` | cruzamento dos dois primeiros | 52 SKUs em que o shelf life do SAP difere do cadastro da França. **Precisa de decisão antes da carga.** |

**Decisão (10/11/2026): shelf life oficial = SAP (`cadastros`).** O valor do `PMD` fica como
referência e gera alerta no Admin enquanto divergir.

## Histórico real (export de NFs do SAP para Dengo Europe SAS, jan–nov/2026)

| Arquivo | Conteúdo |
|---|---|
| `portfolio_franca_10_meses.csv` | **Portfólio ativo inicial**: 131 SKUs embarcados em 18 NFs autorizadas entre 14/01 e 03/11/2026, com quantidade total, nº de embarques, último embarque, shelf life, preço interco e HS code. Todos têm shelf life no SAP; 5 não existem no PMD da França (barras 80 g 1000019/1000054 e trufas kg 1000122/1000123/1000125). |
| `historico_embarques_2026.csv` | 591 linhas de NF com lote, produção, vencimento, quantidade e o cálculo de aderência ao contract date (dias restantes na data da NF × mínimo da faixa). Serve de **baseline do OTIF de shelf life** e de massa de teste do motor de cálculo. |

Observação sobre o histórico: o export traz NFs com as mesmas linhas em datas próximas
(ex.: 107587 / 107598 / 107657 e 108315 / 108317 / 108321), o que parece ser reemissão ou
complemento de NF. As quantidades de 10 meses do portfólio somam todas elas; antes da carga
final confirmar quais NFs ficaram válidas para não contar em dobro.
