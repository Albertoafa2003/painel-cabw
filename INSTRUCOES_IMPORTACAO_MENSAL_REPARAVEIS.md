# Importação mensal — Materiais Reparáveis

Versão do painel: **20260819-status-r1**

## Base cadastral incluída no pacote
- Arquivo-base: `CONTROLE REPARO - SGT ROZENDO - 03082026.xlsx`
- Aba-base: `BD Monitoramento`
- Referência dos dados cadastrais: 03/08/2026
- Registros ativos: **113**
- POs iniciadas em 24T: **0**

## Atualização de status e localização
- Arquivo de status: `19AGO V3 - CONTROLE REPARO - SGT ROZENDO.xlsx`
- Aba: `BD Monitoramento`
- Referência: **19/08/2026**
- Linhas atualizadas: **113**
- POs únicas: **60**
- Chave de correspondência: **PO**
- Planilha de correlação: `Correlação.xlsx`

A Etapa Visual é derivada exclusivamente do Status Real e representa a localização do material. Por isso, uma mesma etapa pode abranger mais de um status.

### Status Real e Etapa Visual oficiais
| Status Real | Etapa Visual |
|---|---|
| 1-Empenho Aprovado | Brasil/ OM Requisitante |
| 2-Item Chegou CTLA | Brasil / CTLA |
| 3-Item Exp CTLA | Trânsito ao Reparador |
| 4-Item chegou CABW/CABE | Trânsito ao Reparador |
| 5-Item Exp Reparador | Trânsito ao Reparador |
| 6-Item no Reparador | Reparador |
| 7-Item Recebido | CABW/CABE (retorno) |
| 8-Embarcado | ETAPA NÃO MAPEADA |
| 9-Recebido Parque | ETAPA NÃO MAPEADA |
| 10-Encerrado | ETAPA NÃO MAPEADA |

Variações de escrita presentes nas planilhas são canonicalizadas, mantendo o valor original em `realStatusSource` para auditoria.

## Regras mantidas
1. POs iniciadas em `24T` são excluídas do painel. Na importação Firestore, registros antigos 24T são arquivados.
2. A data de vencimento do TDR é a data existente na coluna M.
3. Coluna N com `none` ou data significa TDR entregue.
4. Coluna N vazia e data atual posterior à coluna M significa TDR atrasado.
5. Coluna O com `none` significa subprocesso não necessário.
6. Coluna P com `none` significa ficha não necessária.
7. Colunas O e P vazias significam TDR ainda não recebido.
8. A TTE é exibida no detalhamento quando válida, sem atribuição automática de moeda.
9. A condição `EXCHANGE` permanece fora das opções ativas.
10. Campos manuais gravados no Firestore são preservados quando a base local mais recente é exibida.

## Publicação
1. Extraia todo o ZIP na raiz do repositório.
2. Confirme que `governanca-reparaveis.html`, `assets/js/repair-import-core.js`, `assets/js/repair-processes-panel.js`, `assets/js/repair-processes-current-data.js` e `assets/data/repair-processes-current.json` aparecem como modificados no commit.
3. Publique as regras do arquivo `FIRESTORE_REGRAS_MATERIAIS_REPARAVEIS.txt`, caso ainda não estejam vigentes.
4. Após o deploy, use `Ctrl + F5`. O script possui cache-busting `?v=20260819-status-r1`.


## Regra de prazo e atraso do retorno — atualização de 20/08/2026

- **SVC AUTORIZADO / SOL RETORNO AS IS**: data da autorização do serviço ou do retorno AS IS.
- **PRAZO ENTREGA (DIAS)**: quantidade de dias concedida para o retorno.
- **DPE FINAL**: data final para a entrega do item.
- **RETORNO MAT**: data em que o material efetivamente retornou.
- Se qualquer um dos três elementos necessários para o prazo — autorização, quantidade de dias ou DPE — não estiver informado, o item deve ser classificado como **serviço ainda não autorizado / sem prazo de retorno**, sem atraso.
- Se a data de retorno for posterior à DPE, classificar como **item retornou com atraso**.
- Se não houver data de retorno e a data atual for posterior à DPE, classificar como **retorno atrasado — item ainda não retornou**.
- Se a data de retorno for igual ou anterior à DPE, classificar como **item retornou no prazo**.
- Correções confirmadas: PO `25T000160` com autorização em `13/07/2025`; PO `26T000800` com `#REF!` tratado como campo vazio.
- A etapa visual `10-Encerrado` corresponde a **Brasil/ OM Requisitante**.
