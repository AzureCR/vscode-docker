// Global Variables
const status = {
    'Succeeded': 4,
    'Queued': 3,
    'Error': 2,
    'Failed': 1
}

var currentN = 4;
var currentDir = "asc"
var modalObject = {
    modal: document.querySelector('.modal'),
    overlay: document.querySelector('.overlay')
};

var triangles = {
    'down': ' ▽',
    'up': ' △'
}

// Main
let content = document.querySelector('#core');
const vscode = acquireVsCodeApi();
setLoadMoreListener();
setTableSorter();

modalObject.overlay.addEventListener('click', (event) => {
    if (event.target === modalObject.overlay) {
        modalObject.overlay.style.display = 'none';
        modalObject.modal.style.display = 'none';
    }
});

const copy = modalObject.modal.querySelector('.copyBtn');
copy.addEventListener('click', () => {
    modalObject.modal.querySelector('#digestVisualizer').select();
    document.execCommand("copy");
});

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
        rows = table.querySelectorAll(".holder");
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

    let sortColumns = document.querySelectorAll(".sort");
    if (sortColumns[n - 1].innerHTML === triangles['down']) {
        sortColumns[n - 1].innerHTML = triangles['up'];
    } else if (sortColumns[n - 1].innerHTML === triangles['up']) {
        sortColumns[n - 1].innerHTML = triangles['down'];
    } else {
        for (cell of sortColumns) {
            cell.innerHTML = '  ';
        }
        sortColumns[n - 1].innerHTML = triangles['down'];
    }

}

function acquireCompareFunction(n) {
    switch (n) {
        case 0:
            return;
        case 1: //Name
        case 2: //Build Task
            return (x, y) => {
                return x.innerHTML.toLowerCase() > y.innerHTML.toLowerCase()
            }
        case 3: //Status
            return (x, y) => {
                return status[x.innerHTML] > status[y.innerHTML];;
            }
        case 4: //Created time
            return (x, y) => {
                if (x.innerHTML === '') return true;
                if (y.innerHTML === '') return false;
                let dateX = new Date(x.innerHTML);
                let dateY = new Date(y.innerHTML);
                return dateX > dateY;
            }
        case 5: //Elapsed time
            return (x, y) => {
                if (x.innerHTML === '') return true;
                if (y.innerHTML === '') return false;
                return (+x.innerHTML.substring(0, x.innerHTML.length - 1)) > (+y.innerHTML.substring(0, x.innerHTML.length - 1));
            }
        case 6: //OS Type
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

        const digestClickables = item.nextElementSibling.querySelectorAll('.copy');
        setDigestListener(digestClickables);

    } else if (message.type === 'endContinued') {
        sortTable(currentN, currentDir, true);
    } else if (message.type === 'end') {
        window.addEventListener("resize", manageWidth);
        manageWidth();
    }

});

function setSingleAccordion(item) {
    item.addEventListener('click', function () {
        this.classList.toggle('active');
        this.querySelector('.arrow').classList.toggle('activeArrow');
        let panel = this.nextElementSibling;
        if (panel.style.maxHeight) {
            panel.style.display = 'none';
            panel.style.maxHeight = null;
            let index = openAccordions.indexOf(panel);
            if (index > -1) {
                openAccordions.splice(index, 1);
            }
        } else {
            openAccordions.push(panel);
            setAccordionTableWidth();
            panel.style.display = 'table-row';
            let paddingTop = +panel.style.paddingTop.split('px')[0];
            let paddingBottom = +panel.style.paddingBottom.split('px')[0];
            panel.style.maxHeight = (panel.scrollHeight + paddingTop + paddingBottom) + 'px';
        }
    });
}

function setTableSorter() {
    let items = document.getElementsByTagName('TH');
    for (let i = 0; i < items.length; i++) {
        items[i].addEventListener('click', () => {
            sortTable(i);
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

function setDigestListener(digestClickables) {
    for (digest of digestClickables) {
        digest.addEventListener('click', function () {
            modalObject.modal.querySelector('#digestVisualizer').value = this.parentNode.dataset.digest;
            modalObject.modal.style.display = 'flex';
            modalObject.overlay.style.display = 'flex';
        });
    }
}

function manageWidth() {
    let headerCells = document.querySelectorAll("#headerTable th");
    let topRow = document.querySelector("#core tr");
    let topRowCells = topRow.querySelectorAll("td");
    for (let i = 0; i < topRowCells.length; i++) {
        let width = parseInt(getComputedStyle(topRowCells[i]).width);
        headerCells[i].style.width = width + "px";
    }
    setAccordionTableWidth();
}

let openAccordions = [];

function setAccordionTableWidth() {
    let topRow = document.querySelector("#core tr");
    let topRowCells = topRow.querySelectorAll("td");
    let topWidths = [];
    for (let cell of topRowCells) {
        topWidths.push(parseInt(getComputedStyle(cell).width));
    }
    for (acc of openAccordions) {
        let cells = acc.querySelectorAll(".innerTable td");
        cells[0].style.width = topWidths[0];
        cells[5].style.width = topWidths[1] + topWidths[2] + topWidths[3] + topWidths[4] + topWidths[5];
        cells[2].style.width = topWidths[6];
        for (let i = 3; i < cells.length; i++) {
            if ((i + 2) % 4 === 1) {
                cells[i].style.width = topWidths[0] + "px";
            } else if ((i + 2) % 4 === 2) {
                cells[i].style.width = (topWidths[1] + topWidths[2]) + "px";
            } else if ((i + 2) % 4 === 3) {
                cells[i].style.width = (topWidths[3] + topWidths[4]) + "px";
            } else if ((i + 2) % 4 === 0) {
                cells[i].style.width = topWidths[5] + "px";
            }
        }
    }
}
