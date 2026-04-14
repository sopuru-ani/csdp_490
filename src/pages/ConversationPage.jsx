import { useEffect, useState, useRef } from "react";
import { useNavigate, useParams, useLocation } from "react-router-dom";
import { apiFetch } from "@/lib/api";
import ReportButton from "@/components/AbuseReportButton";
import { ArrowLeft, Send, ArrowUp } from "lucide-react";

function ConversationPage() {
  const { conversationId } = useParams();
  const { state } = useLocation();
  const navigate = useNavigate();

  const [user, setUser] = useState(null);
  const [convo, setConvo] = useState(state?.convo ?? null);
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const bottomRef = useRef(null);
  const wsRef = useRef(null);

  // ── Auth check ────────────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      try {
        const authRes = await apiFetch("/auth/userchecker");
        if (!authRes.ok) {
          navigate("/login");
          return;
        }
        setUser(await authRes.json());
      } catch {
        navigate("/login");
      }
    }
    init();
  }, []);

  // ── If we arrived via direct URL (no router state), load the conversation ─
  useEffect(() => {
    if (convo) return;
    async function loadConvo() {
      try {
        const res = await apiFetch("/conversations", {
          credentials: "include",
        });
        if (res.ok) {
          const data = await res.json();
          const found = data.conversations.find((c) => c.id === conversationId);
          if (found) setConvo(found);
          else navigate("/messages");
        }
      } catch (err) {
        console.error(err);
        navigate("/messages");
      }
    }
    loadConvo();
  }, [conversationId]);

  // ── WebSocket — open on mount, close on unmount ───────────────────────────
  // KEY FIX: depend on conversationId (string) not the convo object.
  useEffect(() => {
    if (!conversationId) return;

    let cancelled = false;
    let ws;

    async function openSocket() {
      await fetchMessages();
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
        import.meta.env.VITE_API_WS_URL || "wss://csdp490server.qr-manager.net";

      ws = new WebSocket(
        `${BACKEND_WS_URL}/ws/conversations/${conversationId}?token=${token}`,
      );
      wsRef.current = ws;

      ws.onopen = () =>
        console.log("[WS] Connected to conversation", conversationId);

      ws.onmessage = (event) => {
        if (cancelled) return;
        const payload = JSON.parse(event.data);
        if (payload.type === "message") {
          setMessages((prev) => {
            const alreadyExists = prev.some((m) => m.id === payload.data.id);
            return alreadyExists ? prev : [...prev, payload.data];
          });
        }
        if (payload.error) console.error("[WS] Server error:", payload.error);
      };

      ws.onerror = (err) => console.error("[WS] Error:", err);
      ws.onclose = () => console.log("[WS] Connection closed");
    }

    openSocket();

    return () => {
      cancelled = true;
      wsRef.current = null;
      if (ws && ws.readyState === WebSocket.OPEN) ws.close();
    };
  }, [conversationId]);

  // ── Scroll to bottom on new messages ─────────────────────────────────────
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  async function fetchMessages() {
    try {
      const res = await apiFetch(`/conversations/${conversationId}/messages`, {
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

  async function handleSend() {
    if (!input.trim() || sending) return;
    setSending(true);
    try {
      const ws = wsRef.current;
      if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ content: input.trim() }));
      } else {
        console.warn("[WS] Socket not open — falling back to REST");
        await apiFetch(`/conversations/${conversationId}/messages`, {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ content: input.trim() }),
        });
        await fetchMessages();
      }
      setInput("");
    } catch (err) {
      console.error(err);
    } finally {
      setSending(false);
    }
  }

  function getOtherUser() {
    if (!user || !convo) return null;
    return convo.user_one?.id === user.id ? convo.user_two : convo.user_one;
  }

  const other = getOtherUser();

  return (
    // <div className="w-full h-dvh p-3 sm:p-4 md:p-6 flex flex-col overflow-hidden">
    <div className="w-full h-dvh flex flex-col overflow-hidden">
      <div className="w-full h-full flex flex-col bg-white border border-gray-200 shadow-md overflow-hidden">
        {/* Header */}
        <div className="p-5 border-b border-gray-200 bg-white flex items-center gap-3">
          <button
            onClick={() => navigate("/messages")}
            className="p-2 rounded-lg hover:bg-primary-muted transition-all duration-200"
            aria-label="Back to conversations"
          >
            <ArrowLeft className="w-5 h-5" />
          </button>
          {other && (
            <>
              <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-white text-sm font-semibold">
                {other.first_name?.[0]}
                {other.last_name?.[0]}
              </div>
              <div>
                <p className="font-semibold text-sm">
                  {other.first_name} {other.last_name}
                </p>
                {convo && (
                  <p className="text-xs text-text-muted">
                    Re: {convo.match?.source_item?.item_name} ↔{" "}
                    {convo.match?.matched_item?.item_name}
                  </p>
                )}
              </div>
            </>
          )}
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
        {/* <div className="p-4 border-t border-gray-200 bg-white flex flex-row items-center sm:flex-row gap-3">
          <input
            type="text"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && handleSend()}
            placeholder="Type a message..."
            className="flex-1 outline-none px-4 py-2.5 rounded-full bg-primary-soft border border-gray-200 focus:border-secondary-muted focus:ring-1 ring-secondary-muted text-sm transition-all duration-200"
          />
          <button
            onClick={handleSend}
            disabled={sending || !input.trim()}
            className="w-fit h-fit p-2 rounded-full bg-secondary hover:bg-secondary-hover text-white text-sm cursor-pointer disabled:opacity-60 transition-all duration-200 shadow-sm"
          >
            <ArrowUp className="w-6 h-6" />
          </button>
        </div> */}
        <div className="p-4">
          <div className="rounded-full border-t p-2 border-gray-200 flex flex-row items-center sm:flex-row gap-3 bg-primary-soft">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && handleSend()}
              placeholder="Type a message..."
              className="flex-1 outline-none px-4 py-2.5 "
            />
            <button
              onClick={handleSend}
              disabled={sending || !input.trim()}
              className="w-fit h-fit p-2 rounded-full bg-secondary hover:bg-secondary-hover text-white text-sm cursor-pointer disabled:opacity-60 transition-all duration-200 shadow-sm"
            >
              {/* {sending ? "..." : "Send"} */}
              {/* <Send className="w-6 h-6" /> */}
              <ArrowUp className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default ConversationPage;
