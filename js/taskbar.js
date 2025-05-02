// Update Clock in Taskbar
function updateClock() {
    let now = new Date();
    document.getElementById("clock").innerText = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    document.getElementById("date").innerText = now.toLocaleDateString();
}
setInterval(updateClock, 1000);

// Open External Apps (or local simulation pages)
function openApp(app) {
    const links = {
        spotify: {
            url: "https://open.spotify.com/user/5frz16rbtuxfl0hdzn4aftbbt",
            title: "Spotify",
            icon: "../assets/icons/taskbar-icons/spotify.svg"
        },
        github: {
            url: "https://flickmatch.in",
            title: "GitHub",
            icon: "../assets/icons/taskbar-icons/github.svg"
        },
        linkedin: {
            url: "../content/linkedin-sim/linkedin-sim.html",  // Changed to load local HTML
            title: "LinkedIn",
            icon: "../assets/icons/taskbar-icons/Linkedin.svg"
        }
    };

    if (!links[app]) return;

    const { url, title, icon } = links[app];
    const webWin = createWebWindow(title, icon, url);
    webWin.style.display = 'block';
}
