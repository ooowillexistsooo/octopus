const {app, BrowserWindow, globalShortcut, ipcMain, shell} = require('electron')
const {exec, execFile, execFileSync} = require('child_process');
const fs = require('fs');
const path = require('path');

let searchWindow;
let startAppsPromise;

function findEverything() {
    const candidates = [
        ...((process.env.Path || '').split(path.delimiter).map((folder) => path.join(folder, 'es.exe'))),
        path.join(process.env.ProgramFiles || '', 'Everything', 'es.exe'),
        path.join(process.env.ProgramFiles || '', 'Everything 1.4', 'es.exe'),
        path.join(process.env['ProgramFiles(x86)'] || '', 'Everything', 'es.exe'),
        path.join(process.env['ProgramFiles(x86)'] || '', 'Everything 1.4', 'es.exe')
    ];

    for (const candidate of candidates) {
        if (fs.existsSync(candidate)) return candidate;
    }

    try {
        return execFileSync('where.exe', ['es.exe'], {encoding: 'utf8'}).trim().split(/\r?\n/)[0] || null;
    } catch {
        return null;
    }
}

function getStartApps() {
    if (!startAppsPromise) {
        startAppsPromise = new Promise((resolve) => {
            execFile('powershell', [
                '-NoProfile',
                '-ExecutionPolicy',
                'Bypass',
                '-Command',
                'Get-StartApps | Select-Object Name, AppID | ConvertTo-Json -Compress'
            ], (err, stdout) => {
                if (err || !stdout.trim()) {
                    resolve([]);
                    return;
                }

                try {
                    const parsed = JSON.parse(stdout);
                    resolve(Array.isArray(parsed) ? parsed : [parsed]);
                } catch {
                    resolve([]);
                }
            });
        });
    }

    return startAppsPromise;
}

function searchWindowsFiles(query, appResults) {
    const cleanQuery = query.replace(/'/g, "''");
    const psScript = `
        $query = '${cleanQuery}'
        $results = @()
        try {
            $connection = New-Object -ComObject ADODB.Connection
            $connection.Open("Provider=Search.CollatorDSO;Extended Properties='Application=Windows';")
            $recordset = New-Object -ComObject ADODB.Recordset
            $sql = "SELECT TOP 5 System.ItemName, System.ItemPathDisplay FROM SYSTEMINDEX WHERE System.FileName LIKE '%$query%' AND SCOPE='file:C:/Users'"
            $recordset.Open($sql, $connection)
            while (-not $recordset.EOF) {
                $results += [PSCustomObject]@{
                    Name = $recordset.Fields.Item('System.ItemName').Value
                    Path = $recordset.Fields.Item('System.ItemPathDisplay').Value
                    Type = 'file'
                }
                $recordset.MoveNext()
            }
            $recordset.Close()
            $connection.Close()
        } catch {}
        $results | ConvertTo-Json -Compress
    `;

    return new Promise((resolve) => {
        execFile('powershell', ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', psScript], {
            windowsHide: true,
            maxBuffer: 1024 * 1024
        }, (err, stdout) => {
            if (err || !stdout.trim()) return resolve(appResults);
            try {
                const parsed = JSON.parse(stdout);
                const fileResults = Array.isArray(parsed) ? parsed : [parsed];
                resolve([...appResults, ...fileResults]);
            } catch {
                resolve(appResults);
            }
        });
    });
}

function createSearchWindow() {
    searchWindow = new BrowserWindow({
        width: 600,
        height: 80,
        frame: false,
        transparent: true,
        alwaysOnTop: true,
        skipTaskbar: true,
        center: true,
        show: false,
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false
        }
    });

    searchWindow.loadFile('index.html');

    searchWindow.on('blur', () => {
        searchWindow.hide();
    });
}

ipcMain.handle('resize-window', (event, height) => {
    if (searchWindow) {
        searchWindow.setSize(600, height);
    }
});

ipcMain.handle('search-query', async (event, query) => {
    if (!query || query.trim() === '') return [];

    const startApps = await getStartApps();
    const appResults = startApps
        .filter((startApp) => startApp.Name.toLowerCase().includes(query.toLowerCase()))
        .slice(0, 4)
        .map((startApp) => ({
            Name: startApp.Name,
            Path: startApp.AppID,
            Type: 'app'
        }));

    const everything = findEverything();
    if (!everything) return searchWindowsFiles(query, appResults);

    return new Promise((resolve) => {
        execFile(everything, ['-n', '5', '-path', process.env.USERPROFILE || 'C:\\Users', query], {
            windowsHide: true,
            maxBuffer: 1024 * 1024
        }, (err, stdout) => {
            if (err || !stdout.trim()) {
                searchWindowsFiles(query, appResults).then(resolve);
                return;
            }

            const fileResults = stdout.trim().split(/\r?\n/).map((filePath) => ({
                Name: path.basename(filePath),
                Path: filePath,
                Type: 'file'
            }));
            resolve([...appResults, ...fileResults]);
        });
    });
});

ipcMain.handle('open-item', async (event, item) => {
    if (item.Type === 'app') {
        exec(`explorer.exe shell:AppsFolder\\${item.Path}`);
    } else if (item.Type === 'file') {
        shell.openPath(item.Path);
    }

    searchWindow.hide();
});

app.whenReady().then(() => {
    createSearchWindow();

    globalShortcut.register('Alt+Space', () => {
        if (searchWindow.isVisible()) {
            searchWindow.hide();
        } else {
            searchWindow.show();
            searchWindow.focus();
        }
    });
});

app.on('will-quit', () => {
    globalShortcut.unregisterAll();
});