import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/sidebar";
import { supabase } from "@/lib/supabase";

function Messages() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [selectedConvo, setSelectedConvo] = useState(null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [loading, setLoading] = useState(true);
  const bottomRef = useRef(null);

  // Auth check + fetch conversations
  useEffect(() => {
    async function init() {
      try {
        const authRes = await fetch("http://localhost:8000/auth/userchecker", {
          credentials: "include",
        });
        if (!authRes.ok) {
          navigate("/login");
          return;
        }
        const userData = await authRes.json();
        setUser(userData);
      } catch {
        navigate("/login");
        return;
      }

      await fetchConversations();
      setLoading(false);
    }
    init();
  }, []);

  async function fetchConversations() {
    try {
      const res = await fetch("http://localhost:8000/conversations", {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations);
      }
    } catch (err) {
      console.error(err);
    }
  }

  // Load messages when conversation selected
  useEffect(() => {
    if (!selectedConvo) return;
    fetchMessages(selectedConvo.id);

    // Subscribe to new messages via Supabase Realtime
    const channel = supabase
      .channel(`messages:${selectedConvo.id}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `conversation_id=eq.${selectedConvo.id}`,
        },
        (payload) => {
          setMessages((prev) => {
            // Avoid duplicates
            if (prev.find((m) => m.id === payload.new.id)) return prev;
            return [...prev, payload.new];
          });
        },
      )
      .subscribe();

    return () => supabase.removeChannel(channel);
  }, [selectedConvo]);

  // Scroll to bottom when messages update
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function fetchMessages(convoId) {
    try {
      const res = await fetch(
        `http://localhost:8000/conversations/${convoId}/messages`,
        { credentials: "include" },
      );
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch (err) {
      console.error(err);
    }
  }

  async function handleSend() {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      await fetch(
        `http://localhost:8000/conversations/${selectedConvo.id}/messages`,
        {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: input.trim() }),
        },
      );
      setInput("");
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  function getOtherUser(convo) {
    if (!user) return null;
    return convo.user_one?.id === user.id ? convo.user_two : convo.user_one;
  }

  return (
    <div className="w-dvw min-h-dvh flex flex-row bg-primary-soft">
      <Sidebar />
      <div
        className="flex-1 flex flex-row overflow-hidden"
        style={{ height: "100dvh" }}
      >
        {/* Conversation list */}
        <div className="w-72 border-r border-gray-200 flex flex-col bg-white shrink-0">
          <div className="p-4 border-b border-gray-100">
            <p className="font-bold text-lg">Messages</p>
            <p className="text-xs text-text-muted">
              Approved match conversations
            </p>
          </div>

          {loading ? (
            <div className="flex justify-center py-8">
              <div className="border-secondary border-3 border-t-0 border-b-0 rounded-full w-6 h-6 animate-spin" />
            </div>
          ) : conversations.length === 0 ? (
            <div className="flex flex-col items-center justify-center flex-1 gap-2 px-4 text-center">
              <p className="text-2xl">💬</p>
              <p className="text-sm font-semibold">No conversations yet</p>
              <p className="text-xs text-text-muted">
                Conversations open when a match is approved by an admin
              </p>
            </div>
          ) : (
            <div className="flex flex-col overflow-y-auto">
              {conversations.map((convo) => {
                const other = getOtherUser(convo);
                const isSelected = selectedConvo?.id === convo.id;
                return (
                  <div
                    key={convo.id}
                    onClick={() => setSelectedConvo(convo)}
                    className={`p-4 cursor-pointer border-b border-gray-50 transition-colors ${
                      isSelected
                        ? "bg-secondary-soft border-l-2 border-l-secondary"
                        : "hover:bg-primary-soft"
                    }`}
                  >
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-white text-sm font-semibold shrink-0">
                        {other?.first_name?.[0]}
                        {other?.last_name?.[0]}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-sm truncate">
                          {other?.first_name} {other?.last_name}
                        </p>
                        <p className="text-xs text-text-muted truncate">
                          {convo.match?.source_item?.item_name} ↔{" "}
                          {convo.match?.matched_item?.item_name}
                        </p>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Message thread */}
        {!selectedConvo ? (
          <div className="flex-1 flex flex-col items-center justify-center gap-2 text-center">
            <p className="text-3xl">💬</p>
            <p className="font-semibold">Select a conversation</p>
            <p className="text-sm text-text-muted">
              Choose a conversation from the left to start messaging
            </p>
          </div>
        ) : (
          <div className="flex-1 flex flex-col">
            {/* Thread header */}
            <div className="p-4 border-b border-gray-200 bg-white flex items-center gap-3">
              {(() => {
                const other = getOtherUser(selectedConvo);
                return (
                  <>
                    <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-white text-sm font-semibold">
                      {other?.first_name?.[0]}
                      {other?.last_name?.[0]}
                    </div>
                    <div>
                      <p className="font-semibold text-sm">
                        {other?.first_name} {other?.last_name}
                      </p>
                      <p className="text-xs text-text-muted">
                        Re: {selectedConvo.match?.source_item?.item_name} ↔{" "}
                        {selectedConvo.match?.matched_item?.item_name}
                      </p>
                    </div>
                  </>
                );
              })()}
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4 flex flex-col gap-2">
              {messages.length === 0 && (
                <p className="text-xs text-text-muted text-center py-4">
                  No messages yet — say hello!
                </p>
              )}
              {messages.map((msg) => {
                const isMine = msg.sender_id === user?.id;
                return (
                  <div
                    key={msg.id}
                    className={`flex ${isMine ? "justify-end" : "justify-start"}`}
                  >
                    <div
                      className={`max-w-xs px-3 py-2 rounded-xl text-sm ${
                        isMine
                          ? "bg-secondary text-white rounded-br-sm"
                          : "bg-white border border-gray-200 rounded-bl-sm"
                      }`}
                    >
                      <p>{msg.content}</p>
                      <p
                        className={`text-xs mt-1 ${isMine ? "text-white/70" : "text-text-muted"}`}
                      >
                        {new Date(msg.created_at).toLocaleTimeString([], {
                          hour: "2-digit",
                          minute: "2-digit",
                        })}
                      </p>
                    </div>
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-3 border-t border-gray-200 bg-white flex gap-2">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a message..."
                className="flex-1 outline-none px-3 py-2 rounded-lg bg-primary-soft border border-gray-200 focus:border-secondary focus:ring-1 text-sm"
              />
              <button
                onClick={handleSend}
                disabled={sending || !input.trim()}
                className="px-4 py-2 rounded-lg bg-secondary hover:bg-secondary-hover text-white text-sm cursor-pointer disabled:opacity-60 transition-colors"
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

export default Messages;
