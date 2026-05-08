/**
 * ChatPanel — the 320 px right-side chat drawer.
 *
 * Layout (top → bottom inside a flex column):
 *   1. Header   — "Vitruvius" wordmark + scope indicator + close [X]
 *   2. Messages — scrollable, flex-grow; user right, assistant left
 *   3. Memory share bar — shown for the last assistant message only
 *   4. Input area — auto-resize textarea + send button
 */
import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowUp,
  Brain,
  Check,
  Cpu,
  Lock,
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
    sharedMessageIds,
    sendMessage,
    shareMessage,
  } = useChat();

  const [input, setInput] = useState("");
  const [sharingId, setSharingId] = useState(null); // currently being shared
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

  // Last assistant message (eligible for sharing)
  const lastAssistantMsg = [...messages]
    .reverse()
    .find((m) => m.role === "assistant");

  const handleShare = async (msgId) => {
    if (sharingId) return;
    setSharingId(msgId);
    await shareMessage(msgId);
    setSharingId(null);
  };

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

        {/* ---- Memory share bar (last assistant message only) ---- */}
        {lastAssistantMsg && !lastAssistantMsg.id?.startsWith("optimistic") && (
          <MemoryShareBar
            messageId={lastAssistantMsg.id}
            isShared={sharedMessageIds.has(lastAssistantMsg.id)}
            isSharing={sharingId === lastAssistantMsg.id}
            onShare={handleShare}
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
// MemoryShareBar
// ---------------------------------------------------------------------------

function MemoryShareBar({ messageId, isShared, isSharing, onShare }) {
  return (
    <div className={styles.memoryBar}>
      <div className={styles.memoryToggleRow}>
        <span className={`${styles.memoryLabel} ${!isShared ? styles.memoryLabelActive : ""}`}>
          <Lock size={10} />
          Private
        </span>

        <button
          className={`${styles.memoryKnob} ${isShared ? styles.memoryKnobOn : ""}`}
          onClick={() => !isShared && onShare(messageId)}
          disabled={isShared || isSharing}
          aria-label={isShared ? "Shared to firm knowledge" : "Share anonymized to firm knowledge"}
        >
          {isShared && <Check size={8} strokeWidth={3} />}
        </button>

        <span className={`${styles.memoryLabel} ${isShared ? styles.memoryLabelActive : ""}`}>
          Share anonymized
        </span>
      </div>
      <p className={styles.memoryHint}>
        Sharing removes your name and project details
      </p>
    </div>
  );
}
