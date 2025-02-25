document.addEventListener('DOMContentLoaded', () => {
    const resumeFile = document.getElementById('resume-file');
    const template = document.getElementById('resume-window-template');
    const resumeWindow = template.content.cloneNode(true).firstElementChild;
    document.body.appendChild(resumeWindow);

    const windowElement = document.getElementById('resume-window');
    const header = windowElement.querySelector('.resume-header');
    const closeBtn = windowElement.querySelector('.close');
    const minimizeBtn = windowElement.querySelector('.minimize');
    const maximizeBtn = windowElement.querySelector('.maximize');
    const downloadBtn = windowElement.querySelector('.download');

    let isMaximized = false;
    let originalState = {};

    // Open window
    resumeFile.addEventListener('click', () => {
        windowElement.style.display = 'flex';
        windowElement.style.flexDirection = 'column';
        windowElement.style.alignItems = 'center';
        windowElement.style.zIndex = 1000;
    });

    // Download functionality
    downloadBtn.addEventListener('click', (e) => {
        e.preventDefault();
        const link = document.createElement('a');
        link.href = '../Resume2025v3.pdf';
        link.download = 'Asmit_Resume.pdf';
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
    });

    // Dragging functionality
    let isDragging = false;
    let startX, startY, initialLeft, initialTop;

    header.addEventListener('mousedown', (e) => {
        if (isMaximized) return;
        isDragging = true;
        startX = e.clientX;
        startY = e.clientY;
        initialLeft = windowElement.offsetLeft;
        initialTop = windowElement.offsetTop;

        document.addEventListener('mousemove', handleDrag);
        document.addEventListener('mouseup', () => {
            isDragging = false;
            document.removeEventListener('mousemove', handleDrag);
        });
    });

    function handleDrag(e) {
        if (isDragging) {
            const deltaX = e.clientX - startX;
            const deltaY = e.clientY - startY;
            windowElement.style.left = `${initialLeft + deltaX}px`;
            windowElement.style.top = `${initialTop + deltaY}px`;
        }
    }

    // Window controls
    closeBtn.addEventListener('click', () => {
        windowElement.style.display = 'none';
    });

    minimizeBtn.addEventListener('click', () => {
        windowElement.style.transform = 'translateY(100vh)';
        setTimeout(() => {
            windowElement.style.display = 'none';
        }, 300);
    });

    maximizeBtn.addEventListener('click', () => {
        if (!isMaximized) {
            originalState = {
                width: windowElement.style.width,
                height: windowElement.style.height,
                top: windowElement.style.top,
                left: windowElement.style.left
            };
            windowElement.style.width = '100vw';
            windowElement.style.height = '100vh';
            windowElement.style.top = '0';
            windowElement.style.left = '0';
            maximizeBtn.innerHTML = '<img src="../assets/icons/folder-icons/maximize.svg" alt="Maximize">';
        } else {
            windowElement.style.width = originalState.width;
            windowElement.style.height = originalState.height;
            windowElement.style.top = originalState.top;
            windowElement.style.left = originalState.left;
            maximizeBtn.innerHTML = '<img src="../assets/icons/folder-icons/maximize.svg" alt="Maximize">';
        }
        isMaximized = !isMaximized;
    });

    // Prevent text selection
    header.addEventListener('selectstart', (e) => {
        e.preventDefault();
    });
});
