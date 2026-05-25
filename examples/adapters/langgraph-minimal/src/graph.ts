/** Minimal LangGraph stub for adapter detection (no real LangGraph runtime required in CI). */
export const graph = {
  async invoke(state: { messages: { role: string; content: string }[] }) {
    const last = state.messages[state.messages.length - 1];
    return {
      messages: [
        ...state.messages,
        { role: "assistant", content: `echo: ${last?.content ?? ""}` },
      ],
    };
  },
};
