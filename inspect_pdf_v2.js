const fs = require('fs');
const PDFLib = require('pdf-lib');

async function inspect() {
    const data = fs.readFileSync('/home/pulsta/vscode/repo/form-name-matcher/BLANK.pdf');
    const pdfDoc = await PDFLib.PDFDocument.load(data);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    console.log(`PDF loaded. Total pages: ${pdfDoc.getPageCount()}`);

    // Target First Page
    const pageIdx = 0;
    const page = pdfDoc.getPage(pageIdx);
    const annots = page.node.Annots();

    const refToFieldMap = new Map();
    fields.forEach(f => {
        if (f.ref) refToFieldMap.set(f.ref.toString(), f);
        f.acroField.getWidgets().forEach(w => {
            if (w.ref) refToFieldMap.set(w.ref.toString(), f);
        });
    });

    console.log(`\n--- INSPECTING PAGE ${pageIdx + 1} ---`);
    const results = [];

    if (annots) {
        for (let i = 0; i < annots.size(); i++) {
            const ref = annots.get(i);
            const dict = pdfDoc.context.lookup(ref);
            if (!(dict instanceof PDFLib.PDFDict)) continue;

            const subtype = dict.get(PDFLib.PDFName.of('Subtype'));
            if (subtype !== PDFLib.PDFName.of('Widget')) continue;

            const rectArr = dict.get(PDFLib.PDFName.of('Rect'));
            if (!(rectArr instanceof PDFLib.PDFArray)) continue;
            const x = rectArr.get(0).asNumber();
            const y = rectArr.get(1).asNumber();

            let field = null;
            const refStr = (ref instanceof PDFLib.PDFRef) ? ref.toString() : null;
            if (refStr && refToFieldMap.has(refStr)) field = refToFieldMap.get(refStr);
            if (!field) {
                const parent = dict.get(PDFLib.PDFName.of('Parent'));
                if (parent instanceof PDFLib.PDFRef && refToFieldMap.has(parent.toString())) {
                    field = refToFieldMap.get(parent.toString());
                }
            }

            if (field) {
                let text = null;
                if (field instanceof PDFLib.PDFTextField) {
                    try {
                        text = field.getText();
                    } catch (e) {
                        text = "[RichText / Error reading]";
                    }
                }
                results.push({
                    name: field.getName(),
                    type: field.constructor.name,
                    x, y,
                    text: text
                });
            }
        }
    }

    // Cluster by Y
    results.sort((a, b) => b.y - a.y); // Top to bottom
    const rows = [];
    if (results.length > 0) {
        let currentRow = [results[0]];
        for (let i = 1; i < results.length; i++) {
            if (Math.abs(results[i].y - currentRow[0].y) < 20) {
                currentRow.push(results[i]);
            } else {
                rows.push(currentRow);
                currentRow = [results[i]];
            }
        }
        rows.push(currentRow);
    }

    rows.forEach((row, idx) => {
        row.sort((a, b) => b.y - a.y || a.x - b.x);
        row.forEach(f => {
            if (f.type === 'PDFTextField') {
                console.log(`Name: ${f.name.padEnd(30)} | Text: "${f.text || ''}" | Y: ${f.y.toFixed(1)}`);
            }
        });
    });
}

inspect().catch(console.error);
