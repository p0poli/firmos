/**
 * ChatContext — persistent chat state for the Vitruvius panel.
 *
 * Provides
 * --------
 * isOpen              bool   — panel visibility
 * toggleChat()               — open ↔ close
 * messages            array  — full conversation history (user + assistant)
 * isLoading           bool   — waiting for AI response
 * currentProjectId    string — auto-detected from the /project/:id route
 * currentProject      object — project details (name, status) fetched on nav
 * sharedMessageIds    Set    — IDs of messages already shared to firm memory
 * sendMessage(content)       — optimistic add + API call
 * shareMessage(msgId)        — anonymize + persist MemoryChunk
 *
 * Project-scoping
 * ---------------
 * ChatProvider must live INSIDE <HashRouter> so useMatch() resolves against
 * the current hash path.  When the user is on /project/:id, all messages are
 * scoped to that project.  Navigating away resets scope to firm-wide (null).
 */
import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useRef,
  useState,
} from "react";
import { useMatch } from "react-router-dom";
import {
  getChatHistory,
  getProject,
  sendChatMessage,
  shareConversationMessage,
} from "../api";

const ChatContext = createContext(null);

export function ChatProvider({ children }) {
  // ---- panel state --------------------------------------------------------
  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [sharedMessageIds, setSharedMessageIds] = useState(new Set());

  // ---- project scope (auto-derived from route) ----------------------------
  const match = useMatch("/project/:id");
  const currentProjectId = match?.params?.id ?? null;
  const [currentProject, setCurrentProject] = useState(null);

  // Track whether we've loaded history for the current scope
  const loadedScopeRef = useRef(null); // "<projectId|null>:<isOpen>"

  // ---- fetch project name when scope changes ------------------------------
  useEffect(() => {
    if (!currentProjectId) {
      setCurrentProject(null);
      return;
    }
    getProject(currentProjectId)
      .then(setCurrentProject)
      .catch(() => setCurrentProject(null));
  }, [currentProjectId]);

  // ---- load history when panel opens or scope changes --------------------
  useEffect(() => {
    if (!isOpen) return;

    const scopeKey = `${currentProjectId}`;
    if (loadedScopeRef.current === scopeKey) return; // already loaded this scope
    loadedScopeRef.current = scopeKey;

    getChatHistory(currentProjectId, 100)
      .then((history) => {
        setMessages(
          history.map((m) => ({
            id: m.id,
            role: m.role,
            content: m.content,
            created_at: m.created_at,
            project_id: m.project_id,
          }))
        );
      })
      .catch(() => {
        // Graceful: history is non-critical
        setMessages([]);
      });
  }, [isOpen, currentProjectId]);

  // ---- reset history when scope changes (navigate between projects) -------
  useEffect(() => {
    // When the project scope changes, invalidate cached history
    // so the next open re-fetches.
    loadedScopeRef.current = null;
    setMessages([]);
    setSharedMessageIds(new Set());
  }, [currentProjectId]);

  // ---- actions ------------------------------------------------------------

  const toggleChat = useCallback(() => setIsOpen((v) => !v), []);

  const sendMessage = useCallback(
    async (content) => {
      if (!content.trim() || isLoading) return;

      const optimisticId = `optimistic-${Date.now()}`;

      // 1. Optimistic: add the user message immediately
      setMessages((prev) => [
        ...prev,
        {
          id: optimisticId,
          role: "user",
          content: content.trim(),
          created_at: new Date().toISOString(),
        },
      ]);
      setIsLoading(true);

      try {
        // 2. Call API — response is the assistant message
        const assistantMsg = await sendChatMessage(
          content.trim(),
          currentProjectId
        );

        setMessages((prev) => [
          ...prev,
          {
            id: assistantMsg.message_id,
            role: "assistant",
            content: assistantMsg.content,
            created_at: assistantMsg.created_at,
          },
        ]);
      } catch {
        // Remove the optimistic message on failure so the user knows
        // something went wrong.
        setMessages((prev) => prev.filter((m) => m.id !== optimisticId));
      } finally {
        setIsLoading(false);
      }
    },
    [isLoading, currentProjectId]
  );

  const shareMessage = useCallback(
    async (messageId) => {
      if (sharedMessageIds.has(messageId)) return null;
      try {
        const result = await shareConversationMessage(messageId);
        setSharedMessageIds((prev) => new Set([...prev, messageId]));
        return result;
      } catch {
        return null;
      }
    },
    [sharedMessageIds]
  );

  // ---- context value ------------------------------------------------------

  const value = {
    isOpen,
    toggleChat,
    messages,
    isLoading,
    currentProjectId,
    currentProject,
    sharedMessageIds,
    sendMessage,
    shareMessage,
  };

  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>;
}

export function useChat() {
  const ctx = useContext(ChatContext);
  if (!ctx) throw new Error("useChat must be used inside <ChatProvider>");
  return ctx;
}
