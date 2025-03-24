const songs = ["neonlove.mp3", "midnightdrive.mp3", "spacejam.mp3"];
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
    playPauseBtn.src = "../assets/icons/pause.svg";
}

function pauseSong() {
    audio.pause();
    isPlaying = false;
    playPauseBtn.src = "../assets/icons/play.svg";
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
