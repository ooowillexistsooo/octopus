const { ipcRenderer } = require('electron');
const input = document.getElementById('searchInput');
const resultsList = document.getElementById('results');
let items = [];
let selectedIndex = -1;
let searchTimer;
let searchRequest = 0;

input.addEventListener('input', (e) =>{
    const query = e.target.value.trim();
    const requestId = ++searchRequest;
    clearTimeout(searchTimer);

    if (!query) {
        resultsList.innerHTML = '';
        ipcRenderer.invoke('resize-window', 80);
        return;
    }

    searchTimer = setTimeout(async () => {
        const nextItems = await ipcRenderer.invoke('search-query', query);
        if (requestId !== searchRequest || query !== input.value.trim()) return;
        items = nextItems;
        renderResults();
    }, 200);
});

function renderResults() {
    resultsList.innerHTML = '';
    selectedIndex = -1;

    if (items.length === 0) {
        ipcRenderer.invoke('resize-window', 80);
        return;
    }

    items.forEach((item) => {
        const li = document.createElement('li');
        li.innerHTML = `
        <span class="badge">${item.Type}</span>
        <div class="details">
          <span class="name">${item.Name}</span>
          <span class="path">${item.Path}</span>
        </div>
        `;
        li.addEventListener('click', () => openItem(item));
        resultsList.appendChild(li);
    });

    const newHeight = Math.min(80 + (items.length * 52), 380);
    ipcRenderer.invoke('resize-window', newHeight);
}

function openItem(item) {
    ipcRenderer.invoke('open-item', item);
}

window.addEventListener('keydown', (e) => {
    const listItems = resultsList.querySelectorAll('li');
    if (e.key === 'ArrowDown' && selectedIndex < listItems.length - 1) {
        selectedIndex++;
    } else if (e.key === 'ArrowUp' && selectedIndex > 0) {
        selectedIndex--;
    } else if (e.key === 'Enter' && selectedIndex >= 0) {
        openItem(items[selectedIndex]);
        return;
    }
    
    listItems.forEach((li, idx) => {
        li.classList.toggle('selected', idx === selectedIndex);
    });
});