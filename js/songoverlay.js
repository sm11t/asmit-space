const songs = ["favouritecutscene.mp3", "infinity.mp3", "lvloop.mp3", "sancloop.mp3"];
let current = 0;
let isPlaying = false;

const audio = new Audio(`../audio/${songs[current]}`);
const songText = document.querySelector(".song-text");
const playPauseBtn = document.getElementById("play-pause-btn");

function updateSongText() {
    const cleanName = songs[current].replace(".mp3", "").replace(/_/g, " ");
    songText.textContent = `${cleanName}`;
}

function playSong() {
    audio.play();
    isPlaying = true;
    // Use a pause icon while music is playing
    playPauseBtn.src = "../assets/icons/songbuttons/pause-svgrepo-com.svg";
}

function pauseSong() {
    audio.pause();
    isPlaying = false;
    // Use a play icon while music is paused
    playPauseBtn.src = "../assets/icons/songbuttons/play-svgrepo-com.svg";
}

document.getElementById("prev-btn").onclick = () => {
    current = (current - 1 + songs.length) % songs.length;
    audio.src = `../audio/${songs[current]}`;
    updateSongText();
    playSong();
};

document.getElementById("next-btn").onclick = () => {
    current = (current + 1) % songs.length;
    audio.src = `../audio/${songs[current]}`;
    updateSongText();
    playSong();
};

playPauseBtn.onclick = () => {
    isPlaying ? pauseSong() : playSong();
};

updateSongText();
