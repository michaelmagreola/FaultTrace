import { KeyboardEvent } from "react";
import { IssuesTrend } from "../api";

type Period = "daily" | "weekly" | "monthly";

type Props = {
  trend: IssuesTrend | null;
  period: Period;
  onPeriodChange: (p: Period) => void;
  busy?: boolean;
};

const PERIODS = [
  ["daily", "Daily"],
  ["weekly", "Weekly"],
  ["monthly", "Monthly"],
] as const;

export default function IssuesChart({ trend, period, onPeriodChange, busy }: Props) {
  const buckets = Array.isArray(trend?.buckets) ? trend!.buckets : [];
  const counts = buckets.map((b) => (Number.isFinite(b.issue_count) ? b.issue_count : 0));
  const max = Math.max(1, ...counts, 1);

  function onPeriodKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!PERIODS.length) return;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    e.preventDefault();
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % PERIODS.length;
    if (e.key === "ArrowLeft") next = (index - 1 + PERIODS.length) % PERIODS.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = PERIODS.length - 1;
    const id = PERIODS[next][0];
    onPeriodChange(id);
    window.requestAnimationFrame(() => {
      document.getElementById(`chart-period-${id}`)?.focus();
    });
  }

  return (
    <div className="chart-panel">
      <div className="chart-head">
        <div>
          <h3 id="issues-chart-heading">Most issues over time</h3>
          <p className="lede" id="issues-chart-desc">
            Work orders closed by period — peak{" "}
            <strong>{trend?.peak_label ?? "—"}</strong>
            {trend && trend.peak_count > 0 ? ` (${trend.peak_count})` : ""}.
          </p>
        </div>
        <div
          className="period-tabs"
          role="tablist"
          aria-label="Chart period"
          aria-describedby="issues-chart-desc"
        >
          {PERIODS.map(([id, label], index) => (
            <button
              key={id}
              id={`chart-period-${id}`}
              type="button"
              role="tab"
              aria-selected={period === id}
              aria-controls="issues-chart-panel"
              tabIndex={period === id ? 0 : -1}
              className={period === id ? "period active" : "period"}
              onClick={() => onPeriodChange(id)}
              onKeyDown={(e) => onPeriodKeyDown(e, index)}
              disabled={busy}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      <div id="issues-chart-panel" role="tabpanel" aria-labelledby="issues-chart-heading">
        {!trend && <p className="lede">{busy ? "Loading chart…" : "No chart data yet."}</p>}

        {trend && (
          <>
            <div
              className="chart"
              role="img"
              aria-label={`Issues ${period} bar chart. Peak ${trend.peak_label ?? "—"} with ${trend.peak_count ?? 0} issues.`}
            >
              {buckets.map((b) => {
                const count = Number.isFinite(b.issue_count) ? b.issue_count : 0;
                const height = Math.round((count / max) * 100);
                return (
                  <div
                    key={b.period_start || b.label}
                    className="bar-col"
                    title={`${b.label}: ${count} issues, ${b.minutes_down ?? 0} min, top ${b.top_fault || "—"} on ${b.top_asset || "—"}`}
                  >
                    <div className="bar-value" aria-hidden="true">
                      {count || ""}
                    </div>
                    <div className="bar-track" aria-hidden="true">
                      <div
                        className={
                          count === (trend.peak_count ?? 0) && count > 0 ? "bar peak" : "bar"
                        }
                        style={{ height: `${Math.max(height, count > 0 ? 8 : 0)}%` }}
                      />
                    </div>
                    <div className="bar-label" aria-hidden="true">
                      {b.label}
                    </div>
                  </div>
                );
              })}
            </div>
            <table className="grid chart-table" aria-label={`Issues by ${period} period`}>
              <caption className="sr-only">
                Work-order issue counts by {period} period, including minutes down and top fault
              </caption>
              <thead>
                <tr>
                  <th scope="col">Period</th>
                  <th scope="col">Issues</th>
                  <th scope="col">Minutes down</th>
                  <th scope="col">Top fault</th>
                  <th scope="col">Top asset</th>
                </tr>
              </thead>
              <tbody>
                {[...buckets]
                  .filter((b) => (b.issue_count ?? 0) > 0)
                  .sort((a, b) => (b.issue_count ?? 0) - (a.issue_count ?? 0))
                  .map((b) => (
                    <tr key={`row-${b.period_start || b.label}`}>
                      <th scope="row">{b.label}</th>
                      <td>{b.issue_count}</td>
                      <td>{b.minutes_down}</td>
                      <td>{b.top_fault}</td>
                      <td>{b.top_asset}</td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </>
        )}
      </div>
    </div>
  );
}
