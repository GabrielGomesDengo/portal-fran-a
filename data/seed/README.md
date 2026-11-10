# Dados-semente (extraídos das planilhas atuais em 10/11/2026)

| Arquivo | Origem | Conteúdo |
|---|---|---|
| `cadastros_shelf_life.csv` | aba `cadastros` do controle de volume SHIP 2610 | SKU SAP, descrição BR e shelf life (dias). Só os 1.818 SKUs com shelf informado (a aba tem 8.872 materiais). |
| `pmd_produtos.csv` | aba `PMD` da planilha da invoice SHIP 2611 (master data da França, origem Airtable) | 291 produtos: código da ferramenta de pedido FR, SKU SAP, descrições EN/FR, família, unidade, shelf, preço interco EXW €, COGS €, qtd por caixa, pesos, HS code. |
| `product_info_fr.csv` | aba `PRODUCT INFO` | 126 itens com código França FR00xxx, descrições e preço €. |
| `divergencias_shelf_life.csv` | cruzamento dos dois primeiros | 52 SKUs em que o shelf life do SAP difere do cadastro da França. **Precisa de decisão antes da carga.** |

Regra de carga proposta: shelf life oficial = `cadastros` (SAP). O valor do `PMD` fica como
referência e gera alerta no Admin enquanto divergir.
