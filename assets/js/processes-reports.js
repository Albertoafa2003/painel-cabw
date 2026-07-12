(function () {
  "use strict";

  const registry = window.CABW_PROCESSES_DATA || { processes: [] };
  const processes = Array.isArray(registry.processes) ? registry.processes : [];

  function findProcess(id) {
    return processes.find(item => item.id === id);
  }

  function parseBrDate(value) {
    const match = String(value || "").match(/^(\d{2})\/(\d{2})\/(\d{4})$/);
    if (!match) return null;
    return new Date(Number(match[3]), Number(match[2]) - 1, Number(match[1]), 0, 0, 0, 0);
  }

  function todayAtMidnight() {
    const now = new Date();
    return new Date(now.getFullYear(), now.getMonth(), now.getDate(), 0, 0, 0, 0);
  }

  function deadlineState(process) {
    const deadline = parseBrDate(process && process.currentDeadline);
    if (!deadline) {
      return { state: "neutral", label: "Prazo não informado", days: null };
    }

    const millisecondsPerDay = 24 * 60 * 60 * 1000;
    const diff = Math.ceil((deadline.getTime() - todayAtMidnight().getTime()) / millisecondsPerDay);

    if (diff > 1) return { state: "on-time", label: `No prazo · ${diff} dias restantes`, days: diff };
    if (diff === 1) return { state: "due", label: "Atenção · 1 dia restante", days: diff };
    if (diff === 0) return { state: "due", label: "Prazo vence hoje", days: diff };

    const lateDays = Math.abs(diff);
    return {
      state: "overdue",
      label: `Atraso de ${lateDays} ${lateDays === 1 ? "dia" : "dias"}`,
      days: diff
    };
  }

  function updateDeadlineIndicators() {
    document.querySelectorAll("[data-process-countdown]").forEach(element => {
      const process = findProcess(element.dataset.processCountdown);
      if (!process) return;
      const status = deadlineState(process);
      element.textContent = status.label;
      element.classList.remove("is-on-time", "is-due", "is-overdue", "is-neutral");
      element.classList.add(`is-${status.state}`);
    });

    document.querySelectorAll("[data-process-deadline]").forEach(element => {
      const process = findProcess(element.dataset.processDeadline);
      if (process) element.textContent = process.currentDeadline || "-";
    });
  }

  function cleanText(value) {
    return String(value == null ? "" : value)
      .replace(/\u2013|\u2014/g, "-")
      .replace(/\s+/g, " ")
      .trim();
  }

  function filenamePart(value) {
    return cleanText(value)
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 70);
  }

  function formatDateTime(date) {
    return new Intl.DateTimeFormat("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date || new Date());
  }

  function requirePdf() {
    const JsPdf = window.jspdf && window.jspdf.jsPDF;
    if (!JsPdf) {
      window.alert("Não foi possível carregar o gerador de PDF. Verifique sua conexão e tente novamente.");
      return null;
    }
    return JsPdf;
  }

  function addPageHeader(doc, title, subtitle) {
    const width = doc.internal.pageSize.getWidth();
    doc.setFillColor(4, 42, 96);
    doc.rect(0, 0, width, 76, "F");
    doc.setTextColor(255, 255, 255);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(17);
    doc.text(cleanText(title), 36, 33, { maxWidth: width - 72 });
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.text(cleanText(subtitle), 36, 55, { maxWidth: width - 72 });
    doc.setDrawColor(255, 210, 0);
    doc.setLineWidth(2);
    doc.line(36, 66, 140, 66);
  }

  function addFooter(doc) {
    const pageCount = doc.internal.getNumberOfPages();
    const width = doc.internal.pageSize.getWidth();
    const height = doc.internal.pageSize.getHeight();

    for (let page = 1; page <= pageCount; page += 1) {
      doc.setPage(page);
      doc.setDrawColor(215, 222, 234);
      doc.setLineWidth(0.5);
      doc.line(36, height - 28, width - 36, height - 28);
      doc.setTextColor(86, 101, 128);
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.text("Painel CABW - Processos de Contratação", 36, height - 15);
      doc.text(`Página ${page} de ${pageCount}`, width - 36, height - 15, { align: "right" });
    }
  }

  function generateProcessPdf(processId) {
    const process = findProcess(processId);
    if (!process) return;

    const JsPdf = requirePdf();
    if (!JsPdf) return;

    const doc = new JsPdf({ orientation: "landscape", unit: "pt", format: "a4" });
    if (typeof doc.autoTable !== "function") {
      window.alert("O complemento de tabelas do PDF não foi carregado.");
      return;
    }

    const status = deadlineState(process);
    addPageHeader(
      doc,
      `Histórico do Processo - ${process.shortTitle}`,
      `${process.category} · Relatório gerado em ${formatDateTime(new Date())}`
    );

    doc.setTextColor(8, 41, 95);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.text(cleanText(process.title), 36, 100, { maxWidth: 770 });

    doc.autoTable({
      startY: 116,
      margin: { left: 36, right: 36 },
      theme: "grid",
      head: [["Situação atual", "Etapa atual", "Prazo da etapa", "Situação do prazo", "Nível de atenção"]],
      body: [[
        cleanText(process.status),
        cleanText(process.currentStage),
        cleanText(process.currentDeadline),
        cleanText(status.label),
        cleanText(process.riskLevel)
      ]],
      styles: { font: "helvetica", fontSize: 8.5, cellPadding: 6, textColor: [18, 39, 75] },
      headStyles: { fillColor: [4, 55, 116], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [247, 249, 252] }
    });

    let y = doc.lastAutoTable.finalY + 18;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(10);
    doc.setTextColor(8, 41, 95);
    doc.text("Leitura executiva", 36, y);
    y += 13;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(55, 72, 101);
    const note = `${process.executiveNote} Próximo marco: ${process.nextMilestone}. Impacto potencial: ${process.impact}`;
    const noteLines = doc.splitTextToSize(cleanText(note), 770);
    doc.text(noteLines, 36, y);
    y += noteLines.length * 11 + 14;

    const rows = process.stages.map(stage => {
      const stageStatus = stage.deadline && stage.status !== "Concluída"
        ? deadlineState({ currentDeadline: stage.deadline }).label
        : stage.status;
      return [
        stage.number,
        cleanText(stage.name),
        cleanText(stageStatus),
        cleanText(stage.planned),
        cleanText(stage.actual),
        cleanText(stage.description),
        cleanText(stage.impact)
      ];
    });

    doc.autoTable({
      startY: y,
      margin: { left: 28, right: 28, bottom: 42 },
      theme: "grid",
      head: [["#", "Etapa", "Situação", "Previsto", "Realizado", "Descrição", "Impacto / ponto de atenção"]],
      body: rows,
      styles: {
        font: "helvetica",
        fontSize: 7.3,
        cellPadding: 4,
        overflow: "linebreak",
        valign: "top",
        textColor: [27, 48, 82]
      },
      headStyles: { fillColor: [4, 55, 116], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      columnStyles: {
        0: { cellWidth: 22, halign: "center" },
        1: { cellWidth: 100 },
        2: { cellWidth: 70 },
        3: { cellWidth: 90 },
        4: { cellWidth: 82 },
        5: { cellWidth: 175 },
        6: { cellWidth: 200 }
      }
    });

    const sourceY = doc.lastAutoTable.finalY + 15;
    if (sourceY < doc.internal.pageSize.getHeight() - 48) {
      doc.setFont("helvetica", "italic");
      doc.setFontSize(8);
      doc.setTextColor(86, 101, 128);
      doc.text(`Fonte: ${cleanText(process.sourceFile)}`, 36, sourceY);
    }

    addFooter(doc);
    doc.save(`historico-${filenamePart(process.shortTitle)}.pdf`);
  }

  function generateSummaryPdf() {
    const JsPdf = requirePdf();
    if (!JsPdf) return;

    const doc = new JsPdf({ orientation: "landscape", unit: "pt", format: "a4" });
    if (typeof doc.autoTable !== "function") {
      window.alert("O complemento de tabelas do PDF não foi carregado.");
      return;
    }

    addPageHeader(
      doc,
      "Resumo dos Processos de Contratação",
      `Posição gerencial de ${registry.updatedAt || formatDateTime(new Date())} · Gerado em ${formatDateTime(new Date())}`
    );

    const completed = processes.filter(process => /conclu|homologado|contratado/i.test(process.status)).length;
    const inProgress = processes.length - completed;

    doc.autoTable({
      startY: 96,
      margin: { left: 36, right: 36 },
      theme: "grid",
      head: [["Processos monitorados", "Em andamento", "Concluídos", "Categorias"]],
      body: [[processes.length, inProgress, completed, new Set(processes.map(item => item.category)).size]],
      styles: { fontSize: 9, cellPadding: 7, halign: "center", textColor: [18, 39, 75] },
      headStyles: { fillColor: [4, 55, 116], textColor: [255, 255, 255], fontStyle: "bold" }
    });

    const body = processes.map(process => {
      const status = deadlineState(process);
      return [
        cleanText(process.shortTitle),
        cleanText(process.category),
        cleanText(process.status),
        cleanText(process.currentStage),
        cleanText(process.currentDeadline),
        cleanText(status.label),
        cleanText(process.nextMilestone),
        cleanText(process.impact)
      ];
    });

    doc.autoTable({
      startY: doc.lastAutoTable.finalY + 20,
      margin: { left: 24, right: 24, bottom: 42 },
      theme: "grid",
      head: [["Processo", "Natureza", "Status", "Etapa atual", "Prazo", "Situação do prazo", "Próximo marco", "Impacto potencial"]],
      body,
      styles: { fontSize: 7.6, cellPadding: 5, overflow: "linebreak", valign: "top", textColor: [25, 46, 80] },
      headStyles: { fillColor: [4, 55, 116], textColor: [255, 255, 255], fontStyle: "bold" },
      alternateRowStyles: { fillColor: [245, 248, 252] },
      columnStyles: {
        0: { cellWidth: 72 },
        1: { cellWidth: 72 },
        2: { cellWidth: 78 },
        3: { cellWidth: 94 },
        4: { cellWidth: 54 },
        5: { cellWidth: 68 },
        6: { cellWidth: 126 },
        7: { cellWidth: 202 }
      }
    });

    addFooter(doc);
    doc.save("resumo-processos-contratacao.pdf");
  }

  function bindButtons() {
    document.querySelectorAll("[data-process-pdf]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        event.stopPropagation();
        generateProcessPdf(button.dataset.processPdf);
      });
    });

    document.querySelectorAll("[data-process-summary-pdf]").forEach(button => {
      button.addEventListener("click", event => {
        event.preventDefault();
        generateSummaryPdf();
      });
    });
  }

  document.addEventListener("DOMContentLoaded", () => {
    updateDeadlineIndicators();
    bindButtons();
  });

  window.CABWProcessReports = {
    generateProcessPdf,
    generateSummaryPdf,
    deadlineState
  };
})();
