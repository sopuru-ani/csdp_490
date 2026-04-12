import { useEffect, useState, useRef } from "react";
import { useNavigate } from "react-router-dom";
import Sidebar from "@/components/sidebar";
import { supabase } from "@/lib/supabase";
import { apiFetch } from "@/lib/api";
import ReportButton from "@/components/AbuseReportButton";
import { MessageCircleMore, ArrowLeft } from "lucide-react";

console.log("Connecting to WebSocket at", import.meta.env.VITE_API_WS_URL);

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

  // ws holds the live WebSocket connection for the open conversation.
  // We use a ref so handleSend can always read the current socket
  // without needing it as a useEffect dependency.
  const wsRef = useRef(null);

  // ── Auth check + load conversation list ───────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const authRes = await apiFetch("/auth/userchecker");
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
      const res = await apiFetch("/conversations", { credentials: "include" });
      if (res.ok) {
        const data = await res.json();
        setConversations(data.conversations);
      }
    } catch (err) {
      console.error(err);
    }
  }

  // ── WebSocket — opens when a conversation is selected, closes on exit ─────
  // This replaces the old setInterval polling block entirely.
  //
  // Flow:
  //   1. Load message history via REST (one-time, populates the chat window)
  //   2. Open a WebSocket for live updates going forward
  //   3. Incoming messages are appended to state — no re-fetching needed
  //   4. Cleanup closes the socket when the user navigates away or switches convos
  // KEY FIX: depend on selectedConvo?.id (a string) NOT selectedConvo (an object).
  // Objects fail reference equality on every render even if the data is identical,
  // which caused the effect to re-run, closing and reopening the socket constantly
  // and breaking the recipient's live connection.
  useEffect(() => {
    if (!selectedConvo?.id) return;

    // cancelled flag prevents the async openSocket from setting state or
    // assigning wsRef after the effect has already been cleaned up
    let cancelled = false;
    let ws;

    async function openSocket() {
      await fetchMessages(selectedConvo.id);

      // Bail out if the effect was cleaned up while fetchMessages was awaiting
      if (cancelled) return;

      const tokenRes = await apiFetch("/auth/token");
      const tokenData = await tokenRes.json();
      const token = tokenData?.access_token;
      if (!token) {
        console.error("No access token — cannot open WebSocket");
        return;
      }

      if (cancelled) return;

      const BACKEND_WS_URL =
        import.meta.env.VITE_API_WS_URL || "ws://csdp490server.qr-manager.net";

      // const BACKEND_WS_URL = import.meta.env.VITE_API_WS_URL;

      ws = new WebSocket(
        `${BACKEND_WS_URL}/ws/conversations/${selectedConvo.id}?token=${token}`,
      );

      // Only assign to ref after confirmed not cancelled
      wsRef.current = ws;

      ws.onopen = () => {
        console.log("[WS] Connected to conversation", selectedConvo.id);
      };

      ws.onmessage = (event) => {
        if (cancelled) return;
        const payload = JSON.parse(event.data);
        if (payload.type === "message") {
          setMessages((prev) => {
            const alreadyExists = prev.some((m) => m.id === payload.data.id);
            return alreadyExists ? prev : [...prev, payload.data];
          });
        }
        if (payload.error) {
          console.error("[WS] Server error:", payload.error);
        }
      };

      ws.onerror = (err) => {
        console.error("[WS] Error:", err);
      };

      ws.onclose = () => {
        console.log("[WS] Connection closed");
      };

      ws.onclose = () => {
        console.log("[WS] Connection closed");
      };
    }

    openSocket();

    return () => {
      cancelled = true;
      wsRef.current = null;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.close();
      }
    };
  }, [selectedConvo?.id]); // ← ID string, not the object

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  // ── Load message history (called once per conversation open) ──────────────
  async function fetchMessages(convoId) {
    try {
      const res = await apiFetch(`/conversations/${convoId}/messages`, {
        credentials: "include",
      });
      if (res.ok) {
        const data = await res.json();
        setMessages(data.messages);
      }
    } catch (err) {
      console.error(err);
    }
  }

  // ── Send a message over the WebSocket ────────────────────────────────────
  // Falls back to REST if the socket is not open (e.g. reconnecting).
  async function handleSend() {
    if (!input.trim() || sending) return;
    setSending(true);

    try {
      const ws = wsRef.current;

      if (ws && ws.readyState === WebSocket.OPEN) {
        // Primary path: send over the live socket
        ws.send(JSON.stringify({ content: input.trim() }));
      } else {
        // Fallback: REST POST if socket dropped
        console.warn("[WS] Socket not open — falling back to REST");
        await apiFetch(`/conversations/${selectedConvo.id}/messages`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: input.trim() }),
        });
        // Manually re-fetch since we won't get a socket echo
        await fetchMessages(selectedConvo.id);
      }

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
    <>
      {/* <Sidebar /> */}
      <div className="w-full h-full p-3 sm:p-4 md:p-6 flex flex-col overflow-hidden">
        {!selectedConvo ? (
          <div className="w-full border border-gray-200 flex flex-col bg-white rounded-2xl shadow-md overflow-hidden">
            <div className="p-5 border-b border-gray-100">
              <p className="font-bold text-xl">Messages</p>
              <p className="text-xs text-text-muted">
                Approved match conversations
              </p>
            </div>

            {loading ? (
              <div className="flex justify-center py-8">
                <div className="border-secondary border-3 border-t-0 border-b-0 rounded-full w-6 h-6 animate-spin" />
              </div>
            ) : conversations.length === 0 ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-2 px-4 text-center py-10">
                <MessageCircleMore className="w-6 h-6 fill-secondary-muted" />
                <p className="text-sm font-semibold">No conversations yet</p>
                <p className="text-xs text-text-muted">
                  Conversations open when a match is approved by an admin
                </p>
              </div>
            ) : (
              <div className="flex flex-col overflow-y-auto">
                {conversations.map((convo) => {
                  const other = getOtherUser(convo);
                  return (
                    <div
                      key={convo.id}
                      onClick={() => {
                        setMessages([]); // clear previous messages before loading new convo
                        setSelectedConvo(convo);
                      }}
                      className="mx-3 my-2 p-4 cursor-pointer rounded-xl border border-gray-100 transition-all duration-200 hover:bg-primary-soft hover:shadow-sm"
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
        ) : (
          <div className="w-full flex flex-col bg-white rounded-2xl border border-gray-200 shadow-md overflow-hidden">
            {/* Thread header */}
            <div className="p-5 border-b border-gray-200 bg-white flex items-center gap-3">
              <button
                onClick={() => setSelectedConvo(null)}
                className="p-2 rounded-lg hover:bg-primary-muted transition-all duration-200"
                aria-label="Back to conversations"
              >
                <ArrowLeft className="w-5 h-5" />
              </button>
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
            <div className="flex-1 overflow-y-auto p-5 flex flex-col gap-3">
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
                    className={`flex flex-col ${isMine ? "items-end" : "items-start"}`}
                  >
                    <div
                      className={`max-w-sm px-4 py-2.5 rounded-2xl text-sm shadow-sm ${
                        isMine
                          ? "bg-secondary text-white rounded-br-md"
                          : "bg-white border border-gray-200 rounded-bl-md"
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
                    {!isMine && (
                      <div className="mt-0.5 px-1">
                        <ReportButton
                          targetType="message"
                          targetId={msg.id}
                          reportedUserId={msg.sender_id}
                        />
                      </div>
                    )}
                  </div>
                );
              })}
              <div ref={bottomRef} />
            </div>

            {/* Input */}
            <div className="p-4 border-t border-gray-200 bg-white flex flex-col sm:flex-row gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Type a message..."
                className="flex-1 outline-none px-4 py-2.5 rounded-xl bg-primary-soft border border-gray-200 focus:border-secondary focus:ring-2 ring-secondary-muted text-sm transition-all duration-200"
              />
              <button
                onClick={handleSend}
                disabled={sending || !input.trim()}
                className="px-4 py-2 rounded-xl bg-secondary hover:bg-secondary-hover text-white text-sm cursor-pointer disabled:opacity-60 transition-all duration-200 shadow-sm w-full sm:w-auto"
              >
                {sending ? "..." : "Send"}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

export default Messages;
