document.addEventListener("DOMContentLoaded", function () {
    const folders = document.querySelectorAll(".folder");
    const folderWindow = document.getElementById("folder-window");

    folders.forEach(folder => {
        folder.addEventListener("click", function () {
            openFolder(folder.dataset.folder);
        });
    });
});

function openFolder(folderName) {
    const folderWindow = document.getElementById("folder-window");
    const folderTitle = document.querySelector(".folder-title");
    const folderContent = document.querySelector(".folder-content");

    folderTitle.innerText = folderName;

    // Load folder-specific content
    fetch(`../views/folders/${folderName}.html`)
        .then(response => response.text())
        .then(data => {
            folderContent.innerHTML = data;
            folderWindow.style.display = "block";
        });
}

function closeFolder() {
    document.getElementById("folder-window").style.display = "none";
}
