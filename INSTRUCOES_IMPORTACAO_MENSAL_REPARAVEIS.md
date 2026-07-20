# Importação mensal — Materiais Reparáveis

## Pré-requisitos

1. Publicar as regras contidas em `FIRESTORE_REGRAS_MATERIAIS_REPARAVEIS.txt`.
2. Entrar no Painel CABW com usuário presente na coleção `admins`.
3. Usar planilha `.xlsx` com a aba `BD Monitoramento` e os mesmos cabeçalhos da fonte atual.

## Procedimento

1. Acesse **Governança > Materiais Reparáveis**.
2. Clique em **Importar planilha mensal**.
3. Selecione o arquivo `.xlsx`.
4. Confirme ou ajuste a data de competência.
5. Clique em **Pré-visualizar**.
6. Confira arquivo, competência, linhas válidas, novas, alteradas, sem alteração, rejeitadas e ausentes.
7. Leia os avisos de qualidade.
8. Clique em **Confirmar importação**.

## Regras de processamento

- A chave é `PO + REQUISIÇÃO + PN + SN`, normalizada e transformada em SHA-256.
- Reimportar o mesmo arquivo não duplica itens.
- Campos manuais não existentes na planilha são preservados.
- Registros ausentes do novo arquivo não são excluídos. Eles ficam preservados e podem ser consultados com o filtro **Incluir registros ausentes do lote atual**.
- O lote atual usa uma única gravação atômica para até 450 registros. Acima disso, a importação é interrompida antes de qualquer gravação.
- O prazo do TDR é recalculado em 45 dias corridos a partir do recebimento no reparador.
- `SUBPROC #`, `FICHA RECEBIDA`, `OBS` e `ALERTA PRÓXIMA ETAPA` não são importados.

## Base inicial do pacote

- Arquivo: `CONTROLE REPARO - SGT ROZENDO - 20072026(1).xlsx`
- Aba: `BD Monitoramento`
- Linhas válidas: 274, correspondentes às linhas 2 a 275.
- Registros únicos: 274.
- Linhas posteriores apenas com fórmulas/espaços são ignoradas.
