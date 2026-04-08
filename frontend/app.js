let dropArea = document.getElementById('drop-area');

// Prevent default events
;['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, preventDefaults, false)
  document.body.addEventListener(eventName, preventDefaults, false)
})

function preventDefaults(e) {
  e.preventDefault();
  e.stopPropagation();
}

// Visual feedback for Drag and Drop
;['dragenter', 'dragover'].forEach(eventName => {
  dropArea.addEventListener(eventName, highlight, false)
})

;['dragleave', 'drop'].forEach(eventName => {
  dropArea.addEventListener(eventName, unhighlight, false)
})

function highlight(e) {
  dropArea.classList.add('highlight');
}

function unhighlight(e) {
  dropArea.classList.remove('highlight');
}

dropArea.addEventListener('drop', handleDrop, false);

function handleDrop(e) {
  let dt = e.dataTransfer;
  let files = dt.files;
  handleFiles(files);
}

function handleFiles(files) {
    if(files.length === 0) return;
    
    let pdfFiles = [];
    for(let i=0; i<files.length; i++){
        if(files[i].type === "application/pdf") {
            pdfFiles.push(files[i]);
        }
    }
    
    if(pdfFiles.length === 0) {
        alert("Ops! Por favor, envie apenas arquivos PDF.");
        return;
    }
    
    uploadFiles(pdfFiles);
}

function uploadFiles(pdfFiles) {
    document.getElementById('drop-area').classList.add('hidden');
    document.getElementById('loading').classList.remove('hidden');
    
    // Auto-detecta nuvem vs maquina local (file explorer)
    const url = location.protocol === 'file:' ? 'http://localhost:8000/api/upload' : '/api/upload';
    
    let allPromises = pdfFiles.map(file => {
        const formData = new FormData();
        formData.append('file', file);
        return fetch(url, { method: 'POST', body: formData })
        .then(async r => {
            if (!r.ok) {
                let errText = await r.text();
                throw new Error(`Servidor retornou erro ${r.status}: ${errText.substring(0, 100)}...`);
            }
            try {
                return await r.json();
            } catch (err) {
                throw new Error(`Falha ao ler JSON do servidor: ${err.message}`);
            }
        });
    });
    
    Promise.all(allPromises)
    .then(responses => {
        document.getElementById('loading').classList.add('hidden');
        let allResults = [];
        let hasError = false;
        
        responses.forEach(data => {
            if(data.success) {
                allResults = allResults.concat(data.data);
            } else {
                hasError = true;
                console.error("Erro interno do worker:", data.error);
            }
        });
        
        if (hasError) {
            alert("⚠️ Alguns PDFs tiveram erro (pode ser formatação ausente). Exibindo resultados que funcionaram.");
        }
        
        renderResults(allResults);
        document.getElementById('results-section').classList.remove('hidden');
    })
    .catch((e) => {
        document.getElementById('loading').classList.add('hidden');
        alert("❌ Ocorreu um erro no acesso à Nuvem: \\n" + e.message + "\\n\\nIsso geralmente significa que o servidor gratuito do Render desligou por falta de memória RAM ao tentar ler um PDF muito grande, ou demorou muito e deu Timeout.");
        resetApp();
    });
}

function renderResults(results) {
    const thead = document.getElementById('table-head-row');
    const tbody = document.getElementById('table-body');
    
    thead.innerHTML = '';
    tbody.innerHTML = '';

    if(!results || results.length === 0) {
        tbody.innerHTML = '<tr><td colspan="100%">Nenhum dado encontrado no arquivo.</td></tr>';
        return;
    }

    // Combine all keys
    const columnSet = new Set();
    results.forEach(emp => {
        if(emp.sums_period_01_25) Object.keys(emp.sums_period_01_25).forEach(k => columnSet.add(k));
        if(emp.sums_period_26_31) Object.keys(emp.sums_period_26_31).forEach(k => columnSet.add(k));
    });

    const columns = Array.from(columnSet);

    // Helpers
    function parseTimeStr(timeStr) {
        if(!timeStr || timeStr === '-') return 0;
        let isNeg = false;
        let clean = timeStr.trim();
        if(clean.startsWith('-')) {
            isNeg = true;
            clean = clean.substring(1);
        }
        const parts = clean.split(':');
        if(parts.length === 2) {
            const m = parseInt(parts[0], 10) * 60 + parseInt(parts[1], 10);
            return isNeg ? -m : m;
        }
        return 0;
    }

    function formatTimeMins(mins) {
        const isNeg = mins < 0;
        const absMins = Math.abs(mins);
        const h = Math.floor(absMins / 60);
        const m = absMins % 60;
        const sign = isNeg ? '-' : '';
        return `${sign}${h.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    }

    // Build the Header
    thead.innerHTML = `<th>Funcionário</th>`;
    columns.forEach(col => {
        thead.innerHTML += `<th>${col}</th>`;
    });
    thead.innerHTML += `<th style="background: rgba(88, 166, 255, 0.05); color: #58a6ff;">TOTAL (1 a 25)</th>`;
    thead.innerHTML += `<th style="background: rgba(255, 166, 88, 0.05); color: #ffa658;">TOTAL (26 a 31)</th>`;

    // Build Table Body
    results.forEach(emp => {
        let row = `<tr>
            <td>
                <strong style="font-size: 1.1rem; color: #fff;">${emp.name}</strong><br>
                <small style="color:var(--text-secondary)">Página ${emp.page}</small>
            </td>`;
        
        let total_01_25_mins = 0;
        let total_26_31_mins = 0;
        let alertStyle = '';
        let extrasTotal = 0;

        columns.forEach(col => {
            const val_01 = (emp.sums_period_01_25 && emp.sums_period_01_25[col]) ? emp.sums_period_01_25[col] : '00:00';
            const val_26 = (emp.sums_period_26_31 && emp.sums_period_26_31[col]) ? emp.sums_period_26_31[col] : '00:00';
            
            const mins_01 = parseTimeStr(val_01);
            const mins_26 = parseTimeStr(val_26);
            
            total_01_25_mins += mins_01;
            total_26_31_mins += mins_26;
            
            if (col.toLowerCase().includes('extra') || col.toLowerCase().includes('e100')) {
                extrasTotal += (mins_01 + mins_26);
            }

            const combined_mins = mins_01 + mins_26;
            const final_val = combined_mins === 0 ? '-' : formatTimeMins(combined_mins);

            row += `<td><span style="color:var(--text-primary); font-weight:500;">${final_val}</span></td>`;
        });
        
        if (extrasTotal > 600) { 
            alertStyle = 'background: rgba(255, 99, 71, 0.1); border-left: 3px solid #ff6347;';
        }

        const totalStr_01_25 = formatTimeMins(total_01_25_mins);
        const totalStr_26_31 = formatTimeMins(total_26_31_mins);

        row += `<td style="border-left: 1px solid var(--glass-border); font-weight: 800;"><span style="color:var(--accent);">${totalStr_01_25}</span></td>`;
        row += `<td><span style="color:#ffa658; font-weight: 800;">${totalStr_26_31}</span></td>`;
        
        row = row.replace('<tr>', `<tr style="${alertStyle}">`);
        row += `</tr>`;
        tbody.innerHTML += row;
    });
}

function resetApp() {
    document.getElementById('results-section').classList.add('hidden');
    document.getElementById('drop-area').classList.remove('hidden');
}

function exportToCSV() {
    const table = document.getElementById("results-table");
    let csvContent = "";
    const rows = table.querySelectorAll("tr");
    
    rows.forEach(row => {
        let rowData = [];
        const cols = row.querySelectorAll("td, th");
        cols.forEach(col => {
            // Remove lixos e pega string limpa. 
            // O \uFEFF adicionado depois resolve o bug de caracteres em pt-BR (UTF-8 com BOM) no Excel Windows.
            let text = col.innerText.replace(/(\r\n|\n|\r)/gm, " ").trim();
            rowData.push(`"${text}"`);
        });
        csvContent += rowData.join(";") + "\\n";
    });

    const blob = new Blob(["\\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement("a");
    const url = URL.createObjectURL(blob);
    link.setAttribute("href", url);
    link.setAttribute("download", "Apuração_Ponto_Funcionários.csv");
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}
