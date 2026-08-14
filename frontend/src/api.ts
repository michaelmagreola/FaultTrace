import { ApiError } from "./lib/errors";

export type Role = "technician" | "planner" | "admin";

export type Employee = {
  id: number;
  email: string;
  full_name: string;
  role: Role;
  floor_level?: string;
  function_title?: string;
  rank_level?: string;
  shift?: string;
  active: boolean;
};

export type Asset = {
  id: number;
  code: string;
  name: string;
  area: string;
};

export type WorkOrderHit = {
  id: number;
  external_id: string;
  asset_code: string;
  fault_code: string;
  symptom: string;
  cause: string;
  fix: string;
  parts_used: string;
  minutes_down: number;
  score: number;
  useful_votes: number;
};

export type SearchResponse = {
  query: string;
  found: boolean;
  summary: string;
  citations: string[];
  hits: WorkOrderHit[];
  refusal: boolean;
  ai_mode: string;
};

export type AssetHistoryItem = {
  external_id: string;
  fault_code: string;
  symptom: string;
  fix: string;
  minutes_down: number;
  created_at: string;
};

export type RecurringFaultRow = {
  asset_code: string;
  fault_key: string;
  occurrences: number;
  total_minutes_down: number;
};

export type DowntimeRow = {
  asset_code: string;
  asset_name: string;
  work_order_count: number;
  total_minutes_down: number;
};

export type PartsStockRow = {
  part_name: string;
  times_used: number;
  assets: string[];
  related_minutes_down: number;
  stock_priority: string;
};

export type CauseDowntimeRow = {
  cause: string;
  occurrences: number;
  total_minutes_down: number;
  sample_assets: string[];
};

export type UsefulCaseRow = {
  external_id: string;
  asset_code: string;
  fault_code: string;
  symptom: string;
  useful_votes: number;
  minutes_down: number;
};

export type PlannerAction = {
  priority: string;
  title: string;
  detail: string;
  asset_code: string;
  fault_key: string;
};

export type IssueBucket = {
  label: string;
  period_start: string;
  issue_count: number;
  minutes_down: number;
  top_fault: string;
  top_asset: string;
};

export type IssuesTrend = {
  period: string;
  buckets: IssueBucket[];
  peak_label: string;
  peak_count: number;
  total_issues: number;
};

export type SupervisorOverview = {
  total_work_orders: number;
  total_minutes_down: number;
  total_useful_votes: number;
  assets_tracked: number;
  top_asset_code: string;
  top_asset_minutes: number;
  recurring: RecurringFaultRow[];
  downtime_by_asset: DowntimeRow[];
  downtime_by_cause: CauseDowntimeRow[];
  parts_to_stock: PartsStockRow[];
  useful_cases: UsefulCaseRow[];
  actions: PlannerAction[];
  meeting_brief: string;
};

const API_BASE = import.meta.env.VITE_API_BASE ?? "";

function authHeaders(token: string): HeadersInit {
  return {
    "Content-Type": "application/json",
    Authorization: `Bearer ${token}`,
  };
}

function formatDetail(detail: unknown): string {
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail
      .map((item) => {
        if (item && typeof item === "object" && "msg" in item) {
          const loc = Array.isArray((item as { loc?: unknown }).loc)
            ? (item as { loc: unknown[] }).loc.filter((x) => x !== "body").join(".")
            : "";
          const msg = String((item as { msg: unknown }).msg);
          return loc ? `${loc}: ${msg}` : msg;
        }
        return JSON.stringify(item);
      })
      .join("; ");
  }
  if (detail && typeof detail === "object") return JSON.stringify(detail);
  return "Request failed";
}

async function parse<T>(res: Response): Promise<T> {
  if (!res.ok) {
    let detail = res.statusText || `HTTP ${res.status}`;
    try {
      const body = (await res.json()) as { detail?: unknown };
      detail = formatDetail(body.detail ?? body);
    } catch {
      try {
        const text = await res.text();
        if (text) detail = text;
      } catch {
        /* keep statusText */
      }
    }
    if (res.status === 401) {
      throw new ApiError(
        detail || "Session expired. Sign in again.",
        401,
      );
    }
    throw new ApiError(detail || `HTTP ${res.status}`, res.status);
  }
  try {
    return (await res.json()) as T;
  } catch {
    throw new ApiError("API returned an invalid response.", res.status || 502);
  }
}

async function apiFetch<T>(url: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(url, init);
  } catch {
    throw new ApiError(
      "Cannot reach the FaultTrace API. Start the backend on port 8000, then retry.",
      0,
    );
  }
  return parse<T>(res);
}

export async function fetchHealth(): Promise<{ status: string; auth_mode: string; ai_mode: string }> {
  return apiFetch(`${API_BASE}/health`);
}

export async function fetchEmployees(): Promise<Employee[]> {
  return apiFetch(`${API_BASE}/api/employees`);
}

export async function resolveEmployee(
  role: Role,
  email: string,
): Promise<{ found: boolean; full_name: string; first_name: string }> {
  const params = new URLSearchParams({ role, email });
  return apiFetch(`${API_BASE}/api/auth/resolve?${params}`);
}

export async function loginEmployee(body: {
  role: Role;
  email: string;
  password: string;
}): Promise<{
  welcome: string;
  first_name: string;
  employee: Employee;
  session_token: string;
  token_type: string;
}> {
  return apiFetch(`${API_BASE}/api/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

export async function fetchAdminEmployees(token: string): Promise<Employee[]> {
  return apiFetch(`${API_BASE}/api/admin/employees`, { headers: authHeaders(token) });
}

export async function fetchAdminLogins(token: string): Promise<LoginEvent[]> {
  return apiFetch(`${API_BASE}/api/admin/logins`, { headers: authHeaders(token) });
}

export async function createEmployee(
  token: string,
  body: {
    email: string;
    full_name: string;
    role: Role;
    floor_level: string;
    function_title: string;
    rank_level: string;
    shift: string;
  },
): Promise<Employee> {
  return apiFetch(`${API_BASE}/api/admin/employees`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function setEmployeeActive(
  token: string,
  employeeId: number,
  active: boolean,
): Promise<Employee> {
  return apiFetch(`${API_BASE}/api/admin/employees/${employeeId}`, {
    method: "PATCH",
    headers: authHeaders(token),
    body: JSON.stringify({ active }),
  });
}

export async function deleteEmployee(
  token: string,
  employeeId: number,
): Promise<{ ok: boolean; message: string }> {
  return apiFetch(`${API_BASE}/api/admin/employees/${employeeId}`, {
    method: "DELETE",
    headers: authHeaders(token),
  });
}

export async function fetchAssets(token: string): Promise<Asset[]> {
  return apiFetch(`${API_BASE}/api/assets`, { headers: authHeaders(token) });
}

export async function searchWorkOrders(
  token: string,
  query: string,
  assetCode?: string,
): Promise<SearchResponse> {
  return apiFetch(`${API_BASE}/api/search`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify({ query, asset_code: assetCode || null }),
  });
}

export async function closeOut(
  token: string,
  body: {
    asset_code: string;
    fault_code: string;
    symptom: string;
    cause: string;
    fix: string;
    parts_used: string;
    minutes_down: number;
  },
): Promise<{ external_id: string; message: string }> {
  return apiFetch(`${API_BASE}/api/work-orders/close-out`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function fetchHistory(token: string, code: string): Promise<AssetHistoryItem[]> {
  return apiFetch(`${API_BASE}/api/assets/${encodeURIComponent(code)}/history`, {
    headers: authHeaders(token),
  });
}

export async function fetchRecurring(token: string): Promise<RecurringFaultRow[]> {
  return apiFetch(`${API_BASE}/api/supervisor/recurring`, {
    headers: authHeaders(token),
  });
}

export async function fetchDowntime(token: string): Promise<DowntimeRow[]> {
  return apiFetch(`${API_BASE}/api/supervisor/downtime`, {
    headers: authHeaders(token),
  });
}

export async function fetchSupervisorOverview(token: string): Promise<SupervisorOverview> {
  return apiFetch(`${API_BASE}/api/supervisor/overview`, {
    headers: authHeaders(token),
  });
}

export async function fetchIssuesTrend(
  token: string,
  period: "daily" | "weekly" | "monthly",
): Promise<IssuesTrend> {
  return apiFetch(
    `${API_BASE}/api/supervisor/issues-trend?period=${encodeURIComponent(period)}`,
    { headers: authHeaders(token) },
  );
}

export type AdminStatus = {
  app: string;
  auth_mode: string;
  ai_mode: string;
  database_url_safe: string;
  retrieval_top_k: number;
  retrieval_min_score: number;
  asset_count: number;
  work_order_count: number;
  feedback_count: number;
  total_useful_votes: number;
  login_count: number;
  access: string;
};

export type LoginEvent = {
  id: number;
  email: string;
  full_name: string;
  role: string;
  floor_level: string;
  shift: string;
  logged_in_at: string;
  logged_in_local: string;
};

export type AdminFeedbackRow = {
  id: number;
  query_text: string;
  work_order_external_id: string;
  useful: boolean;
  score: number;
};

export type RoleDirectoryRow = {
  role: string;
  email: string;
  access: string;
};

export async function fetchAdminStatus(token: string): Promise<AdminStatus> {
  return apiFetch(`${API_BASE}/api/admin/status`, { headers: authHeaders(token) });
}

export async function fetchAdminFeedback(token: string): Promise<AdminFeedbackRow[]> {
  return apiFetch(`${API_BASE}/api/admin/feedback`, { headers: authHeaders(token) });
}

export async function fetchAdminRoles(token: string): Promise<RoleDirectoryRow[]> {
  return apiFetch(`${API_BASE}/api/admin/roles`, { headers: authHeaders(token) });
}

export async function createAsset(
  token: string,
  body: { code: string; name: string; area: string },
): Promise<Asset> {
  return apiFetch(`${API_BASE}/api/admin/assets`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}

export async function reembedCorpus(
  token: string,
): Promise<{ reembedded: number; message: string }> {
  return apiFetch(`${API_BASE}/api/admin/reembed`, {
    method: "POST",
    headers: authHeaders(token),
  });
}

export async function markUseful(
  token: string,
  body: { query_text: string; work_order_id: number; useful: boolean; score: number },
): Promise<{ message: string; useful_votes: number }> {
  return apiFetch(`${API_BASE}/api/feedback/useful`, {
    method: "POST",
    headers: authHeaders(token),
    body: JSON.stringify(body),
  });
}
