/**
 * ChatPanel — the 320 px right-side chat drawer.
 *
 * Layout (top → bottom inside a flex column):
 *   1. Header      — "Vitruvius" wordmark + scope indicator + close [X]
 *   2. Messages    — scrollable, flex-grow; user right, assistant left
 *   3. Sharing bar — shown for the last assistant message only
 *   4. Input area  — auto-resize textarea + send button
 *
 * Sharing model
 * -------------
 * Every assistant message is automatically shared to firm memory when it
 * arrives (handled in ChatContext.sendMessage). The sharing bar lets the
 * user choose between two modes:
 *
 *   "Shared"            (default, green, Users icon)
 *     Visible to your firm, attributed to you.
 *
 *   "Shared anonymously" (blue, Shield icon)
 *     Visible to your firm, your name removed.
 *     Re-shares through the anonymization pipeline.
 *
 * There is no "private" option — all messages contribute to firm knowledge.
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Brain,
  Cpu,
  Shield,
  Users,
  X,
} from "lucide-react";
import { relativeTime } from "../../lib/dates";
import { useChat } from "../../contexts/ChatContext";
import styles from "./ChatPanel.module.css";

// ---------------------------------------------------------------------------
// ChatPanel
// ---------------------------------------------------------------------------

export function ChatPanel() {
  const {
    isOpen,
    toggleChat,
    messages,
    isLoading,
    currentProject,
    currentProjectId,
    sharingModes,
    sendMessage,
    setMessageAnonymous,
  } = useChat();

  const [input, setInput] = useState("");
  const textareaRef = useRef(null);
  const bottomRef = useRef(null);

  // Auto-scroll to bottom on new messages or loading state change
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages, isLoading]);

  // Auto-resize textarea
  const handleInputChange = (e) => {
    setInput(e.target.value);
    const el = e.target;
    el.style.height = "auto";
    el.style.height = Math.min(el.scrollHeight, 100) + "px";
  };

  const handleSend = useCallback(async () => {
    const trimmed = input.trim();
    if (!trimmed || isLoading) return;
    setInput("");
    if (textareaRef.current) {
      textareaRef.current.style.height = "auto";
    }
    await sendMessage(trimmed);
  }, [input, isLoading, sendMessage]);

  const handleKeyDown = (e) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend();
    }
  };

  // Focus textarea when panel opens
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => textareaRef.current?.focus(), 220);
    }
  }, [isOpen]);

  // Last assistant message (eligible for sharing bar)
  const lastAssistantMsg = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");

  return (
    <aside className={`${styles.panel} ${isOpen ? styles.open : ""}`}>
      <div className={styles.inner}>
        {/* ---- Header ---- */}
        <header className={styles.header}>
          <div className={styles.headerBrand}>
            <Brain size={15} className={styles.brandIcon} />
            <span className={styles.brandName}>Vitruvius</span>
          </div>
          <span className={styles.scope}>
            {currentProject
              ? `Scoped to: ${currentProject.name}`
              : "Firm-wide context"}
          </span>
          <button
            className={styles.closeBtn}
            onClick={toggleChat}
            aria-label="Close chat"
          >
            <X size={15} />
          </button>
        </header>

        {/* ---- Messages ---- */}
        <div className={styles.messages}>
          {messages.length === 0 && !isLoading && (
            <div className={styles.emptyState}>
              <Cpu size={28} className={styles.emptyIcon} />
              <p className={styles.emptyTitle}>Ask Vitruvius anything</p>
              <p className={styles.emptyDesc}>
                {currentProject
                  ? `Asking in the context of ${currentProject.name}.`
                  : "Firm-wide context — navigate to a project to scope the conversation."}
              </p>
            </div>
          )}

          {messages.map((msg) => (
            <ChatBubble key={msg.id} message={msg} />
          ))}

          {isLoading && <TypingIndicator />}

          {/* Scroll anchor */}
          <div ref={bottomRef} />
        </div>

        {/* ---- Sharing bar (last assistant message only, not optimistic) ---- */}
        {lastAssistantMsg && !lastAssistantMsg.id?.startsWith("optimistic") && (
          <SharingBar
            messageId={lastAssistantMsg.id}
            mode={sharingModes[lastAssistantMsg.id] ?? "attributed"}
            onSetAnonymous={setMessageAnonymous}
          />
        )}

        {/* ---- Input area ---- */}
        <div className={styles.inputArea}>
          {currentProjectId && currentProject && (
            <div className={styles.scopePill}>
              Asking about:{" "}
              <strong>{currentProject.name}</strong>
            </div>
          )}
          <div className={styles.inputRow}>
            <textarea
              ref={textareaRef}
              className={styles.textarea}
              value={input}
              onChange={handleInputChange}
              onKeyDown={handleKeyDown}
              placeholder="Ask anything…"
              rows={1}
              disabled={isLoading}
              aria-label="Message input"
            />
            <button
              className={styles.sendBtn}
              onClick={handleSend}
              disabled={isLoading || !input.trim()}
              aria-label="Send message"
            >
              <ArrowUp size={15} />
            </button>
          </div>
        </div>
      </div>
    </aside>
  );
}

// ---------------------------------------------------------------------------
// ChatBubble
// ---------------------------------------------------------------------------

function ChatBubble({ message }) {
  const isUser = message.role === "user";
  return (
    <div className={`${styles.bubbleWrap} ${isUser ? styles.bubbleUser : styles.bubbleAsst}`}>
      <div className={`${styles.bubble} ${isUser ? styles.bubbleUserBg : styles.bubbleAsstBg}`}>
        {message.content}
      </div>
      <span className={`${styles.timestamp} ${isUser ? styles.timestampRight : styles.timestampLeft}`}>
        {relativeTime(message.created_at)}
      </span>
    </div>
  );
}

// ---------------------------------------------------------------------------
// TypingIndicator
// ---------------------------------------------------------------------------

function TypingIndicator() {
  return (
    <div className={`${styles.bubbleWrap} ${styles.bubbleAsst}`}>
      <div className={`${styles.bubble} ${styles.bubbleAsstBg} ${styles.typingBubble}`}>
        <span className={styles.dot} />
        <span className={styles.dot} />
        <span className={styles.dot} />
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// SharingBar
// ---------------------------------------------------------------------------

/**
 * SharingBar — toggles between "Shared" (attributed, green) and
 * "Shared anonymously" (anonymous, blue).
 *
 * mode = "attributed" | "anonymous"
 */
function SharingBar({ messageId, mode, onSetAnonymous }) {
  const isAnonymous = mode === "anonymous";

  return (
    <div className={styles.sharingBar}>
      <div className={styles.sharingRow}>
        {/* Left label — Shared (attributed) */}
        <span className={`${styles.sharingLabel} ${!isAnonymous ? styles.sharingLabelGreen : ""}`}>
          <Users size={10} />
          Shared
        </span>

        {/* Toggle knob */}
        <button
          className={`${styles.sharingKnob} ${isAnonymous ? styles.sharingKnobAnon : styles.sharingKnobAttr}`}
          onClick={() => !isAnonymous && onSetAnonymous(messageId)}
          disabled={isAnonymous}
          aria-label={
            isAnonymous
              ? "Sharing anonymously"
              : "Switch to share anonymously"
          }
        />

        {/* Right label — Shared anonymously */}
        <span className={`${styles.sharingLabel} ${isAnonymous ? styles.sharingLabelBlue : ""}`}>
          <Shield size={10} />
          Shared anonymously
        </span>
      </div>

      <p className={styles.sharingHint}>
        {isAnonymous
          ? "Visible to your firm, your name removed"
          : "Visible to your firm, attributed to you"}
      </p>
    </div>
  );
}
