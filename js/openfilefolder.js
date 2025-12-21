document.addEventListener("DOMContentLoaded", function () {
    // 1) Unified data structure for everything on the desktop
    const desktopItems = [
        {
            name: 'Work Experience',
            type: 'folder',
            id: 'work-experience',
            content: [
                {
                    name: 'WatchDNA',
                    type: 'folder',
                    id: 'watchdna',
                    content: [
                        {
                            name: 'Engineering Report',
                            type: 'file',
                            id: 'watchdna-report',
                            filePath: '../content/watchdna/index.html',
                            meta: {
                                role: 'Full-Stack Developer',
                                dates: '2023',
                                tech: ['React', 'Node.js', 'MongoDB', 'Mapbox', 'Python', 'JWT']
                            }
                        }
                    ]
                },
                {
                    name: 'My Yoga Teacher',
                    type: 'folder',
                    id: 'my-yoga-teacher',
                    content: [
                        {
                            name: 'Health Metrics',
                            type: 'folder',
                            id: 'myt-health-metrics',
                            content: [
                                {
                                    name: 'Engineering Report',
                                    type: 'file',
                                    id: 'myt-health-metrics-report',
                                    filePath: '../content/myt/myt-health-metrics/index.html',
                                    meta: {
                                        role: 'AI Intern',
                                        dates: 'May 2025 – Nov 2025',
                                        tech: ['React Native', 'HealthKit', 'ClickHouse', 'FastAPI']
                                    }
                                }
                            ]
                        },
                        {
                            name: 'NLP Voice Reporting',
                            type: 'folder',
                            id: 'myt-nlp',
                            content: [
                                {
                                    name: 'Engineering Report',
                                    type: 'file',
                                    id: 'myt-nlp-report',
                                    filePath: '../content/myt/nlp/index.html',
                                    meta: {
                                        role: 'AI Intern',
                                        dates: 'May 2025 – Nov 2025',
                                        tech: ['React 19', 'Go', 'Python FastAPI', 'PostgreSQL', 'Whisper']
                                    }
                                }
                            ]
                        }
                    ]
                },
                {
                    name: 'Nexus AI Solutions',
                    type: 'folder',
                    id: 'nexus-ai',
                    content: []
                },
                {
                    name: 'AI Society ASU',
                    type: 'folder',
                    id: 'ai-society-asu',
                    content: []
                },
                {
                    name: 'Flickmatch',
                    type: 'folder',
                    id: 'flickmatch',
                    content: [
                        {
                            name: 'Live Site',
                            type: 'file',
                            id: 'flickmatch-site',
                            url: 'https://flickmatch.in'
                        }
                    ]
                }
            ]
        },
        {
            name: 'Projects',
            type: 'folder',
            id: 'projects',
            content: [
                {
                    name: 'SentinalAI',
                    type: 'folder',
                    id: 'sentinalai',
                    content: []
                },
                {
                    name: 'Lynti Mobility',
                    type: 'folder',
                    id: 'lynti',
                    content: [
                        {
                            name: 'Engineering Report',
                            type: 'file',
                            id: 'lynti-engineering-report',
                            filePath: '../content/lynti/index.html',
                            meta: {
                                year: '2024',
                                tech: ['React Native', 'Expo', 'TypeScript', 'Google Maps', 'Clerk Auth', 'Zustand', 'PostgreSQL']
                            }
                        }
                    ]
                },
                {
                    name: 'NeuroPilot',
                    type: 'folder',
                    id: 'neuropilot',
                    content: []
                },
                {
                    name: 'JobifyAI',
                    type: 'folder',
                    id: 'jobifyai',
                    content: []
                }
            ]
        },
        {
            name: 'Research',
            type: 'folder',
            id: 'research',
            content: [
                { name: 'Paper 2023', type: 'folder', id: 'paper-2023', content: [] },
                { name: 'Study 2022', type: 'folder', id: 'study-2022', content: [] },
            ]
        },
        {
            name: 'Resume',
            type: 'file',
            id: 'resume',
            // Adjust filePath as needed.
            filePath: '../content/resume/resume.html'
        }
    ];

    // 2) Create the main folder window (hidden by default) with custom resize handles
    const folderWindow = document.createElement("div");
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
            ${desktopItems.map(item => {
        const iconSrc = item.type === 'folder'
            ? '../assets/icons/folder-icons/folder.svg'
            : '../assets/icons/pdf.svg';
        return `
                <li class="folder-nav" data-id="${item.id}" data-type="${item.type}">
                  <img src="${iconSrc}" alt="${item.name}">
                  <span>${item.name}</span>
                </li>
              `;
    }).join('')}
          </ul>
        </div>
        <div class="folder-body">
          <div class="folder-items">
            <!-- Dynamic content will be inserted here -->
          </div>
        </div>
      </div>
      <!-- Custom Resize Handles -->
      <div class="resize-handle top"></div>
      <div class="resize-handle bottom"></div>
      <div class="resize-handle left"></div>
      <div class="resize-handle right"></div>
      <div class="resize-handle top-left"></div>
      <div class="resize-handle top-right"></div>
      <div class="resize-handle bottom-left"></div>
      <div class="resize-handle bottom-right"></div>
    </div>
  `;

    document.body.appendChild(folderWindow);
    const windowElement = document.getElementById('folder-window');

    // 3) Window controls (close, minimize, maximize)
    let isMaximized = false;
    let originalState = {};

    const controls = {
        close: () => {
            windowElement.style.display = "none";
        },
        minimize: () => {
            windowElement.style.height = "33px";
        },
        maximize: toggleMaximize
    };

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
        control.addEventListener('click', () => {
            controls[control.className]?.();
        });
    });

    // 4) Dragging functionality (disable when maximized)
    let isDragging = false, startX, startY, startLeft, startTop;
    const header = windowElement.querySelector(".folder-header");

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

    // 5) Load folder content in the right pane
    function loadFolderContent(folderObj) {
        const contentArea = windowElement.querySelector('.folder-items');

        // Switch to grid-view mode
        contentArea.classList.remove('file-view');
        contentArea.classList.add('grid-view');

        const subItems = folderObj.content || [];
        contentArea.innerHTML = subItems.map(subItem => {
            const iconSrc = subItem.type === 'folder'
                ? '../assets/icons/folder-icons/folder.svg'
                : '../assets/icons/pdf.svg';
            return `
      <div class="folder-item" data-id="${subItem.id}" data-type="${subItem.type}">
        <img src="${iconSrc}" alt="${subItem.name}">
        <span>${subItem.name}</span>
      </div>
    `;
        }).join('');

        // Add click events for each subItem
        contentArea.querySelectorAll('.folder-item').forEach(itemEl => {
            itemEl.addEventListener('click', () => {
                const id = itemEl.dataset.id;
                const type = itemEl.dataset.type;
                const clickedSubItem = subItems.find(x => x.id === id);
                if (!clickedSubItem) return;

                if (type === 'folder') {
                    loadFolderContent(clickedSubItem);
                    windowElement.querySelector(".folder-title span").textContent = clickedSubItem.name;
                } else if (type === 'file') {
                    openFile(clickedSubItem.filePath);
                    windowElement.querySelector(".folder-title span").textContent = clickedSubItem.name;
                }
            });
        });
    }

    // 6) Open file in the right pane using an iframe (or embed)
    function openFile(filePath) {
        const contentArea = windowElement.querySelector('.folder-items');

        // Switch to file-view mode
        contentArea.classList.remove('grid-view');
        contentArea.classList.add('file-view');

        contentArea.innerHTML = `
    <div class="file-preview">
      <iframe src="${filePath}" frameborder="0" scrolling="auto"></iframe>
    </div>
  `;
    }

    // 7) Sidebar navigation click handlers
    document.querySelectorAll('.folder-nav').forEach(navItem => {
        navItem.addEventListener('click', () => {
            const id = navItem.dataset.id;
            const type = navItem.dataset.type;
            const clickedItem = desktopItems.find(item => item.id === id);
            if (!clickedItem) return;

            // Show the window
            windowElement.style.display = "block";

            // Set the title
            windowElement.querySelector(".folder-title span").textContent = clickedItem.name;

            // Folder vs File
            if (type === 'folder') {
                loadFolderContent(clickedItem);
            } else if (type === 'file') {
                openFile(clickedItem.filePath);
            }
        });
    });

    // 8) Desktop icon click handlers
    const workFolderIcon = document.getElementById('work-folder');
    workFolderIcon.addEventListener('click', () => {
        windowElement.style.display = 'block';
        const folderObj = desktopItems.find(item => item.id === 'work-experience');
        if (folderObj) {
            windowElement.querySelector(".folder-title span").textContent = folderObj.name;
            loadFolderContent(folderObj);
        }
    });

    const projectsFolderIcon = document.getElementById('projects-folder');
    projectsFolderIcon.addEventListener('click', () => {
        windowElement.style.display = 'block';
        const folderObj = desktopItems.find(item => item.id === 'projects');
        if (folderObj) {
            windowElement.querySelector(".folder-title span").textContent = folderObj.name;
            loadFolderContent(folderObj);
        }
    });

    const researchFolderIcon = document.getElementById('research-folder');
    researchFolderIcon.addEventListener('click', () => {
        windowElement.style.display = 'block';
        const folderObj = desktopItems.find(item => item.id === 'research');
        if (folderObj) {
            windowElement.querySelector(".folder-title span").textContent = folderObj.name;
            loadFolderContent(folderObj);
        }
    });

    const resumeFileIcon = document.getElementById('resume-file');
    resumeFileIcon.addEventListener('click', () => {
        windowElement.style.display = 'block';
        const fileObj = desktopItems.find(item => item.id === 'resume');
        if (fileObj) {
            windowElement.querySelector(".folder-title span").textContent = fileObj.name;
            openFile(fileObj.filePath);
        }
    });

    // 9) Custom Resize Logic: Allow resizing from all edges and corners
    const resizeHandles = windowElement.querySelectorAll('.resize-handle');
    resizeHandles.forEach(handle => {
        handle.addEventListener('mousedown', initResize);
    });

    function initResize(e) {
        e.preventDefault();
        const handle = e.target;
        const startX = e.clientX;
        const startY = e.clientY;
        const rect = windowElement.getBoundingClientRect();
        const startWidth = rect.width;
        const startHeight = rect.height;
        const startLeft = rect.left;
        const startTop = rect.top;

        function doResize(e) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            // Resizing from the right edge
            if (handle.classList.contains('right') || handle.classList.contains('top-right') || handle.classList.contains('bottom-right')) {
                windowElement.style.width = `${startWidth + dx}px`;
            }
            // Resizing from the left edge
            if (handle.classList.contains('left') || handle.classList.contains('top-left') || handle.classList.contains('bottom-left')) {
                windowElement.style.width = `${startWidth - dx}px`;
                windowElement.style.left = `${startLeft + dx}px`;
            }
            // Resizing from the bottom edge
            if (handle.classList.contains('bottom') || handle.classList.contains('bottom-left') || handle.classList.contains('bottom-right')) {
                windowElement.style.height = `${startHeight + dy}px`;
            }
            // Resizing from the top edge
            if (handle.classList.contains('top') || handle.classList.contains('top-left') || handle.classList.contains('top-right')) {
                windowElement.style.height = `${startHeight - dy}px`;
                windowElement.style.top = `${startTop + dy}px`;
            }
        }

        function stopResize() {
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);
        }

        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);
    }
});
