
document.addEventListener('DOMContentLoaded', function () {
  var receivedData = [{"Ação": "20XV", "Descrição": "OPERAÇÃO E MANUTENÇÃO DE EQUIPAMENTOS DO SISCEAB", "Crédito Recebido em 2026": "US$ 84.468.792,70", "Crédito Disponível": "US$ 263.583,93", "Crédito Disponível Número": 263583.93, "Crédito Recebido Número": 84468792.7, "% do Recebido": "70,93%", "% Disponível s/ Recebido": "0,31%", "Diferença": "US$ 84.205.208,77"}, {"Ação": "2048", "Descrição": "MANUTENÇÃO E SUPRIMENTO DE MATERIAL AERONÁUTICO", "Crédito Recebido em 2026": "US$ 24.944.419,86", "Crédito Disponível": "US$ 632.284,84", "Crédito Disponível Número": 632284.84, "Crédito Recebido Número": 24944419.86, "% do Recebido": "20,95%", "% Disponível s/ Recebido": "2,53%", "Diferença": "US$ 24.312.135,02"}, {"Ação": "20IH", "Descrição": "MODERNIZAÇÃO E REVITALIZAÇÃO DE AERONAVE - T2 / MODERNIZAÇÃO E REVITALIZAÇÃO DE AERONAVE - C97", "Crédito Recebido em 2026": "US$ 1.607.332,65", "Crédito Disponível": "US$ 2.272,54", "Crédito Disponível Número": 2272.54, "Crédito Recebido Número": 1607332.65, "% do Recebido": "1,35%", "% Disponível s/ Recebido": "0,14%", "Diferença": "US$ 1.605.060,11"}, {"Ação": "2004", "Descrição": "ASSISTÊNCIA MÉDICA E ODONTOLÓGICA", "Crédito Recebido em 2026": "US$ 1.554.552,73", "Crédito Disponível": "US$ 452.147,62", "Crédito Disponível Número": 452147.62, "Crédito Recebido Número": 1554552.73, "% do Recebido": "1,31%", "% Disponível s/ Recebido": "29,09%", "Diferença": "US$ 1.102.405,11"}, {"Ação": "21EM", "Descrição": "EMPREGO DAS FORÇAS ARMADAS", "Crédito Recebido em 2026": "US$ 1.546.423,32", "Crédito Disponível": "US$ 0,00", "Crédito Disponível Número": 0.0, "Crédito Recebido Número": 1546423.32, "% do Recebido": "1,30%", "% Disponível s/ Recebido": "0,00%", "Diferença": "US$ 1.546.423,32"}, {"Ação": "2000", "Descrição": "ADMINISTRAÇÃO DA UNIDADE", "Crédito Recebido em 2026": "US$ 1.510.582,28", "Crédito Disponível": "US$ 59.423,29", "Crédito Disponível Número": 59423.29, "Crédito Recebido Número": 1510582.28, "% do Recebido": "1,27%", "% Disponível s/ Recebido": "3,93%", "Diferença": "US$ 1.451.158,99"}, {"Ação": "2868", "Descrição": "COMBUSTÍVEIS E LUBRIFICANTES DE AVIAÇÃO", "Crédito Recebido em 2026": "US$ 1.491.492,00", "Crédito Disponível": "US$ 56.816,40", "Crédito Disponível Número": 56816.4, "Crédito Recebido Número": 1491492.0, "% do Recebido": "1,25%", "% Disponível s/ Recebido": "3,81%", "Diferença": "US$ 1.434.675,60"}, {"Ação": "20X7", "Descrição": "EMPREGO CONJUNTO OU COMBINADO DAS FFAA", "Crédito Recebido em 2026": "US$ 1.050.910,51", "Crédito Disponível": "US$ 210.262,96", "Crédito Disponível Número": 210262.96, "Crédito Recebido Número": 1050910.51, "% do Recebido": "0,88%", "% Disponível s/ Recebido": "20,01%", "Diferença": "US$ 840.647,55"}, {"Ação": "21A0", "Descrição": "APRESTAMENTO DAS FORÇAS ARMADAS", "Crédito Recebido em 2026": "US$ 403.735,85", "Crédito Disponível": "US$ 62.226,05", "Crédito Disponível Número": 62226.05, "Crédito Recebido Número": 403735.85, "% do Recebido": "0,34%", "% Disponível s/ Recebido": "15,41%", "Diferença": "US$ 341.509,80"}, {"Ação": "00UU", "Descrição": "CONTRIBUIÇÕES A ORGANISMOS INTERNACIONAIS", "Crédito Recebido em 2026": "US$ 115.829,43", "Crédito Disponível": "US$ 444,60", "Crédito Disponível Número": 444.6, "Crédito Recebido Número": 115829.43, "% do Recebido": "0,10%", "% Disponível s/ Recebido": "0,38%", "Diferença": "US$ 115.384,83"}, {"Ação": "2913", "Descrição": "INVESTIGAÇÃO E PREVENÇÃO DE ACIDENTES AERONÁUTICOS", "Crédito Recebido em 2026": "US$ 98.059,00", "Crédito Disponível": "US$ 2.700,00", "Crédito Disponível Número": 2700.0, "Crédito Recebido Número": 98059.0, "% do Recebido": "0,08%", "% Disponível s/ Recebido": "2,75%", "Diferença": "US$ 95.359,00"}, {"Ação": "212O", "Descrição": "MOVIMENTAÇÃO DE MILITARES", "Crédito Recebido em 2026": "US$ 91.606,17", "Crédito Disponível": "US$ 0,00", "Crédito Disponível Número": 0.0, "Crédito Recebido Número": 91606.17, "% do Recebido": "0,08%", "% Disponível s/ Recebido": "0,00%", "Diferença": "US$ 91.606,17"}, {"Ação": "20X1", "Descrição": "PARTICIPAÇÃO BRASILEIRA EM OPERAÇÕES", "Crédito Recebido em 2026": "US$ 86.883,64", "Crédito Disponível": "US$ 704,15", "Crédito Disponível Número": 704.15, "Crédito Recebido Número": 86883.64, "% do Recebido": "0,07%", "% Disponível s/ Recebido": "0,81%", "Diferença": "US$ 86.179,49"}, {"Ação": "20SA", "Descrição": "MANUTENÇÃO DE SISTEMAS DE INFORMAÇÕES MILITARES", "Crédito Recebido em 2026": "US$ 60.036,85", "Crédito Disponível": "US$ 60.036,85", "Crédito Disponível Número": 60036.85, "Crédito Recebido Número": 60036.85, "% do Recebido": "0,05%", "% Disponível s/ Recebido": "100,00%", "Diferença": "US$ 0,00"}, {"Ação": "21AI", "Descrição": "FUNCIONAMENTO E ATUALIZAÇÃO DE INFRAESTRUTURA", "Crédito Recebido em 2026": "US$ 34.985,84", "Crédito Disponível": "US$ 0,00", "Crédito Disponível Número": 0.0, "Crédito Recebido Número": 34985.84, "% do Recebido": "0,03%", "% Disponível s/ Recebido": "0,00%", "Diferença": "US$ 34.985,84"}, {"Ação": "20X5", "Descrição": "OPERAÇÕES DE COMANDO E CONTROLE DA DEFESA NACIONAL", "Crédito Recebido em 2026": "US$ 8.935,53", "Crédito Disponível": "US$ 937,53", "Crédito Disponível Número": 937.53, "Crédito Recebido Número": 8935.53, "% do Recebido": "0,01%", "% Disponível s/ Recebido": "10,49%", "Diferença": "US$ 7.998,00"}, {"Ação": "21GO", "Descrição": "FUNCIONAMENTO DAS INSTITUIÇÕES CIENTÍFICAS", "Crédito Recebido em 2026": "US$ 7.126,73", "Crédito Disponível": "US$ 217,73", "Crédito Disponível Número": 217.73, "Crédito Recebido Número": 7126.73, "% do Recebido": "0,01%", "% Disponível s/ Recebido": "3,06%", "Diferença": "US$ 6.909,00"}, {"Ação": "151S", "Descrição": "IMPLANTAÇÃO E DESENVOLVIMENTO", "Crédito Recebido em 2026": "US$ 4.030,10", "Crédito Disponível": "US$ 2.000,00", "Crédito Disponível Número": 2000.0, "Crédito Recebido Número": 4030.1, "% do Recebido": "0,00%", "% Disponível s/ Recebido": "49,63%", "Diferença": "US$ 2.030,10"}, {"Ação": "20XB", "Descrição": "PESQUISA E DESENVOLVIMENTO NO SETOR AERONÁUTICO", "Crédito Recebido em 2026": "US$ 2.000,00", "Crédito Disponível": "US$ 2.000,00", "Crédito Disponível Número": 2000.0, "Crédito Recebido Número": 2000.0, "% do Recebido": "0,00%", "% Disponível s/ Recebido": "100,00%", "Diferença": "US$ 0,00"}, {"Ação": "2D55", "Descrição": "ADIDÂNCIAS MILITARES NO EXTERIOR", "Crédito Recebido em 2026": "US$ 1.602,20", "Crédito Disponível": "US$ 748,61", "Crédito Disponível Número": 748.61, "Crédito Recebido Número": 1602.2, "% do Recebido": "0,00%", "% Disponível s/ Recebido": "46,72%", "Diferença": "US$ 853,59"}];
  var positionDate = "20/08/2026";
  var sourceFile = "RELATÓRIO_CRÉDITO_DISPONÍVEL_CABW_20082026(1).docx";
  var filter = document.getElementById('receivedActionFilter');
  var table = document.getElementById('receivedCreditTable');
  var pdfButton = document.getElementById('generateReceivedActionPdf');
  var status = document.getElementById('receivedActionStatus');

  function normalize(value) {
    return String(value || '').trim();
  }

  function setStatus(message, type) {
    if (!status) return;
    status.textContent = message || '';
    status.className = 'detail-report-status' + (type ? ' detail-report-status--' + type : '');
  }

  function visibleRows() {
    var selected = filter ? filter.value : '';
    return receivedData.filter(function (row) {
      return row['Ação'] !== 'TOTAL GERAL' && (!selected || row['Ação'] === selected);
    });
  }

  function applyFilter() {
    if (!table || !filter) return;
    var selected = filter.value;
    var bodyRows = table.querySelectorAll('tbody tr');
    bodyRows.forEach(function (tr) {
      var actionCell = tr.querySelector('td');
      var action = actionCell ? normalize(actionCell.textContent) : '';
      var isTotal = action === 'TOTAL GERAL';
      var shouldShow = selected ? action === selected : true;
      tr.style.display = shouldShow ? '' : 'none';
    });
    var count = visibleRows().length;
    setStatus(count + ' ação(ões) exibida(s).', 'info');
  }

  function filePart(value) {
    return String(value || 'todas-acoes')
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .toLowerCase()
      .slice(0, 48) || 'relatorio';
  }

  function createPdf() {
    var rows = visibleRows();
    if (!rows.length) {
      setStatus('Não há dados para gerar relatório com o filtro selecionado.', 'warning');
      return;
    }
    if (!window.jspdf || !window.jspdf.jsPDF) {
      setStatus('Biblioteca de PDF não carregada. Verifique sua conexão e tente novamente.', 'error');
      return;
    }
    var doc = new window.jspdf.jsPDF({ orientation: 'landscape', unit: 'pt', format: 'a4' });
    if (typeof doc.autoTable !== 'function') {
      setStatus('Biblioteca de tabela PDF não carregada. Verifique sua conexão e tente novamente.', 'error');
      return;
    }

    var selected = filter ? filter.value : '';
    var selectedLabel = selected ? rows[0]['Ação'] + ' - ' + rows[0]['Descrição'] : 'Todas as ações orçamentárias';
    var generatedAt = new Date().toLocaleString('pt-BR');
    var totalReceived = rows.reduce(function (sum, item) { return sum + Number(item['Crédito Recebido Número'] || 0); }, 0);
    var totalAvailable = rows.reduce(function (sum, item) { return sum + Number(item['Crédito Disponível Número'] || 0); }, 0);
    var totalDifference = rows.reduce(function (sum, item) {
      var text = String(item['Diferença'] || '0').replace(/[^0-9,.-]/g, '').replace(/\./g, '').replace(',', '.');
      return sum + Number(text || 0);
    }, 0);
    var fmt = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'USD' });

    doc.setFillColor(0, 52, 118);
    doc.rect(0, 0, 842, 74, 'F');
    doc.setTextColor(255, 255, 255);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text('Painel CABW - Relatório de Crédito Recebido por Ação', 40, 34);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Gerado em: ' + generatedAt + ' | Posição: ' + positionDate, 40, 54);

    doc.setTextColor(6, 38, 91);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(13);
    doc.text('Filtro aplicado', 40, 104);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(10);
    doc.text('Ação Orçamentária: ' + selectedLabel, 40, 122);
    doc.text('Fonte: ' + sourceFile, 40, 138);

    doc.autoTable({
      startY: 158,
      margin: { left: 40, right: 40 },
      head: [['Ações', 'Crédito recebido', 'Crédito disponível', 'Diferença']],
      body: [[
        String(rows.length),
        fmt.format(totalReceived).replace('US$', 'US$'),
        fmt.format(totalAvailable).replace('US$', 'US$'),
        fmt.format(totalDifference).replace('US$', 'US$')
      ]],
      theme: 'grid',
      headStyles: { fillColor: [0, 52, 118], textColor: 255, fontStyle: 'bold' },
      styles: { font: 'helvetica', fontSize: 9, textColor: [6, 38, 91] }
    });

    var tableBody = rows.map(function (item) {
      return [
        item['Ação'] || '',
        item['Descrição'] || '',
        item['Crédito Recebido em 2026'] || '',
        item['% do Recebido'] || '',
        item['Crédito Disponível'] || '',
        item['% Disponível s/ Recebido'] || '',
        item['Diferença'] || ''
      ];
    });

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 22,
      margin: { left: 40, right: 40 },
      head: [['Ação', 'Descrição', 'Crédito Recebido em 2026', '% do Recebido', 'Crédito Disponível', '% Disp. s/ Recebido', 'Diferença']],
      body: tableBody,
      theme: 'striped',
      headStyles: { fillColor: [0, 52, 118], textColor: 255, fontStyle: 'bold' },
      styles: { font: 'helvetica', fontSize: 8, cellPadding: 5, overflow: 'linebreak', textColor: [6, 38, 91] },
      columnStyles: {
        0: { cellWidth: 48 },
        1: { cellWidth: 230 },
        2: { halign: 'right' },
        3: { halign: 'center' },
        4: { halign: 'right' },
        5: { halign: 'center' },
        6: { halign: 'right' }
      }
    });

    doc.save('relatorio-credito-recebido-' + filePart(selected || 'todas-acoes') + '.pdf');
    setStatus('Relatório PDF gerado com sucesso.', 'success');
  }

  if (filter) {
    filter.addEventListener('change', applyFilter);
  }
  if (pdfButton) {
    pdfButton.addEventListener('click', createPdf);
  }
  applyFilter();
});
