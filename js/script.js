document.addEventListener("DOMContentLoaded", () => {
    const landingScreen = document.getElementById("landing-screen");
    const enterButton = document.getElementById("enter-site");
    const playPauseButton = document.getElementById("play-pause-btn");
    const mainContent = document.getElementById("main-content");

    let backgroundMusic; // Declare but don’t initialize yet
    let isPlaying = false; // Default: Music is stopped

    // Function to create and start audio AFTER user enters
    function initializeAudio() {
        if (!backgroundMusic) {
            backgroundMusic = new Howl({
                src: ["audio/alabamaloop.mp3"],
                autoplay: false, // Will be triggered after entering
                loop: true,
                volume: 0.5
            });
        }
    }

    // Enter the Main Page and Prepare Audio
    enterButton.addEventListener("click", () => {
        initializeAudio(); // Ensure Howler is created before playing

        landingScreen.classList.add("hidden");
        setTimeout(() => {
            landingScreen.style.display = "none";
            mainContent.classList.remove("hidden");

            // Play audio automatically after entering
            backgroundMusic.play();
            isPlaying = true;
            playPauseButton.textContent = "⏸"; // Set to pause icon
        }, 1000);
    });

    // Play/Pause Toggle Button
    playPauseButton.addEventListener("click", () => {
        if (backgroundMusic) {
            if (isPlaying) {
                backgroundMusic.pause();
                playPauseButton.textContent = "▶️"; // Play icon
            } else {
                backgroundMusic.play();
                playPauseButton.textContent = "⏸"; // Pause icon
            }
            isPlaying = !isPlaying;
        }
    });
});
