import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import ErrorBoundary from "./components/ErrorBoundary";
import "./styles.css";

const rootEl = document.getElementById("root");

if (!rootEl) {
  document.body.innerHTML =
    "<main style='font-family:sans-serif;padding:2rem'><h1>FaultTrace failed to start</h1><p>Missing #root element in index.html.</p></main>";
} else {
  createRoot(rootEl).render(
    <StrictMode>
      <ErrorBoundary>
        <App />
      </ErrorBoundary>
    </StrictMode>,
  );
}

window.addEventListener("unhandledrejection", (event) => {
  console.error("Unhandled promise rejection:", event.reason);
});

window.addEventListener("error", (event) => {
  console.error("Unhandled window error:", event.error || event.message);
});
