const { PDFDocument, PDFName, PDFRef, PDFDict, PDFArray } = require('pdf-lib');
const fs = require('fs');

async function run() {
    try {
        const data = fs.readFileSync('/home/pulsta/vscode/repo/form-name-matcher/BRUS-BLANK.pdf');
        const pdfDoc = await PDFDocument.load(data);
        const form = pdfDoc.getForm();
        const fields = form.getFields();
        const pageCount = pdfDoc.getPageCount();
        const lastPage = pdfDoc.getPage(pageCount - 1);

        console.log(`File: BRUS-BLANK.pdf`);
        console.log(`Pages: ${pageCount}`);

        const lastPageAnnots = lastPage.node.Annots();
        if (!lastPageAnnots) {
            console.log("No annotations on last page.");
            return;
        }

        const candidates = [];
        const refToFieldMap = new Map();

        // Build map for quick lookup
        fields.forEach(field => {
            if (field.ref) refToFieldMap.set(field.ref.toString(), field);
            // Some fields have multiple widgets
            const widgets = field.acroField.getWidgets();
            widgets.forEach(w => {
                if (w.ref) refToFieldMap.set(w.ref.toString(), field);
            });
        });

        for (let i = 0; i < lastPageAnnots.size(); i++) {
            const ref = lastPageAnnots.get(i);
            const dict = pdfDoc.context.lookup(ref);
            if (!(dict instanceof PDFDict)) continue;

            const subtype = dict.get(PDFName.of('Subtype'));
            if (subtype !== PDFName.of('Widget')) continue;

            let matchedField = null;
            const refStr = ref instanceof PDFRef ? ref.toString() : null;

            if (refStr && refToFieldMap.has(refStr)) {
                matchedField = refToFieldMap.get(refStr);
            }

            if (!matchedField) {
                const parent = dict.get(PDFName.of('Parent'));
                if (parent instanceof PDFRef && refToFieldMap.has(parent.toString())) {
                    matchedField = refToFieldMap.get(parent.toString());
                }
            }

            if (matchedField && matchedField.constructor.name === 'PDFCheckBox') {
                const rectArr = dict.get(PDFName.of('Rect'));
                if (rectArr instanceof PDFArray) {
                    const x = rectArr.get(0).asNumber();
                    const y = rectArr.get(1).asNumber();
                    candidates.push({ name: matchedField.getName(), x, y });
                }
            }
        }

        console.log(`Total Checkboxes on Last Page: ${candidates.length}`);

        // Sort just like the app
        candidates.sort((a, b) => {
            const yDiff = Math.abs(a.y - b.y);
            if (yDiff < 10) return a.x - b.x;
            return a.y - b.y;
        });

        console.log("Sorted Candidates (Index, Name, X, Y):");
        candidates.forEach((c, idx) => {
            console.log(`${idx}: ${c.name} | X: ${c.x.toFixed(2)} | Y: ${c.y.toFixed(2)}`);
        });

    } catch (err) {
        console.error("Error:", err);
    }
}

run();
