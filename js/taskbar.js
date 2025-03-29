// Update Clock in Taskbar
function updateClock() {
    let now = new Date();
    document.getElementById("clock").innerText = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    document.getElementById("date").innerText = now.toLocaleDateString();
}
setInterval(updateClock, 1000);
// updateClock();

// Open External Apps
function openApp(app) {
    const links = {
        spotify: {
            url: "https://open.spotify.com/user/5frz16rbtuxfl0hdzn4aftbbt",
            title: "Spotify",
            icon: "../assets/icons/taskbar-icons/spotify.svg"
        },
        github: {
            url: "https://github.com/sm11t",
            title: "GitHub",
            icon: "../assets/icons/taskbar-icons/github.svg"
        },
        linkedin: {
            url: "https://www.linkedin.com/in/asmitrajeet/",
            title: "LinkedIn",
            icon: "../assets/icons/taskbar-icons/Linkedin.svg"
        }
    };

    // If the app doesn't exist in the links object, do nothing
    if (!links[app]) return;

    // Grab the relevant data
    const { url, title, icon } = links[app];

    // Create the new "web window"
    const webWin = createWebWindow(title, icon, url);

    // Show it (if your .web-window is display:none by default)
    webWin.style.display = 'block';
}
