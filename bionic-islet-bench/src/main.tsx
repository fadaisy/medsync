import { StrictMode } from "react";
import { createRoot } from "react-dom/client";

import App from "./App.tsx";
import "./index.css";

// The production build declares this on <html> in index.html. The single-file
// preview has no <html> of its own, because the page it is embedded in
// supplies one, so the language is set here instead. British English, as the
// copy is written.
document.documentElement.lang = "en-GB";

const root = document.getElementById("root");
if (!root) throw new Error("no #root element");

createRoot(root).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
