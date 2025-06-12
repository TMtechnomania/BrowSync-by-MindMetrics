function time() {
    return new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
    });
};

function date() {
    return new Date().toLocaleDateString([], {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric'
    }).replace(/\//g, '-');
}

console.log("Service worker started at", time());
console.log("Service worker started on", date());
