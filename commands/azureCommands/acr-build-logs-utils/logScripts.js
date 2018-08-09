// Global Variables
const status = {
    'Succeeded': 4,
    'Queued': 3,
    'Error': 2,
    'Failed': 1
}

var currentN = 4;
var currentDir = "asc"

// Main
let content = document.querySelector('#core');
const vscode = acquireVsCodeApi();
setLoadMoreListener();
setTableSorter();

/* Sorting
 * PR note, while this does not use a particularly quick algorithm
 * it allows a low stuttering experience that allowed rapid testing.
 * I will improve it soon.*/
function sortTable(n, dir = "asc", holdDir = false) {
    currentDir = dir;
    currentN = n;
    let table, rows, switching, i, x, y, shouldSwitch, switchcount = 0;
    let cmpFunc = acquireCompareFunction(n);
    table = document.getElementById("core");
    switching = true;
    //Set the sorting direction to ascending:

    while (switching) {
        switching = false;
        rows = table.getElementsByClassName("holder");
        for (i = 0; i < rows.length - 1; i++) {
            shouldSwitch = false;
            x = rows[i].getElementsByTagName("TD")[n];
            y = rows[i + 1].getElementsByTagName("TD")[n];
            if (dir == "asc") {
                if (cmpFunc(x, y)) {
                    shouldSwitch = true;
                    break;
                }
            } else if (dir == "desc") {
                if (cmpFunc(y, x)) {
                    shouldSwitch = true;
                    break;
                }
            }
        }
        if (shouldSwitch) {
            rows[i].parentNode.insertBefore(rows[i + 1], rows[i]);
            switching = true;
            switchcount++;
        } else {
            /*If no switching has been done AND the direction is "asc", set the direction to "desc" and run the while loop again.*/
            if (switchcount == 0 && dir == "asc" && !holdDir) {
                dir = "desc";
                switching = true;
            }
        }
    }
}

function acquireCompareFunction(n) {
    switch (n) {
        case 0: //Name
        case 1: //Build Task
            return (x, y) => {
                return x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()
            }
        case 2: //Status
            return (x, y) => {
                return status[x.innerHTML] > status[y.innerHTML];;
            }
        case 3: //Start time
        case 4: // Finish time
            return (x, y) => {
                if (x.innerHTML === '?') return true;
                if (y.innerHTML === '?') return false;
                let dateX = new Date(x.innerHTML);
                let dateY = new Date(y.innerHTML);
                return dateX > dateY;
            }
        case 5: //OS Type
            return (x, y) => {
                return x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()
            }
        default:
            throw 'Could not acquire Compare function, invalid n';
    }
}

// Event Listener Setup

window.addEventListener('message', event => {
    const message = event.data; // The JSON data our extension sent
    if (message.type === 'populate') {
        content.insertAdjacentHTML('beforeend', message.logComponent);

        let item = content.querySelector(`#btn${message.id}`);
        setSingleAccordion(item);

        const logButton = content.querySelector(`#log${message.id}`);
        setLogBtnListener(logButton);

    } else if (message.type === 'endContinued') {
        sortTable(currentN, currentDir, true);
    }

});

function setSingleAccordion(item) {
    item.addEventListener('click', function () {
        this.classList.toggle('active');
        this.querySelector('.arrow').classList.toggle('activeArrow');
        var panel = this.nextElementSibling;
        if (panel.style.maxHeight) {
            panel.style.maxHeight = null;
        } else {
            panel.style.maxHeight = panel.scrollHeight + 'px';
        }
    });
}

function setTableSorter() {
    let items = document.getElementsByTagName('TH');
    for (let i = 0; i < items.length; i++) {
        items[i].addEventListener('click', () => {
            sortTable(i)
        });
    }
}

function setLogBtnListener(item) {
    item.addEventListener('click', function () {
        const id = this.id.substring('Log'.length);
        vscode.postMessage({
            logRequest: {
                'id': id
            }
        });
    });
}

function setLoadMoreListener() {
    let item = document.querySelector("#loadBtn");
    item.addEventListener('click', function () {
        vscode.postMessage({
            loadMore: true
        });
    });
}
