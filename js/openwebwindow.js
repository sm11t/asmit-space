// openwebwindow.js
// A helper that creates a "web window" with an iframe inside.

function createWebWindow(appTitle, appIcon, url) {
    // 1) Create the main container
    const webWindow = document.createElement('div');
    webWindow.classList.add('web-window');

    // 2) Build the inner HTML (similar to .folder-window)
    webWindow.innerHTML = `
    <div class="web-header">
      <div class="web-title">
        <img src="${appIcon}" alt="${appTitle}" />
        <span>${appTitle}</span>
      </div>
      <div class="window-controls">
        <img src="../assets/icons/folder-icons/minimize.svg" class="minimize" alt="Minimize">
        <img src="../assets/icons/folder-icons/maximize.svg" class="maximize" alt="Maximize">
        <img src="../assets/icons/folder-icons/close.svg" class="close" alt="Close">
      </div>
    </div>
    <div class="web-content">
      <iframe src="${url}" frameborder="0"></iframe>
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
  `;

    // 3) Append to body (hidden initially or visible immediately)
    document.body.appendChild(webWindow);

    // 4) Initialize drag/resize and window controls
    initWebWindowDragAndResize(webWindow);

    // 5) Return the created element
    return webWindow;
}

function initWebWindowDragAndResize(webWindow) {
    let isMaximized = false;
    let originalState = {};

    // A) Close/Minimize/Maximize
    const closeBtn = webWindow.querySelector('.close');
    const minimizeBtn = webWindow.querySelector('.minimize');
    const maximizeBtn = webWindow.querySelector('.maximize');

    closeBtn.addEventListener('click', () => {
        // Remove from DOM entirely
        webWindow.remove();
    });

    minimizeBtn.addEventListener('click', () => {
        // Example: just collapse the height
        webWindow.style.height = '33px';
    });

    maximizeBtn.addEventListener('click', () => {
        toggleMaximize();
    });

    function toggleMaximize() {
        if (!isMaximized) {
            // Save current position/size
            const rect = webWindow.getBoundingClientRect();
            originalState = {
                left: webWindow.style.left || rect.left + 'px',
                top: webWindow.style.top || rect.top + 'px',
                width: webWindow.style.width || rect.width + 'px',
                height: webWindow.style.height || rect.height + 'px',
                position: webWindow.style.position || 'absolute'
            };
            // Fullscreen
            webWindow.classList.add('maximized');
            webWindow.style.position = 'fixed';
            webWindow.style.left = '0';
            webWindow.style.top = '0';
            webWindow.style.width = '100%';
            webWindow.style.height = '100%';
        } else {
            // Restore
            webWindow.classList.remove('maximized');
            webWindow.style.position = originalState.position;
            webWindow.style.left = originalState.left;
            webWindow.style.top = originalState.top;
            webWindow.style.width = originalState.width;
            webWindow.style.height = originalState.height;
        }
        isMaximized = !isMaximized;
    }

    // B) Dragging
    const header = webWindow.querySelector('.web-header');
    let isDragging = false, startX, startY, startLeft, startTop;

    header.addEventListener('mousedown', (e) => {
        // Don’t drag if maximized
        if (webWindow.classList.contains('maximized')) return;
        isDragging = true;
        const rect = webWindow.getBoundingClientRect();
        startX = e.clientX;
        startY = e.clientY;
        startLeft = rect.left;
        startTop = rect.top;
        document.addEventListener('mousemove', onMouseMove);
        document.addEventListener('mouseup', onMouseUp);
    });

    function onMouseMove(e) {
        if (!isDragging) return;
        webWindow.style.left = (startLeft + e.clientX - startX) + 'px';
        webWindow.style.top = (startTop + e.clientY - startY) + 'px';
    }

    function onMouseUp() {
        isDragging = false;
        document.removeEventListener('mousemove', onMouseMove);
        document.removeEventListener('mouseup', onMouseUp);
    }

    // C) Resizing (same approach as your folder-window)
    const handles = webWindow.querySelectorAll('.resize-handle');
    handles.forEach(handle => {
        handle.addEventListener('mousedown', initResize);
    });

    function initResize(e) {
        e.preventDefault();
        const handle = e.target;
        const startX = e.clientX;
        const startY = e.clientY;
        const rect = webWindow.getBoundingClientRect();
        const startWidth = rect.width;
        const startHeight = rect.height;
        const startLeft = rect.left;
        const startTop = rect.top;

        function doResize(e) {
            const dx = e.clientX - startX;
            const dy = e.clientY - startY;

            // Right edge
            if (handle.classList.contains('right') || handle.classList.contains('top-right') || handle.classList.contains('bottom-right')) {
                webWindow.style.width = (startWidth + dx) + 'px';
            }
            // Left edge
            if (handle.classList.contains('left') || handle.classList.contains('top-left') || handle.classList.contains('bottom-left')) {
                webWindow.style.width = (startWidth - dx) + 'px';
                webWindow.style.left = (startLeft + dx) + 'px';
            }
            // Bottom edge
            if (handle.classList.contains('bottom') || handle.classList.contains('bottom-left') || handle.classList.contains('bottom-right')) {
                webWindow.style.height = (startHeight + dy) + 'px';
            }
            // Top edge
            if (handle.classList.contains('top') || handle.classList.contains('top-left') || handle.classList.contains('top-right')) {
                webWindow.style.height = (startHeight - dy) + 'px';
                webWindow.style.top = (startTop + dy) + 'px';
            }
        }

        function stopResize() {
            document.removeEventListener('mousemove', doResize);
            document.removeEventListener('mouseup', stopResize);
        }

        document.addEventListener('mousemove', doResize);
        document.addEventListener('mouseup', stopResize);
    }
}
