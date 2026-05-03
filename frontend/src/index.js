import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
// base.css imports tokens.css internally and sets the global body /
// scroll / focus styles. The legacy index.css is gone — every page now
// styles itself via CSS modules over the tokens.
import "./styles/base.css";

const root = ReactDOM.createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
);
