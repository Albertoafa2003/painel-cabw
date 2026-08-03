# Importação mensal — Materiais Reparáveis

Versão do painel: **20260803-r4**

## Base incluída no pacote
- Arquivo: `CONTROLE REPARO - SGT ROZENDO - 03082026.xlsx`
- Aba: `BD Monitoramento`
- Competência: 03/08/2026
- Registros ativos: **113**
- POs iniciadas em 24T: **0**

## Regras aplicadas
1. POs iniciadas em `24T` são excluídas do painel. Na importação Firestore, registros antigos 24T são arquivados.
2. A data de vencimento do TDR é a data existente na coluna M.
3. Coluna N com `none` ou data significa TDR entregue.
4. Coluna N vazia e data atual posterior à coluna M significa TDR atrasado.
5. Coluna O com `none` significa subprocesso não necessário.
6. Coluna P com `none` significa ficha não necessária.
7. Colunas O e P vazias significam TDR ainda não recebido.
8. A TTE é exibida no detalhamento quando válida, sem atribuição automática de moeda.

## Publicação
1. Extraia todo o ZIP na raiz do repositório.
2. Confirme que `governanca-reparaveis.html` e os arquivos `assets/js/repair-*` aparecem como modificados no commit.
3. Publique as regras do arquivo `FIRESTORE_REGRAS_MATERIAIS_REPARAVEIS.txt`.
4. Após o deploy, use `Ctrl + F5`. O script possui cache-busting `?v=20260803-r4`.
