const fs = require('fs');
const PDFLib = require('pdf-lib');
async function run() {
    const data = fs.readFileSync('/home/pulsta/vscode/repo/form-name-matcher/BLANK.pdf');
    const pdfDoc = await PDFLib.PDFDocument.load(data);
    const form = pdfDoc.getForm();
    
    ['LogisticsFirstName', 'LogisticsLastName', 'LogisticsContactTitle', 'LogisticsContactEmail', 'LogisticsContactMobilePhone'].forEach(fName => {
        const field = form.getField(fName);
        if (!field) {
            console.log(fName, 'not found');
            return;
        }
        const widgets = field.acroField.getWidgets();
        if (widgets.length) {
            const w = widgets[0];
            const p = w.dict.get(PDFLib.PDFName.of('P'));
            if (p) {
                 const pageRef = p.toString();
                 const pages = pdfDoc.getPages();
                 for (let i = 0; i < pages.length; i++) {
                     if (pages[i].ref.toString() === pageRef) {
                         console.log(fName, 'is on page index:', i);
                     }
                 }
            }
        }
    });
}
run().catch(console.error);
