const { PDFDocument, PDFCheckBox } = require('pdf-lib');
const fs = require('fs');

async function inspect() {
    const data = fs.readFileSync('/home/pulsta/vscode/repo/form-name-matcher/BRUS-BLANK.pdf');
    const pdfDoc = await PDFDocument.load(data);
    const form = pdfDoc.getForm();
    const fields = form.getFields();

    console.log('Total Fields:', fields.length);

    const pageCount = pdfDoc.getPageCount();
    const lastPage = pdfDoc.getPage(pageCount - 1);
    const { width, height } = lastPage.getSize();
    console.log(`Last Page Size: ${width}x${height}`);

    const checkboxes = fields.filter(f => f instanceof PDFCheckBox);
    console.log('Total Checkboxes:', checkboxes.length);

    const lastPageAnnots = lastPage.node.Annots();
    const candidates = [];

    if (lastPageAnnots) {
        const refToFieldMap = new Map();
        for (const field of checkboxes) {
            if (field.ref) refToFieldMap.set(field.ref.toString(), field);
            const widgets = field.acroField.getWidgets();
            widgets.forEach(w => {
                if (w.ref) refToFieldMap.set(w.ref.toString(), field);
            });
        }

        for (let i = 0; i < lastPageAnnots.size(); i++) {
            const annotRef = lastPageAnnots.get(i);
            let annotDict = null;
            if (annotRef instanceof PDFRef) { // Wait, PDFRef is not exported directly like this
                annotDict = pdfDoc.context.lookup(annotRef);
            } else {
                annotDict = annotRef;
            }
            // ... actually simpler to just use form.getFields() and check page index?
        }
    }

    // Simpler way to find checkboxes on last page:
    const lastPageCheckBoxes = [];
    for (const field of checkboxes) {
        const widgets = field.acroField.getWidgets();
        for (const w of widgets) {
            const rect = w.getRectangle();
            // Check if widget is on the last page.
            // In pdf-lib, we can check the P (Page) entry in the widget dict.
            const p = w.dict.get(PDFDocument.PDFName.of('P'));
            // Or just check if it's within the last page's annotations.
            // But let's just print ALL checkboxes with their coordinates and names.
            console.log(`Field: ${field.getName()}, Rect: x=${rect.x}, y=${rect.y}, w=${rect.width}, h=${rect.height}`);
        }
    }
}

// Minimal implementation of the logic in the HTML
async function runLikeApp() {
    const data = fs.readFileSync('/home/pulsta/vscode/repo/form-name-matcher/BRUS-BLANK.pdf');
    const pdfDoc = await PDFDocument.load(data);
    const form = pdfDoc.getForm();
    const fields = form.getFields();
    const pageCount = pdfDoc.getPageCount();
    const checkboxes = fields.filter(f => f instanceof PDFCheckBox);

    const lastPage = pdfDoc.getPage(pageCount - 1);
    const lastPageAnnots = lastPage.node.get(pdfDoc.context.obj('Annots'));

    const candidates = [];
    const refToFieldMap = new Map();
    for (const field of checkboxes) {
        if (field.ref) refToFieldMap.set(field.ref.toString(), field);
        const widgets = field.acroField.getWidgets();
        widgets.forEach(w => {
            if (w.ref) refToFieldMap.set(w.ref.toString(), field);
        });
    }

    const annots = lastPage.node.Annots();
    if (annots) {
        for (let i = 0; i < annots.size(); i++) {
            const ref = annots.get(i);
            const dict = pdfDoc.context.lookup(ref);
            const subtype = dict.get(PDFDocument.PDFName.of('Subtype'));
            // Subtype check:
            if (subtype?.toString() !== '/Widget') continue;

            let matchedField = refToFieldMap.get(ref.toString());
            if (!matchedField) {
                const parent = dict.get(PDFDocument.PDFName.of('Parent'));
                if (parent) matchedField = refToFieldMap.get(parent.toString());
            }

            if (matchedField && matchedField instanceof PDFCheckBox) {
                const rect = dict.get(PDFDocument.PDFName.of('Rect'));
                const x = rect.get(0).asNumber();
                const y = rect.get(1).asNumber();
                candidates.push({ name: matchedField.getName(), x, y });
            }
        }
    }

    candidates.sort((a, b) => {
        const yDiff = Math.abs(a.y - b.y);
        if (yDiff < 10) return a.x - b.x;
        return a.y - b.y;
    });

    console.log('Candidates on Last Page (Sorted Bottom-Up, Left-Right):');
    candidates.forEach((c, i) => {
        console.log(`${i}: ${c.name} at (${c.x.toFixed(2)}, ${c.y.toFixed(2)})`);
    });
}

runLikeApp().catch(console.error);
