document.addEventListener("DOMContentLoaded", function () {
    const folders = document.querySelectorAll(".folder");
    const folderWindow = document.createElement("div");

    // Window template with improved structure
    folderWindow.innerHTML = `
    <div class="folder-window" id="folder-window">
        <div class="folder-header">
            <div class="folder-title">
                <img src="../assets/icons/folder-icons/folder.svg" alt="Folder">
                <span>Folder</span>
            </div>
            <div class="window-controls">
                <img src="../assets/icons/folder-icons/minimize.svg" class="minimize" alt="Minimize">
                <img src="../assets/icons/folder-icons/maximize.svg" class="maximize" alt="Maximize">
                <img src="../assets/icons/folder-icons/close.svg" class="close" alt="Close">
            </div>
        </div>
        <div class="folder-content">
            <div class="folder-sidebar">
                <ul class="folder-list">
                    ${['Work Experience', 'Projects', 'Research'].map(folder => `
                        <li class="folder-nav" data-folder="${folder.toLowerCase().replace(' ', '-')}">
                            <img src="../assets/icons/folder-icons/folder.svg" alt="${folder}">
                            <span>${folder}</span>
                        </li>
                    `).join('')}
                </ul>
            </div>
            <div class="folder-body">
                <div class="folder-items">
                    <!-- Dynamic content will be inserted here -->
                </div>
            </div>
        </div>
    </div>`;

    document.body.appendChild(folderWindow);
    const windowElement = document.getElementById('folder-window');

    // Folder click handlers
    folders.forEach(folder => {
        folder.addEventListener("click", () => {
            const title = folder.querySelector("span").textContent;
            windowElement.style.display = "block";
            windowElement.querySelector(".folder-title span").textContent = title;
            loadFolderContent(title.toLowerCase().replace(' ', '-'));
        });
    });

    // Window controls
    const controls = {
        close: () => windowElement.style.display = "none",
        minimize: () => windowElement.style.height = "33px",
        maximize: toggleMaximize
    };

    let isMaximized = false;
    let originalState = {};

    function toggleMaximize() {
        if (!isMaximized) {
            originalState = {
                left: windowElement.style.left,
                top: windowElement.style.top,
                width: windowElement.style.width,
                height: windowElement.style.height
            };
            windowElement.classList.add('maximized');
        } else {
            windowElement.classList.remove('maximized');
            Object.entries(originalState).forEach(([prop, value]) => {
                windowElement.style[prop] = value;
            });
        }
        isMaximized = !isMaximized;
    }

    document.querySelectorAll('.window-controls img').forEach(control => {
        control.addEventListener('click', () => controls[control.className]());
    });

    // Dragging functionality
    let isDragging = false, startX, startY, startLeft, startTop;
    const header = document.querySelector(".folder-header");

    header.addEventListener('mousedown', (e) => {
        if (windowElement.classList.contains('maximized')) return;
        isDragging = true;
        const rect = windowElement.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        windowElement.style.left = `${startLeft + (e.clientX - startX)}px`;
        windowElement.style.top = `${startTop + (e.clientY - startY)}px`;
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    // Folder content loading
    function loadFolderContent(folder) {
        const items = {
            'work-experience': ['Company A', 'Company B', 'Internship'],
            'projects': ['Project 1', 'Project 2', 'Open Source'],
            'research': ['Paper 2023', 'Study 2022'],
        };

        const contentArea = windowElement.querySelector('.folder-items');
        contentArea.innerHTML = items[folder].map(item => `
            <div class="folder-item">
                <img src="../assets/icons/folder-icons/folder.svg" alt="${item}">
                <span>${item}</span>
            </div>
        `).join('');
    }

    // Sidebar navigation
    document.querySelectorAll('.folder-nav').forEach(navItem => {
        navItem.addEventListener('click', () => {
            const folder = navItem.dataset.folder;
            windowElement.querySelector(".folder-title span").textContent = folder;
            loadFolderContent(folder);
        });
    });
});