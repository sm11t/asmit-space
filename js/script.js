document.addEventListener("DOMContentLoaded", () => {
    const playPauseButton = document.getElementById("play-pause-btn");
    let backgroundMusic;
    let isPlaying = false;

    // Function to create and start audio AFTER user enters
    function initializeAudio() {
        if (!backgroundMusic) {
            backgroundMusic = new Howl({
                src: ["../audio/alabamaloop.mp3"],
                autoplay: false, // Will be triggered after entering
                loop: true,
                volume: 0.5
            });
        }
    }

    // Play/Pause Toggle Button
    playPauseButton.addEventListener("click", () => {
        initializeAudio(); // Ensure Howler is created before playing

        if (isPlaying) {
            backgroundMusic.pause();
            playPauseButton.textContent = "▶️"; // Play icon
        } else {
            backgroundMusic.play();
            playPauseButton.textContent = "⏸"; // Pause icon
        }
        isPlaying = !isPlaying;
    });

    // Make dots clickable
    document.querySelectorAll('.external-url-dot').forEach(dot => {
        dot.addEventListener('click', function () {
            window.open(this.getAttribute('data-url'), "_blank"); // Opens in new tab
        });
    });

    document.querySelectorAll('.change-view-dot').forEach(dot => {
        dot.addEventListener('click', function () {
            window.location.href = this.getAttribute('data-url'); // Opens in same tab
        });
    });

});
