/**
 * Tests for useChatBox hook
 */

import { describe, it, expect, mock } from "bun:test";
import { createRoot } from "solid-js";
import { useChatBox } from "./use-chat-box.ts";

describe("useChatBox", () => {
  describe("initial state", () => {
    it("should start with empty value", () => {
      createRoot((dispose) => {
        const chat = useChatBox();

        expect(chat.value()).toBe("");

        dispose();
      });
    });

    it("should start unfocused by default", () => {
      createRoot((dispose) => {
        const chat = useChatBox();

        expect(chat.isFocused()).toBe(false);

        dispose();
      });
    });

    it("should start focused when initialFocused is true", () => {
      createRoot((dispose) => {
        const chat = useChatBox({ initialFocused: true });

        expect(chat.isFocused()).toBe(true);

        dispose();
      });
    });

    it("should start with empty messages", () => {
      createRoot((dispose) => {
        const chat = useChatBox();

        expect(chat.messages()).toEqual([]);

        dispose();
      });
    });
  });

  describe("setValue", () => {
    it("should update value", () => {
      createRoot((dispose) => {
        const chat = useChatBox();

        chat.setValue("hello");

        expect(chat.value()).toBe("hello");

        dispose();
      });
    });

    it("should allow updating value multiple times", () => {
      createRoot((dispose) => {
        const chat = useChatBox();

        chat.setValue("hello");
        chat.setValue("hello world");

        expect(chat.value()).toBe("hello world");

        dispose();
      });
    });
  });

  describe("setFocused", () => {
    it("should update focus state", () => {
      createRoot((dispose) => {
        const chat = useChatBox();

        chat.setFocused(true);
        expect(chat.isFocused()).toBe(true);

        chat.setFocused(false);
        expect(chat.isFocused()).toBe(false);

        dispose();
      });
    });
  });

  describe("toggleFocus", () => {
    it("should toggle focus state", () => {
      createRoot((dispose) => {
        const chat = useChatBox();

        expect(chat.isFocused()).toBe(false);

        chat.toggleFocus();
        expect(chat.isFocused()).toBe(true);

        chat.toggleFocus();
        expect(chat.isFocused()).toBe(false);

        dispose();
      });
    });
  });

  describe("clear", () => {
    it("should clear the value", () => {
      createRoot((dispose) => {
        const chat = useChatBox();

        chat.setValue("some text");
        expect(chat.value()).toBe("some text");

        chat.clear();
        expect(chat.value()).toBe("");

        dispose();
      });
    });
  });

  describe("submit", () => {
    it("should call onSubmit with trimmed value", () => {
      createRoot((dispose) => {
        const onSubmit = mock(() => {});
        const chat = useChatBox({ onSubmit });

        chat.setValue("  hello world  ");
        chat.submit();

        expect(onSubmit).toHaveBeenCalledWith("hello world");

        dispose();
      });
    });

    it("should not call onSubmit when value is empty", () => {
      createRoot((dispose) => {
        const onSubmit = mock(() => {});
        const chat = useChatBox({ onSubmit });

        chat.submit();

        expect(onSubmit).not.toHaveBeenCalled();

        dispose();
      });
    });

    it("should not call onSubmit when value is only whitespace", () => {
      createRoot((dispose) => {
        const onSubmit = mock(() => {});
        const chat = useChatBox({ onSubmit });

        chat.setValue("   ");
        chat.submit();

        expect(onSubmit).not.toHaveBeenCalled();

        dispose();
      });
    });

    it("should clear value after submit", () => {
      createRoot((dispose) => {
        const chat = useChatBox({ onSubmit: () => {} });

        chat.setValue("hello");
        chat.submit();

        expect(chat.value()).toBe("");

        dispose();
      });
    });

    it("should add message to history on submit", () => {
      createRoot((dispose) => {
        const chat = useChatBox({ onSubmit: () => {} });

        chat.setValue("hello");
        chat.submit();

        const messages = chat.messages();
        expect(messages.length).toBe(1);
        expect(messages[0].content).toBe("hello");
        expect(messages[0].source).toBe("user");
        expect(messages[0].timestamp).toBeInstanceOf(Date);

        dispose();
      });
    });
  });

  describe("addMessage", () => {
    it("should add user message", () => {
      createRoot((dispose) => {
        const chat = useChatBox();

        chat.addMessage("user message", "user");

        const messages = chat.messages();
        expect(messages.length).toBe(1);
        expect(messages[0].content).toBe("user message");
        expect(messages[0].source).toBe("user");

        dispose();
      });
    });

    it("should add agent message", () => {
      createRoot((dispose) => {
        const chat = useChatBox();

        chat.addMessage("agent response", "agent");

        const messages = chat.messages();
        expect(messages.length).toBe(1);
        expect(messages[0].content).toBe("agent response");
        expect(messages[0].source).toBe("agent");

        dispose();
      });
    });

    it("should add system message", () => {
      createRoot((dispose) => {
        const chat = useChatBox();

        chat.addMessage("system notification", "system");

        const messages = chat.messages();
        expect(messages.length).toBe(1);
        expect(messages[0].content).toBe("system notification");
        expect(messages[0].source).toBe("system");

        dispose();
      });
    });

    it("should preserve message order", () => {
      createRoot((dispose) => {
        const chat = useChatBox();

        chat.addMessage("first", "user");
        chat.addMessage("second", "agent");
        chat.addMessage("third", "system");

        const messages = chat.messages();
        expect(messages.length).toBe(3);
        expect(messages[0].content).toBe("first");
        expect(messages[1].content).toBe("second");
        expect(messages[2].content).toBe("third");

        dispose();
      });
    });
  });
});
