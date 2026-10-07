(() => {
  const config = window.APP_CONFIG;
  if (!config?.supabaseUrl || !config?.supabaseAnonKey) {
    console.error("Article analytics are not configured.");
    return;
  }

  let visitorId = sessionStorage.getItem("threadTraditionVisitor");
  if (!visitorId) {
    visitorId = crypto.randomUUID();
    sessionStorage.setItem("threadTraditionVisitor", visitorId);
  }

  const trackedPosts = new Set();
  const record = async (postId) => {
    if (document.visibilityState !== "visible") return;
    const response = await fetch(`${config.supabaseUrl}/rest/v1/rpc/record_post_view`, {
      method: "POST",
      headers: {
        apikey: config.supabaseAnonKey,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({ p_post_id: postId, p_visitor_id: visitorId })
    });
    if (!response.ok) throw new Error(`Article view tracking failed (${response.status}).`);
  };

  window.trackPostView = (postId) => {
    if (trackedPosts.has(postId)) return;
    trackedPosts.add(postId);
    const heartbeat = () => record(postId).catch((error) => console.error(error));
    heartbeat();
    const interval = window.setInterval(heartbeat, 30000);
    const onVisibility = () => {
      if (document.visibilityState === "visible") heartbeat();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibility);
    }, { once: true });
  };

  const postId = document.body.dataset.postId;
  if (postId) window.trackPostView(postId);
})();
