(function () {
    const STORAGE_KEY = "theme";
    const root = document.documentElement;
    const btn = document.getElementById("themeToggle");
    if (!btn) return;

    function systemPrefersDark() {
        return window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches;
    }

    function applyTheme(theme) {
        if (theme === "light" || theme === "dark") {
            root.setAttribute("data-theme", theme);
        } else {
            root.removeAttribute("data-theme"); // fall back to system
        }
    }

    function currentTheme() {
        // If data-theme exists, that's the current override; otherwise system.
        const t = root.getAttribute("data-theme");
        return t ? t : (systemPrefersDark() ? "dark" : "light");
    }

    function setButtonHint() {
        const t = currentTheme();
        btn.title = (t === "dark") ? "Switch to light" : "Switch to dark";
        btn.setAttribute("aria-label", (t === "dark") ? "Switch to light theme" : "Switch to dark theme");
    }

    // Initialize from storage, else follow system (no override)
    const saved = localStorage.getItem(STORAGE_KEY);
    applyTheme(saved);
    setButtonHint();

    // If no manual override, react to system changes
    if (!saved && window.matchMedia) {
        window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", () => {
            applyTheme(null);
            setButtonHint();
        });
    }

    btn.addEventListener("click", () => {
        const t = currentTheme();
        const next = (t === "dark") ? "light" : "dark";
        applyTheme(next);
        localStorage.setItem(STORAGE_KEY, next);
        setButtonHint();
    });
})();