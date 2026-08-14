import { FormEvent, KeyboardEvent, useCallback, useEffect, useState } from "react";
import {
  AdminFeedbackRow,
  AdminStatus,
  Asset,
  AssetHistoryItem,
  Employee,
  IssuesTrend,
  LoginEvent,
  Role,
  RoleDirectoryRow,
  SearchResponse,
  SupervisorOverview,
  closeOut,
  createAsset,
  createEmployee,
  fetchAdminEmployees,
  fetchAdminFeedback,
  fetchAdminLogins,
  fetchAdminRoles,
  fetchAdminStatus,
  fetchAssets,
  fetchEmployees,
  fetchHistory,
  fetchIssuesTrend,
  fetchSupervisorOverview,
  loginEmployee,
  markUseful,
  reembedCorpus,
  resolveEmployee,
  searchWorkOrders,
  deleteEmployee,
  setEmployeeActive,
} from "./api";
import IssuesChart from "./components/IssuesChart";
import { isUnauthorizedError, toErrorMessage } from "./lib/errors";

type Tab = "search" | "closeout" | "history" | "supervisor" | "admin";
type ChartPeriod = "daily" | "weekly" | "monthly";

const ROLE_LABEL: Record<Role, string> = {
  technician: "Technician",
  planner: "Supervisor",
  admin: "Admin",
};

const SAFETY_LINKS = [
  {
    id: "LOTO-CNC",
    title: "Lockout/Tagout — CNC cells",
    href: "/safety/loto-cnc.html",
  },
  {
    id: "OEM-HAAS",
    title: "Haas VF-2 controlled procedure index",
    href: "/safety/haas-vf2-index.html",
  },
  {
    id: "PPE-FLOOR",
    title: "Floor PPE requirements",
    href: "/safety/ppe-floor.html",
  },
];

export default function App() {
  const [session, setSession] = useState<{
    role: Role;
    email: string;
    token: string;
    fullName?: string;
    firstName?: string;
    welcome?: string;
  } | null>(null);
  const [directory, setDirectory] = useState<Employee[]>([]);
  const [loginRole, setLoginRole] = useState<Role>("technician");
  const [loginEmail, setLoginEmail] = useState("");
  const [loginPassword, setLoginPassword] = useState("");
  const [resolvedName, setResolvedName] = useState("");
  const [loginError, setLoginError] = useState<string | null>(null);
  const [loginBusy, setLoginBusy] = useState(false);

  const [tab, setTab] = useState<Tab>("search");
  const [assets, setAssets] = useState<Asset[]>([]);
  const [assetCode, setAssetCode] = useState("");
  const [query, setQuery] = useState("spndl drift after warm-up");
  const [searchResult, setSearchResult] = useState<SearchResponse | null>(null);
  const [history, setHistory] = useState<AssetHistoryItem[]>([]);
  const [historyQuery, setHistoryQuery] = useState("");
  const [historySearch, setHistorySearch] = useState<SearchResponse | null>(null);
  const [overview, setOverview] = useState<SupervisorOverview | null>(null);
  const [chartPeriod, setChartPeriod] = useState<ChartPeriod>("daily");
  const [issuesTrend, setIssuesTrend] = useState<IssuesTrend | null>(null);
  const [adminStatus, setAdminStatus] = useState<AdminStatus | null>(null);
  const [adminFeedback, setAdminFeedback] = useState<AdminFeedbackRow[]>([]);
  const [adminRoles, setAdminRoles] = useState<RoleDirectoryRow[]>([]);
  const [newAssetCode, setNewAssetCode] = useState("");
  const [newAssetName, setNewAssetName] = useState("");
  const [newAssetArea, setNewAssetArea] = useState("Machining");
  const [adminEmployees, setAdminEmployees] = useState<Employee[]>([]);
  const [adminLogins, setAdminLogins] = useState<LoginEvent[]>([]);
  const [empName, setEmpName] = useState("");
  const [empEmail, setEmpEmail] = useState("");
  const [empRole, setEmpRole] = useState<Role>("technician");
  const [empFloor, setEmpFloor] = useState("Floor 2");
  const [empFunction, setEmpFunction] = useState("CNC maintenance");
  const [empRank, setEmpRank] = useState("Tech I");
  const [empShift, setEmpShift] = useState("Day");
  const [busy, setBusy] = useState(false);
  const [toast, setToast] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [markedUseful, setMarkedUseful] = useState<Set<number>>(new Set());
  const [feedbackBusy, setFeedbackBusy] = useState<number | null>(null);

  const [coFault, setCoFault] = useState("");
  const [coSymptom, setCoSymptom] = useState("");
  const [coCause, setCoCause] = useState("");
  const [coFix, setCoFix] = useState("");
  const [coParts, setCoParts] = useState("");
  const [coMins, setCoMins] = useState(30);

  const reportError = useCallback((err: unknown, fallback: string) => {
    if (isUnauthorizedError(err)) {
      setSession(null);
      setLoginError("Session expired or invalid. Sign in again.");
      setError(null);
      return;
    }
    setError(toErrorMessage(err, fallback));
  }, []);

  async function loadDirectory() {
    try {
      setDirectory(await fetchEmployees());
    } catch {
      setDirectory([]);
    }
  }

  useEffect(() => {
    void loadDirectory();
  }, []);

  useEffect(() => {
    const email = loginEmail.trim().toLowerCase();
    if (email.length < 5 || !email.includes("@")) {
      setResolvedName("");
      return;
    }
    const handle = window.setTimeout(() => {
      void resolveEmployee(loginRole, email)
        .then((r) => setResolvedName(r.found ? r.full_name : ""))
        .catch(() => setResolvedName(""));
    }, 250);
    return () => window.clearTimeout(handle);
  }, [loginRole, loginEmail]);

  useEffect(() => {
    if (!session) return;
    fetchAssets(session.token)
      .then((rows) => {
        const list = Array.isArray(rows) ? rows : [];
        setAssets(list);
        setAssetCode((prev) => prev || list[0]?.code || "");
      })
      .catch((e: unknown) => reportError(e, "Could not load assets"));
  }, [session, reportError]);

  useEffect(() => {
    if (!session) return;
    try {
      if (tab === "history") void loadHistory();
      if (tab === "supervisor") void loadSupervisor();
      if (tab === "admin") void loadAdmin();
    } catch (err) {
      reportError(err, "Could not load this view");
    }
    // Intentional: loaders close over latest session/token
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tab, assetCode, session]);

  async function onLogin(e: FormEvent) {
    e.preventDefault();
    setLoginError(null);
    if (!loginEmail.trim().includes("@")) {
      setLoginError("Enter a valid employee email.");
      return;
    }
    if (!loginPassword) {
      setLoginError("Enter the password.");
      return;
    }
    setLoginBusy(true);
    try {
      const res = await loginEmployee({
        role: loginRole,
        email: loginEmail.trim().toLowerCase(),
        password: loginPassword,
      });
      setSession({
        role: res.employee.role,
        email: res.employee.email,
        token: res.session_token,
        fullName: res.employee.full_name,
        firstName: res.first_name,
        welcome: res.welcome,
      });
      setLoginPassword("");
      if (res.employee.role === "admin") setTab("admin");
      else if (res.employee.role === "planner") setTab("supervisor");
      else setTab("search");
    } catch (err) {
      setLoginError(toErrorMessage(err, "Login failed"));
    } finally {
      setLoginBusy(false);
    }
  }

  const emailsForRole = directory.filter((d) => d.role === loginRole && d.active);

  function submitOnEnter(e: KeyboardEvent<HTMLTextAreaElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      e.currentTarget.form?.requestSubmit();
    }
  }

  async function onSearch(e: FormEvent) {
    e.preventDefault();
    if (!session) return;
    if (query.trim().length < 2) {
      setFieldErrors({ query: "Describe the symptom or enter a fault code (2+ characters)." });
      return;
    }
    setFieldErrors({});
    setBusy(true);
    setError(null);
    try {
      const res = await searchWorkOrders(
        session.token,
        query.trim(),
        assetCode || undefined,
      );
      setSearchResult(res);
      setMarkedUseful(new Set());
    } catch (err) {
      reportError(err, "Search failed");
    } finally {
      setBusy(false);
    }
  }

  function validateCloseOut(): boolean {
    const next: Record<string, string> = {};
    if (!assetCode) next.asset = "Select an asset.";
    if (coSymptom.trim().length < 3) next.symptom = "Symptom is required.";
    if (coCause.trim().length < 3) next.cause = "Cause is required.";
    if (coFix.trim().length < 3) next.fix = "Fix is required.";
    if (coMins < 0 || Number.isNaN(coMins)) next.mins = "Minutes down must be 0 or more.";
    setFieldErrors(next);
    return Object.keys(next).length === 0;
  }

  async function onCloseOut(e: FormEvent) {
    e.preventDefault();
    if (!session || !validateCloseOut()) return;
    setBusy(true);
    setError(null);
    try {
      const res = await closeOut(session.token, {
        asset_code: assetCode,
        fault_code: coFault.trim(),
        symptom: coSymptom.trim(),
        cause: coCause.trim(),
        fix: coFix.trim(),
        parts_used: coParts.trim(),
        minutes_down: coMins,
      });
      setToast(`${res.external_id}: ${res.message}`);
      setCoSymptom("");
      setCoCause("");
      setCoFix("");
      setCoParts("");
      setCoFault("");
    } catch (err) {
      reportError(err, "Close-out failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadHistory() {
    if (!session || !assetCode) return;
    setBusy(true);
    setError(null);
    setHistorySearch(null);
    try {
      const rows = await fetchHistory(session.token, assetCode);
      setHistory(Array.isArray(rows) ? rows : []);
    } catch (err) {
      setHistory([]);
      reportError(err, "History failed");
    } finally {
      setBusy(false);
    }
  }

  async function onHistorySearch(e: FormEvent) {
    e.preventDefault();
    if (!session || !assetCode) {
      setError("Select an asset first.");
      return;
    }
    if (historyQuery.trim().length < 2) {
      setFieldErrors({ historyQuery: "Enter a symptom or fault code (2+ characters)." });
      return;
    }
    setFieldErrors({});
    setBusy(true);
    setError(null);
    try {
      const res = await searchWorkOrders(
        session.token,
        historyQuery.trim(),
        assetCode,
      );
      setHistorySearch(res);
    } catch (err) {
      reportError(err, "Asset search failed");
    } finally {
      setBusy(false);
    }
  }

  async function loadSupervisor(period: ChartPeriod = chartPeriod) {
    if (!session) return;
    setBusy(true);
    setError(null);
    try {
      const [ov, trend] = await Promise.all([
        fetchSupervisorOverview(session.token),
        fetchIssuesTrend(session.token, period),
      ]);
      setOverview(ov ?? null);
      setIssuesTrend(trend ?? null);
    } catch (err) {
      setOverview(null);
      setIssuesTrend(null);
      reportError(err, "Supervisor view failed");
    } finally {
      setBusy(false);
    }
  }

  async function onChartPeriodChange(period: ChartPeriod) {
    if (!session) return;
    setChartPeriod(period);
    setBusy(true);
    setError(null);
    try {
      setIssuesTrend(await fetchIssuesTrend(session.token, period));
    } catch (err) {
      reportError(err, "Chart failed");
    } finally {
      setBusy(false);
    }
  }

  function openAssetHistory(code: string, faultHint = "") {
    setAssetCode(code);
    if (faultHint) {
      setHistoryQuery(faultHint.replace(/-/g, " ").toLowerCase());
    }
    setTab("history");
  }

  async function copyMeetingBrief() {
    if (!overview?.meeting_brief) return;
    try {
      await navigator.clipboard.writeText(overview.meeting_brief);
      setToast("Meeting brief copied to clipboard.");
    } catch {
      setError("Could not copy brief — select the text manually.");
    }
  }

  async function loadAdmin() {
    if (!session || session.role !== "admin") return;
    setBusy(true);
    setError(null);
    try {
      const [status, feedback, roles, employees, logins] = await Promise.all([
        fetchAdminStatus(session.token),
        fetchAdminFeedback(session.token),
        fetchAdminRoles(session.token),
        fetchAdminEmployees(session.token),
        fetchAdminLogins(session.token),
      ]);
      setAdminStatus(status);
      setAdminFeedback(feedback);
      setAdminRoles(roles);
      setAdminEmployees(employees);
      setAdminLogins(logins);
    } catch (err) {
      reportError(err, "Admin console failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateEmployee(e: FormEvent) {
    e.preventDefault();
    if (!session || session.role !== "admin") return;
    if (empName.trim().length < 2 || !empEmail.includes("@")) {
      setFieldErrors({ emp: "Name and a valid email are required." });
      return;
    }
    setFieldErrors({});
    setBusy(true);
    setError(null);
    try {
      const created = await createEmployee(session.token, {
        email: empEmail.trim().toLowerCase(),
        full_name: empName.trim(),
        role: empRole,
        floor_level: empFloor.trim(),
        function_title: empFunction.trim(),
        rank_level: empRank.trim(),
        shift: empShift.trim(),
      });
      setToast(`Added ${created.full_name} (${created.role}) to the directory.`);
      setEmpName("");
      setEmpEmail("");
      await loadAdmin();
      try {
        setDirectory(await fetchEmployees());
      } catch {
        /* directory refresh is best-effort */
      }
    } catch (err) {
      reportError(err, "Add employee failed");
    } finally {
      setBusy(false);
    }
  }

  async function onToggleEmployee(emp: Employee) {
    if (!session || session.role !== "admin") return;
    setBusy(true);
    setError(null);
    try {
      await setEmployeeActive(session.token, emp.id, !emp.active);
      setToast(`${emp.full_name} is now ${emp.active ? "inactive" : "active"}.`);
      await loadAdmin();
      try {
        setDirectory(await fetchEmployees());
      } catch {
        /* directory refresh is best-effort */
      }
    } catch (err) {
      reportError(err, "Update employee failed");
    } finally {
      setBusy(false);
    }
  }

  async function onDeleteEmployee(emp: Employee) {
    if (!session || session.role !== "admin") return;
    if (emp.email.toLowerCase() === session.email.toLowerCase()) {
      setError("You cannot delete your own account.");
      return;
    }
    const ok = window.confirm(
      `Delete account permanently?\n\n${emp.full_name} (${emp.email})\n\nThis cannot be undone. Sign-in history is kept.`,
    );
    if (!ok) return;
    setBusy(true);
    setError(null);
    try {
      const res = await deleteEmployee(session.token, emp.id);
      setToast(res.message);
      await loadAdmin();
      try {
        setDirectory(await fetchEmployees());
      } catch {
        /* directory refresh is best-effort */
      }
    } catch (err) {
      reportError(err, "Delete account failed");
    } finally {
      setBusy(false);
    }
  }

  async function onCreateAsset(e: FormEvent) {
    e.preventDefault();
    if (!session || session.role !== "admin") return;
    if (newAssetCode.trim().length < 2 || newAssetName.trim().length < 2) {
      setFieldErrors({
        adminAsset: "Asset code and name are required (2+ characters).",
      });
      return;
    }
    setFieldErrors({});
    setBusy(true);
    setError(null);
    try {
      const asset = await createAsset(session.token, {
        code: newAssetCode.trim(),
        name: newAssetName.trim(),
        area: newAssetArea.trim(),
      });
      setToast(`Asset ${asset.code} created.`);
      setNewAssetCode("");
      setNewAssetName("");
      setAssets(await fetchAssets(session.token));
      await loadAdmin();
    } catch (err) {
      reportError(err, "Create asset failed");
    } finally {
      setBusy(false);
    }
  }

  async function onReembed() {
    if (!session || session.role !== "admin") return;
    setBusy(true);
    setError(null);
    try {
      const res = await reembedCorpus(session.token);
      setToast(res.message);
      await loadAdmin();
    } catch (err) {
      reportError(err, "Re-embed failed");
    } finally {
      setBusy(false);
    }
  }

  async function onUseful(hitId: number, score: number) {
    if (!session || !searchResult || markedUseful.has(hitId) || feedbackBusy !== null) return;
    setFeedbackBusy(hitId);
    setError(null);
    try {
      const res = await markUseful(session.token, {
        query_text: searchResult.query,
        work_order_id: hitId,
        useful: true,
        score,
      });
      setMarkedUseful((prev) => new Set(prev).add(hitId));
      setSearchResult((prev) => {
        if (!prev) return prev;
        const hits = Array.isArray(prev.hits) ? prev.hits : [];
        return {
          ...prev,
          hits: hits.map((h) =>
            h.id === hitId ? { ...h, useful_votes: res.useful_votes } : h,
          ),
        };
      });
      setToast(`${res.message} (${res.useful_votes} useful vote${res.useful_votes === 1 ? "" : "s"})`);
    } catch (err) {
      reportError(err, "Feedback failed");
    } finally {
      setFeedbackBusy(null);
    }
  }

  if (!session) {
    const emailHintId = resolvedName
      ? "login-identity"
      : loginEmail.includes("@")
        ? "login-email-error"
        : undefined;
    return (
      <div className="shell login-shell">
        <a className="skip-link" href="#login-form">
          Skip to sign in
        </a>
        <header className="brand-hero">
          <h1>FaultTrace</h1>
          <p className="lede">Maintenance history you can find.</p>
        </header>
        <form
          id="login-form"
          className="panel login-panel stack"
          onSubmit={onLogin}
          aria-labelledby="login-heading"
        >
          <h2 id="login-heading">Sign in</h2>

          <label htmlFor="login-role">
            Role
            <select
              id="login-role"
              value={loginRole}
              onChange={(e) => {
                setLoginRole(e.target.value as Role);
                setLoginEmail("");
                setResolvedName("");
              }}
            >
              <option value="technician">Technician</option>
              <option value="planner">Supervisor</option>
              <option value="admin">Admin</option>
            </select>
          </label>

          <label htmlFor="login-email">
            Email
            <input
              id="login-email"
              type="email"
              list="employee-emails"
              value={loginEmail}
              onChange={(e) => setLoginEmail(e.target.value)}
              placeholder={
                loginRole === "technician"
                  ? "tech@cardinal.local"
                  : loginRole === "planner"
                    ? "planner@cardinal.local"
                    : "admin@cardinal.local"
              }
              required
              autoComplete="username"
              aria-invalid={Boolean(loginEmail.includes("@") && !resolvedName)}
              aria-describedby={emailHintId}
            />
            <datalist id="employee-emails">
              {emailsForRole.map((emp) => (
                <option key={emp.id} value={emp.email}>
                  {emp.full_name}
                </option>
              ))}
            </datalist>
          </label>

          {resolvedName ? (
            <p id="login-identity" className="resolved-name" role="status" aria-live="polite">
              Signed identity: <strong>{resolvedName}</strong>
            </p>
          ) : loginEmail.includes("@") ? (
            <p id="login-email-error" className="field-error" role="alert">
              No active {ROLE_LABEL[loginRole].toLowerCase()} with that email.
            </p>
          ) : null}

          <label htmlFor="login-password">
            Password
            <input
              id="login-password"
              type="password"
              value={loginPassword}
              onChange={(e) => setLoginPassword(e.target.value)}
              placeholder="Enter password"
              required
              autoComplete="current-password"
              aria-invalid={Boolean(loginError)}
              aria-describedby={loginError ? "login-error" : undefined}
            />
          </label>

          {loginError && (
            <p id="login-error" className="field-error" role="alert">
              {loginError}
            </p>
          )}
          <button type="submit" className="primary" disabled={loginBusy} aria-busy={loginBusy}>
            {loginBusy ? "Signing in…" : "Sign in"}
          </button>
        </form>
        <footer className="brand-foot">
          <strong>Cardinal Precision</strong>
          <span>Find the fix that worked</span>
        </footer>
      </div>
    );
  }

  const role = session.role;
  const email = session.email;
  const canSupervise = role === "planner" || role === "admin";
  const isAdmin = role === "admin";

  const tabs: { id: Tab; label: string; show: boolean }[] = [
    { id: "search", label: "Search", show: true },
    { id: "closeout", label: "Close-out", show: true },
    { id: "history", label: "Asset history", show: true },
    { id: "supervisor", label: "Supervisor", show: canSupervise },
    { id: "admin", label: "Admin", show: isAdmin },
  ];

  const visibleTabs = tabs.filter((t) => t.show);

  function onTabKeyDown(e: KeyboardEvent<HTMLButtonElement>, index: number) {
    if (!visibleTabs.length) return;
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft" && e.key !== "Home" && e.key !== "End") {
      return;
    }
    e.preventDefault();
    let next = index;
    if (e.key === "ArrowRight") next = (index + 1) % visibleTabs.length;
    if (e.key === "ArrowLeft") next = (index - 1 + visibleTabs.length) % visibleTabs.length;
    if (e.key === "Home") next = 0;
    if (e.key === "End") next = visibleTabs.length - 1;
    const target = visibleTabs[next];
    if (!target) return;
    setTab(target.id);
    window.requestAnimationFrame(() => {
      document.getElementById(`tab-${target.id}`)?.focus();
    });
  }

  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        Skip to main content
      </a>
      <header className="topbar">
        <div className="brand-block">
          <h1>FaultTrace</h1>
        </div>
        <div className="session" aria-label="Signed-in user">
          <span className="welcome-line">
            {session.welcome || (session.firstName ? `Welcome ${session.firstName}` : "Welcome")}
          </span>
          <span className={`role-badge ${role}`}>
            {isAdmin ? "Admin · full access" : role === "planner" ? "Supervisor desk" : "Technician · floor"}
          </span>
          <span>
            {session.fullName ? `${session.fullName} · ` : ""}
            {email}
          </span>
          <button
            type="button"
            className="ghost"
            aria-label={`Sign out ${session.fullName || email}`}
            onClick={() => {
              setSession(null);
              setLoginPassword("");
            }}
          >
            Sign out
          </button>
        </div>
      </header>

      <div className="tabs" role="tablist" aria-label="App sections">
        {visibleTabs.map((t, index) => (
          <button
            key={t.id}
            id={`tab-${t.id}`}
            type="button"
            role="tab"
            aria-selected={tab === t.id}
            aria-controls="main-content"
            tabIndex={tab === t.id ? 0 : -1}
            className={tab === t.id ? "tab active" : "tab"}
            onClick={() => setTab(t.id)}
            onKeyDown={(e) => onTabKeyDown(e, index)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {(error || toast) && (
        <div
          className={`banner ${error ? "err" : "ok"}`}
          role={error ? "alert" : "status"}
          aria-live={error ? "assertive" : "polite"}
        >
          <span>{error || toast}</span>
          <button
            type="button"
            aria-label="Dismiss notification"
            onClick={() => {
              setError(null);
              setToast(null);
            }}
          >
            Dismiss
          </button>
        </div>
      )}

      <main id="main-content" className="panel" role="tabpanel" tabIndex={-1} aria-labelledby={`tab-${tab}`}>
        {tab === "search" && (
          <section aria-labelledby="search-heading">
            <h2 id="search-heading">Symptom / fault search</h2>
            <p className="lede">
              Try messy vocabulary: “spndl drift”, “axis wander”, “SPIN-DRFT”. Answers cite work
              order IDs — or refuse if nothing is close enough.
            </p>
            <form className="stack" onSubmit={onSearch} aria-label="Search work-order history">
              <label htmlFor="search-asset">
                Asset filter
                <select
                  id="search-asset"
                  value={assetCode}
                  onChange={(e) => setAssetCode(e.target.value)}
                >
                  <option value="">All assets</option>
                  {assets.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label htmlFor="search-query">
                What are you seeing?
                <textarea
                  id="search-query"
                  rows={3}
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={submitOnEnter}
                  placeholder="e.g. spndl drift on X after warm-up"
                  required
                  aria-invalid={Boolean(fieldErrors.query)}
                  aria-describedby={fieldErrors.query ? "search-query-error" : "search-query-hint"}
                />
                <span id="search-query-hint" className="sr-only">
                  Press Enter to search. Shift+Enter for a new line.
                </span>
                {fieldErrors.query && (
                  <span id="search-query-error" className="field-error" role="alert">
                    {fieldErrors.query}
                  </span>
                )}
              </label>
              <button type="submit" className="primary" disabled={busy} aria-busy={busy}>
                {busy ? "Searching…" : "Search history"}
              </button>
            </form>

            <aside className="safety" aria-labelledby="safety-heading">
              <h3 id="safety-heading">Safety documents (linked, never generated)</h3>
              <ul>
                {SAFETY_LINKS.map((s) => (
                  <li key={s.id}>
                    <a href={s.href} target="_blank" rel="noopener noreferrer">
                      {s.title}
                      <span className="sr-only"> (opens in new tab)</span>
                    </a>
                  </li>
                ))}
              </ul>
            </aside>

            {searchResult && (
              <div className={`result ${searchResult.refusal ? "refuse" : ""}`}>
                <h3>{searchResult.refusal ? "Nothing reliable found" : "Grounded summary"}</h3>
                <pre className="summary">{searchResult.summary || ""}</pre>
                {(searchResult.citations ?? []).length > 0 && (
                  <div className="cites">
                    <p className="cites-label">Citations — mark a prior case useful when it helped:</p>
                    <ul className="cite-actions">
                      {(searchResult.citations ?? []).map((c) => {
                        const hit = (searchResult.hits ?? []).find((h) => h.external_id === c);
                        if (!hit) {
                          return (
                            <li key={c}>
                              <code>{c}</code>
                            </li>
                          );
                        }
                        const done = markedUseful.has(hit.id);
                        return (
                          <li key={c}>
                            <code>{c}</code>
                            <span className="vote-count">{hit.useful_votes} useful</span>
                            <button
                              type="button"
                              className={done ? "useful-btn done" : "useful-btn"}
                              disabled={done || feedbackBusy === hit.id}
                              aria-pressed={done}
                              aria-label={
                                done
                                  ? `${c} already marked useful`
                                  : `Mark citation ${c} as useful`
                              }
                              onClick={() => void onUseful(hit.id, hit.score)}
                            >
                              {done
                                ? "Marked useful"
                                : feedbackBusy === hit.id
                                  ? "Saving…"
                                  : "Mark useful"}
                            </button>
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                <ul className="hits">
                  {(searchResult.hits ?? []).map((h) => {
                    const done = markedUseful.has(h.id);
                    return (
                      <li key={h.id}>
                        <div className="hit-head">
                          <strong>{h.external_id}</strong>
                          <span>
                            {h.asset_code} · {h.fault_code || "—"} · score{" "}
                            {Number.isFinite(h.score) ? h.score.toFixed(2) : "—"} ·{" "}
                            {h.useful_votes ?? 0} useful
                          </span>
                        </div>
                        <p>{h.symptom}</p>
                        <p>
                          <em>Cause:</em> {h.cause || "—"} · <em>Fix:</em> {h.fix || "—"}
                        </p>
                        {!searchResult.refusal && (
                          <button
                            type="button"
                            className={done ? "useful-btn done" : "useful-btn"}
                            disabled={done || feedbackBusy === h.id}
                            aria-pressed={done}
                            aria-label={
                              done
                                ? `${h.external_id} already marked useful`
                                : `Mark ${h.external_id} as useful`
                            }
                            onClick={() => void onUseful(h.id, h.score)}
                          >
                            {done
                              ? "Marked useful"
                              : feedbackBusy === h.id
                                ? "Saving…"
                                : "Mark useful"}
                          </button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              </div>
            )}
          </section>
        )}

        {tab === "closeout" && (
          <section aria-labelledby="closeout-heading">
            <h2 id="closeout-heading">Structured close-out</h2>
            <p className="lede">
              Cause, fix, parts, and minutes down are embedded immediately so the next shift can
              find this case.
            </p>
            <form className="stack" onSubmit={onCloseOut}>
              <label>
                Asset
                <select value={assetCode} onChange={(e) => setAssetCode(e.target.value)} required>
                  {assets.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
                {fieldErrors.asset && <span className="field-error">{fieldErrors.asset}</span>}
              </label>
              <label>
                Fault code
                <input value={coFault} onChange={(e) => setCoFault(e.target.value)} />
              </label>
              <label>
                Symptom
                <textarea
                  rows={2}
                  value={coSymptom}
                  onChange={(e) => setCoSymptom(e.target.value)}
                  required
                />
                {fieldErrors.symptom && <span className="field-error">{fieldErrors.symptom}</span>}
              </label>
              <label>
                Cause
                <textarea rows={2} value={coCause} onChange={(e) => setCoCause(e.target.value)} required />
                {fieldErrors.cause && <span className="field-error">{fieldErrors.cause}</span>}
              </label>
              <label>
                Fix
                <textarea rows={2} value={coFix} onChange={(e) => setCoFix(e.target.value)} required />
                {fieldErrors.fix && <span className="field-error">{fieldErrors.fix}</span>}
              </label>
              <label>
                Parts used
                <input value={coParts} onChange={(e) => setCoParts(e.target.value)} />
              </label>
              <label>
                Minutes down
                <input
                  type="number"
                  min={0}
                  value={coMins}
                  onChange={(e) => setCoMins(Number(e.target.value))}
                />
                {fieldErrors.mins && <span className="field-error">{fieldErrors.mins}</span>}
              </label>
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Saving…" : "Save close-out"}
              </button>
            </form>
          </section>
        )}

        {tab === "history" && (
          <section aria-labelledby="history-heading">
            <h2 id="history-heading">Asset history</h2>
            <p className="lede">
              Browse every closed work order for an asset, or run a semantic search limited to that
              asset only.
            </p>
            <form className="stack history-search" onSubmit={onHistorySearch}>
              <label>
                Asset
                <select
                  value={assetCode}
                  onChange={(e) => {
                    setAssetCode(e.target.value);
                    setHistorySearch(null);
                  }}
                  required
                >
                  {assets.map((a) => (
                    <option key={a.code} value={a.code}>
                      {a.code} — {a.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Search this asset’s history
                <textarea
                  rows={2}
                  value={historyQuery}
                  onChange={(e) => setHistoryQuery(e.target.value)}
                  onKeyDown={submitOnEnter}
                  placeholder="e.g. spindle drift, overheating, e-stop"
                />
                {fieldErrors.historyQuery && (
                  <span className="field-error">{fieldErrors.historyQuery}</span>
                )}
              </label>
              <div className="btn-row">
                <button type="submit" className="primary" disabled={busy || !assetCode}>
                  {busy ? "Searching…" : "Search"}
                </button>
                {historySearch && (
                  <button
                    type="button"
                    className="ghost"
                    onClick={() => setHistorySearch(null)}
                  >
                    Clear search
                  </button>
                )}
              </div>
            </form>

            {historySearch && (
              <div className={`result ${historySearch.refusal ? "refuse" : ""}`}>
                <h3>
                  {historySearch.refusal
                    ? `Nothing reliable on ${assetCode}`
                    : `Semantic matches on ${assetCode}`}
                </h3>
                <pre className="summary">{historySearch.summary || ""}</pre>
                {(historySearch.citations ?? []).length > 0 && (
                  <p className="cites">
                    Citations:{" "}
                    {(historySearch.citations ?? []).map((c) => (
                      <code key={c}>{c}</code>
                    ))}
                  </p>
                )}
                <ul className="hits">
                  {(historySearch.hits ?? []).map((h) => (
                    <li key={h.id}>
                      <div className="hit-head">
                        <strong>{h.external_id}</strong>
                        <span>
                          {h.fault_code || "—"} · score{" "}
                          {Number.isFinite(h.score) ? h.score.toFixed(2) : "—"} · {h.minutes_down}{" "}
                          min
                        </span>
                      </div>
                      <p>{h.symptom}</p>
                      <p>
                        <em>Cause:</em> {h.cause || "—"} · <em>Fix:</em> {h.fix || "—"}
                      </p>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <h3 className="spaced">Full timeline</h3>
            {busy && !historySearch && <p className="lede">Loading…</p>}
            <ul className="hits">
              {(history ?? []).map((h) => (
                <li key={h.external_id}>
                  <div className="hit-head">
                    <strong>{h.external_id}</strong>
                    <span>
                      {h.fault_code || "—"} · {h.minutes_down} min
                    </span>
                  </div>
                  <p>{h.symptom}</p>
                  <p>
                    <em>Fix:</em> {h.fix || "—"}
                  </p>
                </li>
              ))}
            </ul>
          </section>
        )}

        {tab === "supervisor" && canSupervise && (
          <section aria-labelledby="supervisor-heading">
            <h2 id="supervisor-heading">Supervisor desk</h2>
            <p className="lede">
              Recurring faults, parts to stock, downtime by cause, and a weekly meeting brief —
              with actions that open the asset history for follow-up.
            </p>
            <div className="btn-row" style={{ marginBottom: "1rem" }}>
              <button
                type="button"
                className="primary"
                disabled={busy}
                onClick={() => void loadSupervisor()}
              >
                {busy ? "Refreshing…" : "Refresh dashboard"}
              </button>
              <button type="button" className="ghost" disabled={!overview} onClick={() => void copyMeetingBrief()}>
                Copy meeting brief
              </button>
            </div>

            {busy && !overview && <p className="lede">Loading…</p>}

            <IssuesChart
              trend={issuesTrend}
              period={chartPeriod}
              onPeriodChange={(p) => void onChartPeriodChange(p)}
              busy={busy}
            />

            {overview && (
              <>
                <div className="kpi-row">
                  <div className="kpi">
                    <span>Minutes down</span>
                    <strong>{overview.total_minutes_down}</strong>
                  </div>
                  <div className="kpi">
                    <span>Work orders</span>
                    <strong>{overview.total_work_orders}</strong>
                  </div>
                  <div className="kpi">
                    <span>Assets</span>
                    <strong>{overview.assets_tracked}</strong>
                  </div>
                  <div className="kpi">
                    <span>Useful votes</span>
                    <strong>{overview.total_useful_votes}</strong>
                  </div>
                </div>

                <h3 className="spaced">Recommended actions</h3>
                <ul className="action-list">
                  {(overview.actions ?? []).map((a) => (
                    <li key={a.title} className={`action ${a.priority}`}>
                      <div>
                        <strong>{a.title}</strong>
                        <p>{a.detail}</p>
                      </div>
                      {a.asset_code && (
                        <button
                          type="button"
                          className="useful-btn"
                          onClick={() => openAssetHistory(a.asset_code, a.fault_key)}
                        >
                          Open history
                        </button>
                      )}
                    </li>
                  ))}
                </ul>

                <h3 className="spaced">Weekly meeting brief</h3>
                <pre className="summary brief">{overview.meeting_brief}</pre>

                <h3 className="spaced">Parts to stock</h3>
                <p className="lede">Based on parts recorded in close-outs — prioritize high for the crib.</p>
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Part</th>
                      <th>Priority</th>
                      <th>Uses</th>
                      <th>Assets</th>
                      <th>Linked min</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.parts_to_stock ?? []).map((p) => (
                      <tr key={p.part_name}>
                        <td>{p.part_name}</td>
                        <td>
                          <span className={`pill ${p.stock_priority}`}>{p.stock_priority}</span>
                        </td>
                        <td>{p.times_used}</td>
                        <td>{p.assets.join(", ")}</td>
                        <td>{p.related_minutes_down}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h3 className="spaced">Recurring faults</h3>
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Fault</th>
                      <th>Count</th>
                      <th>Minutes</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.recurring ?? []).map((r) => (
                      <tr key={`${r.asset_code}-${r.fault_key}`}>
                        <td>{r.asset_code}</td>
                        <td>{r.fault_key}</td>
                        <td>{r.occurrences}</td>
                        <td>{r.total_minutes_down}</td>
                        <td>
                          <button
                            type="button"
                            className="linkish"
                            onClick={() => openAssetHistory(r.asset_code, r.fault_key)}
                          >
                            Investigate
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h3 className="spaced">Downtime by asset</h3>
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Asset</th>
                      <th>Name</th>
                      <th>WOs</th>
                      <th>Minutes</th>
                      <th></th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.downtime_by_asset ?? []).map((r) => (
                      <tr key={r.asset_code}>
                        <td>{r.asset_code}</td>
                        <td>{r.asset_name}</td>
                        <td>{r.work_order_count}</td>
                        <td>{r.total_minutes_down}</td>
                        <td>
                          <button
                            type="button"
                            className="linkish"
                            onClick={() => openAssetHistory(r.asset_code)}
                          >
                            View history
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h3 className="spaced">Downtime by cause</h3>
                <table className="grid">
                  <thead>
                    <tr>
                      <th>Cause</th>
                      <th>Count</th>
                      <th>Minutes</th>
                      <th>Assets</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.downtime_by_cause ?? []).map((c) => (
                      <tr key={c.cause}>
                        <td>{c.cause}</td>
                        <td>{c.occurrences}</td>
                        <td>{c.total_minutes_down}</td>
                        <td>{c.sample_assets.join(", ")}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                <h3 className="spaced">Most useful prior cases</h3>
                <p className="lede">Technicians marked these suggestions useful — good training / crib notes.</p>
                <ul className="hits">
                  {(overview.useful_cases ?? []).map((u) => (
                    <li key={u.external_id}>
                      <div className="hit-head">
                        <strong>{u.external_id}</strong>
                        <span>
                          {u.asset_code} · {u.fault_code || "—"} · {u.useful_votes} useful ·{" "}
                          {u.minutes_down} min
                        </span>
                      </div>
                      <p>{u.symptom}</p>
                      <button
                        type="button"
                        className="linkish"
                        onClick={() => openAssetHistory(u.asset_code, u.fault_code)}
                      >
                        Open asset history
                      </button>
                    </li>
                  ))}
                </ul>
              </>
            )}
          </section>
        )}

        {tab === "admin" && isAdmin && (
          <section aria-labelledby="admin-heading">
            <h2 id="admin-heading">Admin console</h2>
            <p className="lede">
              Full system access. Planners see the supervisor desk only — they cannot open this
              console or change the corpus / asset register.
            </p>
            <div className="btn-row" style={{ marginBottom: "1rem" }}>
              <button type="button" className="primary" disabled={busy} onClick={() => void loadAdmin()}>
                {busy ? "Refreshing…" : "Refresh console"}
              </button>
              <button type="button" className="useful-btn" disabled={busy} onClick={() => void onReembed()}>
                Re-embed all work orders
              </button>
            </div>

            {adminStatus && (
              <div className="kpi-row">
                <div className="kpi">
                  <span>Auth / AI</span>
                  <strong className="kpi-sm">
                    {adminStatus.auth_mode} / {adminStatus.ai_mode}
                  </strong>
                </div>
                <div className="kpi">
                  <span>Assets</span>
                  <strong>{adminStatus.asset_count}</strong>
                </div>
                <div className="kpi">
                  <span>Work orders</span>
                  <strong>{adminStatus.work_order_count}</strong>
                </div>
                <div className="kpi">
                  <span>Feedback events</span>
                  <strong>{adminStatus.feedback_count}</strong>
                </div>
                <div className="kpi">
                  <span>Sign-ins logged</span>
                  <strong>{adminStatus.login_count}</strong>
                </div>
              </div>
            )}

            {adminStatus && (
              <>
                <h3 className="spaced">System</h3>
                <pre className="summary">
{`App: ${adminStatus.app}
Database: ${adminStatus.database_url_safe}
Retrieval top_k: ${adminStatus.retrieval_top_k}
Min score: ${adminStatus.retrieval_min_score}
Useful votes (corpus): ${adminStatus.total_useful_votes}
Access level: ${adminStatus.access}`}
                </pre>
              </>
            )}

            <h3 className="spaced">Role directory</h3>
            <table className="grid">
              <thead>
                <tr>
                  <th>Role</th>
                  <th>Demo email</th>
                  <th>Access</th>
                </tr>
              </thead>
              <tbody>
                {(adminRoles ?? []).map((r) => (
                  <tr key={r.role}>
                    <td>{r.role}</td>
                    <td>{r.email}</td>
                    <td>{r.access}</td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="spaced">Who signed in</h3>
            <p className="lede">
              Every successful login is recorded here — newest first. Click Refresh console after
              someone signs in to see them.
            </p>
            <table className="grid">
              <thead>
                <tr>
                  <th>When (local)</th>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Role</th>
                  <th>Floor</th>
                  <th>Shift</th>
                </tr>
              </thead>
              <tbody>
                {adminLogins.length === 0 && (
                  <tr>
                    <td colSpan={6}>No sign-ins recorded yet. Have someone log in, then refresh.</td>
                  </tr>
                )}
                {adminLogins.map((ev) => {
                  const when =
                    ev.logged_in_local ||
                    (ev.logged_in_at
                      ? new Date(ev.logged_in_at).toLocaleString(undefined, {
                          dateStyle: "medium",
                          timeStyle: "medium",
                        })
                      : "—");
                  const ago = (() => {
                    if (!ev.logged_in_at) return "";
                    const ms = Date.now() - new Date(ev.logged_in_at).getTime();
                    if (Number.isNaN(ms) || ms < 0) return "";
                    const mins = Math.floor(ms / 60000);
                    if (mins < 1) return "just now";
                    if (mins < 60) return `${mins} min ago`;
                    const hrs = Math.floor(mins / 60);
                    if (hrs < 24) return `${hrs} hr ago`;
                    return `${Math.floor(hrs / 24)} day(s) ago`;
                  })();
                  return (
                    <tr key={ev.id}>
                      <td>
                        <div>{when}</div>
                        {ago && <div className="cell-sub">{ago}</div>}
                      </td>
                      <td>{ev.full_name}</td>
                      <td>{ev.email}</td>
                      <td>{ev.role === "planner" ? "supervisor" : ev.role}</td>
                      <td>{ev.floor_level || "—"}</td>
                      <td>{ev.shift || "—"}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>

            <h3 className="spaced">Employees / users</h3>
            <p className="lede">
              Add technicians, supervisors, and admins with floor level, rank, and function. New
              users can sign in when active (password defaults to ADMIN).
            </p>
            <form className="stack" onSubmit={onCreateEmployee}>
              <label>
                Full name
                <input
                  value={empName}
                  onChange={(e) => setEmpName(e.target.value)}
                  placeholder="e.g. Riley Chen"
                  required
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  value={empEmail}
                  onChange={(e) => setEmpEmail(e.target.value)}
                  placeholder="e.g. riley.chen@cardinal.local"
                  required
                />
              </label>
              <label>
                Role / access level
                <select value={empRole} onChange={(e) => setEmpRole(e.target.value as Role)}>
                  <option value="technician">Technician — floor tools</option>
                  <option value="planner">Supervisor — meeting desk</option>
                  <option value="admin">Admin — full access</option>
                </select>
              </label>
              <label>
                Floor level
                <input
                  value={empFloor}
                  onChange={(e) => setEmpFloor(e.target.value)}
                  placeholder="e.g. Floor 2 / Cell 12"
                />
              </label>
              <label>
                Function
                <input
                  value={empFunction}
                  onChange={(e) => setEmpFunction(e.target.value)}
                  placeholder="e.g. CNC maintenance"
                />
              </label>
              <label>
                Rank
                <input
                  value={empRank}
                  onChange={(e) => setEmpRank(e.target.value)}
                  placeholder="e.g. Tech II, Lead, Supervisor"
                />
              </label>
              <label>
                Shift
                <select value={empShift} onChange={(e) => setEmpShift(e.target.value)}>
                  <option value="Day">Day</option>
                  <option value="Night">Night</option>
                </select>
              </label>
              {fieldErrors.emp && <span className="field-error">{fieldErrors.emp}</span>}
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Saving…" : "Add employee"}
              </button>
            </form>

            <table className="grid spaced">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Role</th>
                  <th>Floor</th>
                  <th>Function</th>
                  <th>Rank</th>
                  <th>Shift</th>
                  <th>Status</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {(adminEmployees ?? []).map((emp) => (
                  <tr key={emp.id}>
                    <td>
                      <strong>{emp.full_name}</strong>
                      <div className="cell-sub">{emp.email}</div>
                    </td>
                    <td>{emp.role}</td>
                    <td>{emp.floor_level || "—"}</td>
                    <td>{emp.function_title || "—"}</td>
                    <td>{emp.rank_level || "—"}</td>
                    <td>{emp.shift || "—"}</td>
                    <td>
                      <span className={`pill ${emp.active ? "medium" : "watch"}`}>
                        {emp.active ? "active" : "inactive"}
                      </span>
                    </td>
                    <td>
                      <div className="btn-row">
                        <button
                          type="button"
                          className="linkish"
                          disabled={busy}
                          onClick={() => void onToggleEmployee(emp)}
                        >
                          {emp.active ? "Deactivate" : "Reactivate"}
                        </button>
                        <button
                          type="button"
                          className="linkish danger"
                          disabled={
                            busy || emp.email.toLowerCase() === session.email.toLowerCase()
                          }
                          aria-label={`Delete account ${emp.full_name}`}
                          title={
                            emp.email.toLowerCase() === session.email.toLowerCase()
                              ? "You cannot delete your own account"
                              : "Delete account permanently"
                          }
                          onClick={() => void onDeleteEmployee(emp)}
                        >
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>

            <h3 className="spaced">Add asset</h3>
            <form className="stack" onSubmit={onCreateAsset}>
              <label>
                Code
                <input
                  value={newAssetCode}
                  onChange={(e) => setNewAssetCode(e.target.value)}
                  placeholder="e.g. CNC-15"
                />
              </label>
              <label>
                Name
                <input
                  value={newAssetName}
                  onChange={(e) => setNewAssetName(e.target.value)}
                  placeholder="e.g. Haas VF-4 Cell 15"
                />
              </label>
              <label>
                Area
                <input value={newAssetArea} onChange={(e) => setNewAssetArea(e.target.value)} />
              </label>
              {fieldErrors.adminAsset && (
                <span className="field-error">{fieldErrors.adminAsset}</span>
              )}
              <button type="submit" className="primary" disabled={busy}>
                {busy ? "Saving…" : "Create asset"}
              </button>
            </form>

            <h3 className="spaced">Retrieval feedback audit</h3>
            <p className="lede">Every “Mark useful” event — planner cannot see this log.</p>
            <table className="grid">
              <thead>
                <tr>
                  <th>Query</th>
                  <th>Work order</th>
                  <th>Score</th>
                  <th>Useful</th>
                </tr>
              </thead>
              <tbody>
                {adminFeedback.length === 0 && (
                  <tr>
                    <td colSpan={4}>No feedback yet — mark a search hit useful as a technician.</td>
                  </tr>
                )}
                {adminFeedback.map((f) => (
                  <tr key={f.id}>
                    <td>{f.query_text}</td>
                    <td>{f.work_order_external_id}</td>
                    <td>{f.score.toFixed(2)}</td>
                    <td>{f.useful ? "yes" : "no"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </main>

      <footer className="brand-foot">
        <strong>Cardinal Precision</strong>
        <span>Find the fix that worked</span>
      </footer>
    </div>
  );
}
