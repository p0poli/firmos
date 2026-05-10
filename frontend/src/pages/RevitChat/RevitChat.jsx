/**
 * RevitChat — fullscreen chat page for the Revit WebView2 dockable panel.
 *
 * This page is intentionally standalone — no Layout, no Sidebar.
 * It reads the JWT from localStorage (key: "firmos_token") which is
 * injected by the Revit plugin after the WebView2 navigates here.
 *
 * URL: /#/revit-chat
 *
 * The WebView2 panel injects the token via:
 *   localStorage.setItem('firmos_token', '<jwt>');
 *   location.reload();
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import { ArrowUp, Brain } from "lucide-react";
import axios from "axios";
import styles from "./RevitChat.module.css";

const BASE_URL =
  process.env.REACT_APP_API_URL || "https://firmos-backend.onrender.com";

const TOKEN_KEY = "firmos_token";

function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

function makeApi() {
  const token = getToken();
  return axios.create({
    baseURL: BASE_URL,
    headers: token ? { Authorization: `Bearer ${token}` } : {},
  });
}

// ---------------------------------------------------------------------------
// Main component
// ---------------------------------------------------------------------------

export default function RevitChat() {
  const [messages, setMessages] = useState([]);
  const [input, setInput]       = useState("");
  const [loading, setLoading]   = useState(false);
  const [ready, setReady]       = useState(false);  // token is present
  const [convId, setConvId]     = useState(null);

  const bottomRef   = useRef(null);
  const textareaRef = useRef(null);

  // Check token on mount; re-check every 500 ms until present
  // (the Revit plugin injects it shortly after navigation).
  useEffect(() => {
    if (getToken()) { setReady(true); return; }
    const id = setInterval(() => {
      if (getToken()) { setReady(true); clearInterval(id); }
    }, 500);
    return () => clearInterval(id);
  }, []);

  // Auto-scroll
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, loading]);

  // Auto-resize textarea
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 120)}px`;
  }, [input]);

  const send = useCallback(async () => {
    const text = input.trim();
    if (!text || loading) return;

    setInput("");
    setMessages((prev) => [...prev, { role: "user", content: text }]);
    setLoading(true);

    try {
      const api = makeApi();
      const body = { content: text };
      if (convId) body.conversation_id = convId;

      const res = await api.post("/conversations/message", body);
      const data = res.data;

      if (data.conversation_id && !convId) setConvId(data.conversation_id);
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: data.content ?? data.response ?? "" },
      ]);
    } catch (err) {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content: "⚠️ Could not reach Vitruvius — check your connection.",
        },
      ]);
    } finally {
      setLoading(false);
    }
  }, [input, loading, convId]);

  const onKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      send();
    }
  };

  // ---------------------------------------------------------------------------
  // Render: "waiting for token" state
  // ---------------------------------------------------------------------------
  if (!ready) {
    return (
      <div className={styles.waiting}>
        <Brain size={28} strokeWidth={1.5} className={styles.waitingIcon} />
        <p>Connecting to Vitruvius…</p>
      </div>
    );
  }

  // ---------------------------------------------------------------------------
  // Render: chat interface
  // ---------------------------------------------------------------------------
  return (
    <div className={styles.root}>
      {/* Header */}
      <header className={styles.header}>
        <Brain size={16} strokeWidth={2} />
        <span className={styles.headerTitle}>Vitruvius AI</span>
      </header>

      {/* Messages */}
      <div className={styles.messages}>
        {messages.length === 0 && (
          <div className={styles.empty}>
            Ask anything about your project, tasks, or team.
          </div>
        )}
        {messages.map((m, i) => (
          <div
            key={i}
            className={m.role === "user" ? styles.msgUser : styles.msgAssistant}
          >
            {m.content}
          </div>
        ))}
        {loading && (
          <div className={styles.msgAssistant}>
            <span className={styles.dots}>
              <span /><span /><span />
            </span>
          </div>
        )}
        <div ref={bottomRef} />
      </div>

      {/* Input */}
      <div className={styles.inputRow}>
        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Message Vitruvius…"
          rows={1}
        />
        <button
          type="button"
          className={styles.sendBtn}
          onClick={send}
          disabled={!input.trim() || loading}
          aria-label="Send"
        >
          <ArrowUp size={16} strokeWidth={2.5} />
        </button>
      </div>
    </div>
  );
}
