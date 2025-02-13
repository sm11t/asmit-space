function openFolder(folder) {
    const links = {
        work: "../work.html",
        projects: "https://github.com/sm11t",
        research: "../research.html"
    };

    if (links[folder]) {
        window.open(links[folder], "_blank");
    }
}
