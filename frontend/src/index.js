import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// Order matters: tokens must load before any component CSS that var()s them.
// base.css imports tokens.css internally and sets the global body / scroll /
// focus styles. index.css carries the pre-redesign legacy styles and is kept
// for now so the old pages keep rendering until the redesign replaces them
// page by page; it will be removed at the end of the overhaul.
import "./styles/base.css";
import "./index.css";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
