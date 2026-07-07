/**
 * Conversation history storage.
 *
 * Storage is intentionally content-agnostic: it persists `content` as an opaque
 * JSON string (the serialized form of ChatMessage.content from @ego-graph/llm)
 * plus role / tool metadata. The agent-harness layer is responsible for
 * serializing ChatMessage[] into StoredMessage[] and back.
 *
 * This avoids a storage -> llm dependency and keeps storage focused on
 * persistence primitives. The token estimate lives on the StoredMessage so
 * that `recallForPrompt` can select a bounded window without re-tokenizing.
 */

export type MessageRole = "system" | "user" | "assistant" | "tool";

export type StoredMessage = {
  id: string;
  sessionId: string;
  runId?: string;
  role: MessageRole;
  /** Serialized ChatMessage.content (string or block array). */
  contentJson: string;
  toolCallId?: string;
  toolName?: string;
  tokenCount?: number;
  createdAt: string;
};

export type ProjectRecord = {
  id: string;
  name: string;
  path: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
};

export type ConversationSessionRecord = {
  id: string;
  projectId: string;
  title: string;
  createdAt: string;
  updatedAt: string;
};

export type AppendMessageInput = Omit<StoredMessage, "id" | "createdAt"> & {
  id?: string;
  createdAt?: string;
};

export type ListMessagesOptions = {
  limit?: number;
  /** Return messages strictly before this message id (exclusive). */
  beforeId?: string;
};

export type ConversationStore = {
  upsertProject(input: Omit<ProjectRecord, "createdAt" | "updatedAt"> & Partial<ProjectRecord>): Promise<ProjectRecord>;
  listProjects(): Promise<ProjectRecord[]>;
  getProject(projectId: string): Promise<ProjectRecord | undefined>;
  createSession(input: {
    id?: string;
    projectId: string;
    title: string;
    createdAt?: string;
    updatedAt?: string;
  }): Promise<ConversationSessionRecord>;
  listSessions(projectId: string): Promise<ConversationSessionRecord[]>;
  getSession(sessionId: string): Promise<ConversationSessionRecord | undefined>;
  deleteSession(sessionId: string): Promise<void>;
  appendMessage(input: AppendMessageInput): Promise<StoredMessage>;
  listMessages(sessionId: string, options?: ListMessagesOptions): Promise<StoredMessage[]>;
  /**
   * Recall a token-bounded window for the next model call.
   *
   * Walks backwards from the most recent message, accumulating `tokenCount`
   * until the budget is exceeded. `system` messages are always kept and do
   * not count against the budget. Returns messages in chronological order
   * (oldest first), ready to be passed directly to a provider.
   */
  recallForPrompt(sessionId: string, tokenBudget: number): Promise<StoredMessage[]>;
  /** Delete all messages for a session (used by /clear). */
  clearSession(sessionId: string): Promise<void>;
};

export function createStoredMessageId(): string {
  return `msg-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

export function createConversationSessionId(): string {
  return `session-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

/**
 * Parse the opaque content JSON back into a structured value. The agent layer
 * is expected to further narrow this into ChatContentBlock | ChatContentBlock[],
 * but storage only needs to round-trip the JSON safely.
 */
export function parseMessageContent(contentJson: string): unknown {
  try {
    return JSON.parse(contentJson);
  } catch {
    // Fall back to the raw string if content was stored as a non-JSON string
    // (backwards compat for callers that pass plain text).
    return contentJson;
  }
}
