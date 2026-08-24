import type { GateReport } from "../../domain/gates/types";

export function GateReportPanel({ report }: { report?: GateReport }) {
  if (!report) return <section className="output-card"><p className="muted">尚未執行品質門。</p></section>;
  return <section className={`output-card gate-report ${report.passed ? "gate-passed" : "gate-blocked"}`}><div className="job-card-header"><h3>{report.passed ? "品質門通過" : "品質門阻擋"}</h3><span className="stage-state">{report.passed ? "PASS" : "BLOCKED"}</span></div>{report.blockers.length > 0 && <div><b>Blockers</b>{report.blockers.map((issue) => <p key={`${issue.code}-${issue.path}`}>{issue.code}: {issue.message}</p>)}</div>}{report.warnings.length > 0 && <div><b>Warnings</b>{report.warnings.map((issue) => <p key={`${issue.code}-${issue.path}`}>{issue.code}: {issue.message}</p>)}</div>}<pre>{JSON.stringify(report.metrics, null, 2)}</pre></section>;
}
