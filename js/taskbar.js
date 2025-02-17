// Update Clock in Taskbar
function updateClock() {
    let now = new Date();
    document.getElementById("clock").innerText = now.toLocaleTimeString([], {hour: '2-digit', minute: '2-digit'});
    document.getElementById("date").innerText = now.toLocaleDateString();
}
setInterval(updateClock, 1000);
updateClock();

// Open External Apps
function openApp(app) {
    const links = {
        spotify: "https://open.spotify.com/user/5frz16rbtuxfl0hdzn4aftbbt",
        github: "https://github.com/sm11t",
        linkedin: "https://www.linkedin.com/in/asmitrajeet/"
    };

    if (links[app]) {
        const newTab = window.open(links[app], "_blank");
        if (!newTab || newTab.closed || typeof newTab.closed === "undefined") {
            alert("Popup blocked! Please allow popups for this site.");
        }
    }
}


// Fetch Weather Data
async function fetchWeather() {
    try {
        const response = await fetch("https://ipapi.co/json/");
        const data = await response.json();
        const city = data.city;
        const country = data.country_code;

        const weatherResponse = await fetch(`https://wttr.in/${city}?format=%t+%C`);
        const weatherText = await weatherResponse.text();

        document.getElementById("weather-info").innerText = `${city}, ${country} - ${weatherText}`;
    } catch (error) {
        document.getElementById("weather-info").innerText = "Weather unavailable";
    }
}
fetchWeather();
