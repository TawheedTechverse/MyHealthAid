import PDFDocument from 'pdfkit';

const SECTIONS = [
  ['chiefComplaint', 'Chief complaint'],
  ['historyOfPresentIllness', 'History of present illness'],
  ['assessment', 'Assessment'],
  ['plan', 'Plan'],
  ['followUp', 'Follow-up'],
];

/**
 * Renders a serialized visit note (as returned by serializeVisitNote) into a
 * PDF buffer: patient, date, summary sections, medications, and - if signed -
 * a signature block.
 * @param {object} note
 * @returns {Promise<Buffer>}
 */
export function generateVisitPdf(note) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ margin: 50 });
    const chunks = [];
    doc.on('data', (chunk) => chunks.push(chunk));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    doc.fontSize(18).text('MyHealthAid Visit Record', { align: 'center' });
    doc.moveDown();

    doc.fontSize(11);
    doc.text(`Patient: ${note.patient.fullName}`);
    doc.text(`Doctor: ${note.doctor.fullName}`);
    doc.text(`Visit date: ${new Date(note.createdAt).toLocaleString()}`);
    doc.moveDown();

    const summary = note.summary ?? {};
    for (const [key, label] of SECTIONS) {
      if (!summary[key]) continue;
      doc.fontSize(12).text(label, { underline: true });
      doc.fontSize(11).text(summary[key]);
      doc.moveDown(0.5);
    }

    if (summary.medications?.length > 0) {
      doc.fontSize(12).text('Medications', { underline: true });
      for (const m of summary.medications) {
        doc.fontSize(11).text(`• ${m.name}${m.instruction ? ` — ${m.instruction}` : ''}`);
      }
      doc.moveDown(0.5);
    }

    if (note.signature) {
      doc.moveDown();
      doc.fontSize(12).text('Signature', { underline: true });
      doc.fontSize(11).text(note.signature.fullName);
      doc.text(`Registration number: ${note.signature.registrationNumber}`);
      doc.text(`Signed: ${new Date(note.signature.signedAt).toLocaleString()}`);
    } else {
      doc.moveDown();
      doc.fontSize(11).fillColor('red').text('DRAFT - NOT VERIFIED');
    }

    doc.end();
  });
}
