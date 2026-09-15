(function (global) {
  function clearSession() {
    localStorage.removeItem("tde_token");
    localStorage.removeItem("tde_creator");
  }

  function destinationForProfile(payload) {
    const creator = payload && payload.creator ? payload.creator : {};
    const basicsCompleted = isA12ProfileComplete(creator);
    if (!basicsCompleted) return "profile.html?section=brand";
    return "profile.html?section=overview";
  }

  function isA12ProfileComplete(creator) {
    return Boolean(
      creator.brandName &&
        creator.province &&
        creator.city &&
        creator.district &&
        hasA12Logo(creator) &&
        hasA12Identity(creator),
    );
  }

  function hasA12Logo(creator) {
    return Boolean(creator.logoImageKey || creator.logoKey || creator.logoImageUrl || creator.logoUrl);
  }

  function hasA12Identity(creator) {
    return Array.isArray(creator.tags) && creator.tags.some((tag) => tag && tag.category === "我的身份");
  }

  function getScheduleSessionValue(key) {
    try {
      return sessionStorage.getItem(key);
    } catch {
      return null;
    }
  }

  function scheduleSessionKey(creator) {
    const id = creator && (creator.id || creator.publicId || creator.phone);
    return id ? `tde:a1-3:schedule-seen:${id}` : "";
  }

  async function destinationForToken(token) {
    const response = await fetch("/api/web/profile", {
      headers: { Authorization: "Bearer " + token },
      cache: "no-store",
    });
    if (response.status === 401) {
      clearSession();
      throw new Error("SESSION_INVALID");
    }
    if (!response.ok) throw new Error("PROFILE_LOOKUP_FAILED");
    return destinationForProfile(await response.json());
  }

  async function redirectAfterAuth(token) {
    const destination = await destinationForToken(token);
    location.replace(destination);
  }

  global.tdeCreatorEntry = {
    clearSession,
    destinationForProfile,
    destinationForToken,
    redirectAfterAuth,
    scheduleSessionKey,
    isA12ProfileComplete,
  };
})(window);
