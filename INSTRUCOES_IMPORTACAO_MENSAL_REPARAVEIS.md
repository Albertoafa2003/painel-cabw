# Importação mensal — Materiais Reparáveis

Versão do painel: **20260921-reparaveis-r1**

## Base vigente incluída no pacote
- Arquivo-base: `CONTROLE REPARO - SGT ROZENDO - atz PAINEL 21SET.xlsx`
- Aba preferencial: `PO's 2025 - 2026`
- Aba compatível legada: `BD Monitoramento`
- Referência: **21/09/2026**
- Registros ativos: **160**
- POs únicas: **81**
- Chave estável: **PO + REQUISIÇÃO + PN + SN**
- POs iniciadas em `24T` continuam fora do escopo.

## Regras de status e etapa visual
| Status Real | Etapa Visual |
|---|---|
| 1-Empenho Aprovado | Brasil/ OM Requisitante |
| 2-Item Chegou CTLA | Brasil / CTLA |
| 3-Item Exp CTLA | Trânsito ao Reparador |
| 4-Item chegou CABW/CABE | Trânsito ao Reparador |
| 5-Item Exp Reparador | Trânsito ao Reparador |
| 6-Item no Reparador | Reparador |
| 7-Item Recebido | CABW/CABE (retorno) |
| 8-Embarcado | CABW/CABE (retorno) |
| 9-Recebido Parque | Brasil/ OM Requisitante |
| 10-Encerrado | Brasil/ OM Requisitante |

Variações observadas na planilha são canonicalizadas, inclusive `3-Rep chegou CTLA` → `2-Item Chegou CTLA`, `3-Item Exp pelo CTLA` → `3-Item Exp CTLA` e `5-Item Exp ao Reparador` → `5-Item Exp Reparador`. O valor original é mantido em `realStatusSource`.

## Prazos e retorno
- `SVC AUTORIZADO / SOL RETORNO AS IS`, `PRAZO ENTREGA (DIAS)` e `DPE FINAL` definem o prazo de retorno.
- `RETORNO MAT` registra o retorno efetivo.
- Sem autorização, prazo ou DPE suficientes, o item é tratado como **sem prazo de retorno**, e não como atrasado.
- Retorno posterior à DPE = **retornou com atraso**.
- DPE vencida sem retorno = **atrasado — sem retorno**.

## Correções confirmadas que prevalecem sobre a planilha
Por decisão expressa do usuário em **21/09/2026 (Opção B)**:
1. PO `25T000160`: manter `SVC AUTORIZADO / SOL RETORNO AS IS` em **13/07/2025**.
2. PO `26T000910`: manter NUP **67102.260284/2026-61**.
3. PO `26T000915`: manter NUP **67102.260285/2026-14**.
4. PO `26T000800`: DPE vazia permanece tratada como ausência de prazo.

## NUP e COTAÇÃO SISCAB
- O NUP é lido da coluna `NUP (PAG)` da base de 21/09/2026.
- A base atual não contém coluna de `COTAÇÃO SISCAB`; por isso, esse campo é preservado para os **113 registros pré-existentes** quando já disponível na base suplementar de 27/08/2026.
- Novos itens sem COTAÇÃO SISCAB permanecem como **Não informado**.

## Parque / OM
Os dois primeiros caracteres da requisição continuam sendo normalizados:
- EL = PAME-RJ
- GL = PAMA-GL
- PB = PAMB-RJ
- SP = PAMA-SP

## Importação pelo painel
O importador aceita a aba `PO's 2025 - 2026` e mantém compatibilidade com `BD Monitoramento`. A operação faz upsert pela chave estável e não exclui automaticamente registros ausentes. Campos manuais do Firestore continuam preservados.

## Publicação
1. Extraia todo o ZIP na raiz do repositório.
2. Confirme as alterações em `governanca-reparaveis.html`, `assets/js/repair-import-core.js`, `assets/js/repair-processes-panel.js`, `assets/js/repair-processes-current-data.js` e `assets/data/repair-processes-current.json`.
3. Após o deploy, use `Ctrl + F5`.
