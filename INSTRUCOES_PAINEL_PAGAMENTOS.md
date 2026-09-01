# Painel CABW — Acompanhamento de Pagamentos a Fornecedores

## Finalidade

O painel acompanha o ciclo de pagamento de faturas e invoices dos fornecedores da CABW, desde o recebimento e a conferência documental até o pagamento efetivo.

## Segurança da informação

O GitHub Pages hospeda somente a interface. A base financeira não é incorporada aos arquivos públicos do repositório. Os registros ficam exclusivamente nas coleções protegidas do Cloud Firestore:

- `supplierPayments`
- `supplierPaymentsConfig`
- `supplierPaymentImports`

Antes do primeiro cadastro ou importação, publique o conteúdo de `FIRESTORE_REGRAS_PAGAMENTOS.txt` nas regras do Firestore, preservando as funções `isAuthorizedEmail()` e `isAdmin()` já existentes.

## Formas de alimentação

### Cadastro manual

Um administrador pode utilizar **Cadastrar pagamento**. O formulário exige:

- fornecedor;
- status;
- ao menos um identificador entre NUP, Contrato/PAG, Empenho/PO ou Fatura/Invoice.

### Importação de planilha

O botão **Importar planilha** aceita arquivos `.xlsx`, `.xls` e `.csv`. O sistema procura automaticamente uma aba cujo nome contenha “pagamento”, “financeiro”, “base” ou “BD”; também é possível informar o nome da aba.

O botão **Baixar modelo CSV** gera somente os cabeçalhos aceitos:

1. ID PAGAMENTO (opcional, mas recomendado para uma chave permanente)
2. FORNECEDOR
3. NUP
4. CONTRATO OU PAG
5. EMPENHO OU PO
6. FATURA OU INVOICE
7. TIPO DO DOCUMENTO
8. MOEDA
9. VALOR BRUTO
10. RETENCOES OU DESCONTOS
11. VALOR LIQUIDO
12. DATA DE EMISSAO
13. DATA DE RECEBIMENTO
14. DATA DE VENCIMENTO
15. PREVISAO DE PAGAMENTO
16. DATA DO PAGAMENTO
17. STATUS
18. UNIDADE DEMANDANTE
19. RESPONSAVEL
20. REFERENCIA DO PAGAMENTO
21. OBSERVACOES

A importação gera uma chave determinística com os identificadores do registro. Reimportar o mesmo pagamento atualiza o documento existente, em vez de criar uma duplicidade. Registros ausentes de uma importação posterior não são excluídos automaticamente.

## Status oficiais

- Fatura recebida
- Em conferência documental
- Pendência documental
- Aguardando atesto
- Aguardando liquidação
- Aguardando autorização de pagamento
- Pagamento programado
- Pago
- Suspenso
- Cancelado

## Situação do prazo

- `Pago no prazo`: data do pagamento igual ou anterior ao vencimento.
- `Pago com atraso`: data do pagamento posterior ao vencimento.
- `Vencido e não pago`: data atual posterior ao vencimento e ausência de pagamento.
- `Vence hoje`, `vence em até 7 dias` e `vence em até 30 dias`: alertas preventivos.
- `Sem vencimento informado`: não é classificado automaticamente como atraso.
- `Suspenso` e `Cancelado`: preservam a situação administrativa informada.

## Relatórios

- **PDF gerencial**: indicadores, distribuição por status, prazos, moedas e fornecedores com valores pendentes.
- **PDF detalhado**: todos os campos dos registros resultantes dos filtros, em formato A3 horizontal.

Valores de moedas diferentes são sempre apresentados separadamente, sem conversão automática.
