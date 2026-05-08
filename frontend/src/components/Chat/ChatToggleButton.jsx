/**
 * ChatToggleButton — fixed FAB in the bottom-right corner.
 *
 * Hidden when the chat panel is already open (panel has its own close [X]).
 */
import React from "react";
import { Brain } from "lucide-react";
import { useChat } from "../../contexts/ChatContext";
import styles from "./ChatToggleButton.module.css";

export function ChatToggleButton() {
  const { isOpen, toggleChat } = useChat();

  if (isOpen) return null;

  return (
    <button
      className={styles.fab}
      onClick={toggleChat}
      aria-label="Open Vitruvius chat"
    >
      <Brain size={20} />
    </button>
  );
}
