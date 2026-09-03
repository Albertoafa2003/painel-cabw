
import fs from "node:fs";
import {
  buildDetailedCrossReportData,
  crossCreditAndRequisitions,
} from "../assets/js/requisition-core.js";
const requests = JSON.parse(fs.readFileSync(new URL("../assets/data/requisitions-available-current.json", import.meta.url), "utf8"));
const credit = JSON.parse(fs.readFileSync(new URL("../assets/data/credit-budget-detailed-current.json", import.meta.url), "utf8"));
const crossing = crossCreditAndRequisitions(credit.groupedByMatchKey, requests.records);
const report = buildDetailedCrossReportData(crossing, requests.records);
console.log(JSON.stringify({
  omCount: report.omSummaries.length,
  requestCount: report.requests.length,
  totals: report.totals,
  byOm: report.omSummaries.map((om) => ({
    om: om.om,
    ugCode: om.ugCode,
    requests: om.requests.length,
    requestValue: om.requestValue,
    balanceToCommit: om.balanceToCommit,
    creditAvailable: om.creditAvailable,
    creditRemaining: om.creditRemaining,
    deficit: om.deficit,
    status: om.status,
  })),
}));
