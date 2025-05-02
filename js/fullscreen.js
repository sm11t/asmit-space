// js/fullscreen.js

// On load, if user previously chose fullscreen, re-request it:
window.addEventListener("DOMContentLoaded", () => {
    if (localStorage.getItem("wantsFullscreen") === "yes") {
        document.documentElement
            .requestFullscreen()
            .catch(() => {/* likely blocked without a user gesture */});
    }
});

// Expose helpers to toggle fullscreen & update the flag:
function enterFullscreen() {
    document.documentElement
        .requestFullscreen()
        .then(() => localStorage.setItem("wantsFullscreen", "yes"))
        .catch(console.warn);
}

function exitFullscreen() {
    document.exitFullscreen()
        .then(() => localStorage.setItem("wantsFullscreen", "no"))
        .catch(console.warn);
}

// Optional: update the flag if they manually exit via ESC:
document.addEventListener("fullscreenchange", () => {
    if (!document.fullscreenElement) {
        localStorage.setItem("wantsFullscreen", "no");
    }
});
