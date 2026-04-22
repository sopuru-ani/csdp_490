import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { apiFetch } from "@/lib/api";

import { MessageCircleMore, ArrowLeft, Send } from "lucide-react";

function Messages() {
  const navigate = useNavigate();
  const [user, setUser] = useState(null);
  const [conversations, setConversations] = useState([]);
  const [loading, setLoading] = useState(true);

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

      try {
        const res = await apiFetch("/conversations", { credentials: "include" });
        if (res.ok) {
          const data = await res.json();
          setConversations(data.conversations);
        }
      } catch (err) {
        console.error(err);
      }

      setLoading(false);
    }
    init();
  }, []);

  function getOtherUser(convo) {
    if (!user) return null;
    return convo.user_one?.id === user.id ? convo.user_two : convo.user_one;
  }

  return (
    <div className="w-full h-full flex flex-col overflow-hidden">
      <div className="w-full h-full border border-border flex flex-col bg-bg-raised shadow-md overflow-hidden">
        <div className="p-5 border-b border-border">
          <p className="font-bold text-xl">Messages</p>
          <p className="text-xs text-text-muted">Approved match conversations</p>
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
              const unread = convo.unread_count || 0;
              return (
                <div
                  key={convo.id}
                  onClick={() => navigate(`/messages/${convo.id}`, { state: { convo } })}
                  className={`p-4 cursor-pointer transition-all duration-200 hover:bg-primary-soft border-b border-border last:border-b-0 ${
                    unread > 0 ? "bg-secondary-soft" : ""
                  }`}
                >
                  <div className="flex items-center gap-3">
                    {/* Avatar + unread badge */}
                    <div className="relative shrink-0">
                      <div className="w-9 h-9 rounded-full bg-secondary flex items-center justify-center text-white text-sm font-semibold">
                        {other?.first_name?.[0]}
                        {other?.last_name?.[0]}
                      </div>
                      {unread > 0 && (
                        <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 bg-danger text-white text-[10px] font-bold rounded-full flex items-center justify-center leading-none">
                          {unread > 99 ? "99+" : unread}
                        </span>
                      )}
                    </div>

                    {/* Name + context */}
                    <div className="flex-1 min-w-0">
                      <p className={`text-sm truncate ${unread > 0 ? "font-bold" : "font-semibold"}`}>
                        {other?.first_name} {other?.last_name}
                      </p>
                      <p className="text-xs text-text-muted truncate">
                        {convo.match?.source_item?.item_name} ↔{" "}
                        {convo.match?.matched_item?.item_name}
                      </p>
                    </div>

                    {/* Unread dot on the right */}
                    {unread > 0 && (
                      <span className="shrink-0 w-2 h-2 rounded-full bg-danger" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}

export default Messages;
