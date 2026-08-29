const { ipcRenderer } = require('electron');
const input = document.getElementById('searchInput');
const resultsList = document.getElementById('results');

let items = [];
let selectedIndex = 0;
let searchTimer = null;
let searchRequest = 0;

function evaluateMath(expr) {
    if (!expr) return null;
    
    const sanitized = expr.replace(/\s+/g, '');
    if (!/^[0-9+\-*/%.()^]+$/.test(sanitized)) return null;
    
    if (!/[+\-*/%^]/.test(sanitized)) return null; 

    try {
        const jsMathExpr = sanitized.replace(/\^/g, '**');
        const result = new Function(`'use strict'; return (${jsMathExpr})`)();
        
        if (typeof result === 'number' && !isNaN(result) && isFinite(result)) {
            return result;
        }
    } catch {
        return null;
    }
    return null;
}

input.addEventListener('input', (e) => {
    const query = e.target.value.trim();
    const requestId = ++searchRequest;
    clearTimeout(searchTimer);

    if (!query) {
        items = [];
        renderResults();
        return;
    }

    searchTimer = setTimeout(async () => {
        const calcVal = evaluateMath(query);
        const dynamicPrefix = [];

        if (calcVal !== null) {
            dynamicPrefix.push({
                Name: `= ${calcVal}`,
                Path: 'Copy result to clipboard',
                Type: 'calc',
                Value: String(calcVal)
            });
        }

        const fileAppResults = await ipcRenderer.invoke('search-query', query);
        if (requestId !== searchRequest || query !== input.value.trim()) return;

        items = [
            ...dynamicPrefix,
            ...fileAppResults,
            {
                Name: `Search Google for "${query}"`,
                Path: `https://www.google.com/search?q=${encodeURIComponent(query)}`,
                Type: 'web'
            }
        ];

        renderResults();
    }, 150);
});

function renderResults() {
    resultsList.innerHTML = '';
    selectedIndex = items.length > 0 ? 0 : -1;

    if (items.length === 0) {
        ipcRenderer.invoke('resize-window', 80);
        return;
    }

    items.forEach((item, idx) => {
        const li = document.createElement('li');
        if (idx === selectedIndex) li.classList.add('selected');

        li.innerHTML = `
            <span class="badge badge-${item.Type}">${item.Type}</span>
            <div class="details">
                <span class="name">${item.Name}</span>
                <span class="path">${item.Path}</span>
            </div>
        `;

        li.addEventListener('click', () => openItem(item));
        resultsList.appendChild(li);
    });

    const newHeight = Math.min(80 + (items.length * 52), 400);
    ipcRenderer.invoke('resize-window', newHeight);
}

function openItem(item) {
    if (!item) return;

    if (item.Type === 'calc') {
        navigator.clipboard.writeText(item.Value);
        ipcRenderer.invoke('close-window');
    } else {
        ipcRenderer.invoke('open-item', item);
    }
}

window.addEventListener('keydown', (e) => {
    const listItems = resultsList.querySelectorAll('li');
    if (listItems.length === 0) return;

    if (e.key === 'ArrowDown') {
        e.preventDefault();
        selectedIndex = Math.min(selectedIndex + 1, listItems.length - 1);
    } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        selectedIndex = Math.max(selectedIndex - 1, 0);
    } else if (e.key === 'Enter') {
        e.preventDefault();
        if (selectedIndex >= 0 && selectedIndex < items.length) {
            openItem(items[selectedIndex]);
        }
        return;
    }

    listItems.forEach((li, idx) => {
        li.classList.toggle('selected', idx === selectedIndex);
    });
});