import path from 'node:path';
import { mkdir, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { query } from '../db/pool.js';
import { serializeVisitNote } from './visitNotes.js';
import { generateVisitPdf } from './pdf.js';
import { isSmtpConfigured, sendPdfEmail } from './email.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TMP_DIR = path.resolve(__dirname, '../../tmp');
const MAX_ATTEMPTS = 3;

async function loadNoteRow(noteId) {
  const { rows } = await query(
    `SELECT vn.*, d.full_name AS doctor_name, pt.full_name AS patient_name, pt.email AS patient_email
       FROM visit_notes vn
       JOIN users d ON d.id = vn.doctor_id
       JOIN users pt ON pt.id = vn.patient_id
      WHERE vn.id = $1`,
    [noteId],
  );
  return rows[0];
}

/**
 * Generates the signed visit's PDF and delivers it: emails it to the patient
 * if SMTP is configured (retrying a real send failure up to 3 times), or
 * otherwise saves it to server/tmp and logs the path - the same
 * graceful-degradation pattern as the Gemini/Twilio integrations, not a
 * failure. A failed email never undoes the doctor's signature; it only
 * updates visit_notes.pdf_email_* for the doctor to see and retry.
 */
export async function deliverVisitPdf(noteId) {
  await query(`UPDATE visit_notes SET pdf_email_status = 'pending' WHERE id = $1`, [noteId]);

  const row = await loadNoteRow(noteId);
  const pdfBuffer = await generateVisitPdf(serializeVisitNote(row));
  const filename = `visit-note-${noteId}.pdf`;

  if (!isSmtpConfigured()) {
    await mkdir(TMP_DIR, { recursive: true });
    const savedPath = path.join(TMP_DIR, filename);
    await writeFile(savedPath, pdfBuffer);
    console.log(`[email] SMTP not configured - saved visit PDF to ${savedPath}`);
    await query(
      `UPDATE visit_notes
          SET pdf_email_status = 'sent', pdf_email_error = NULL, pdf_saved_path = $2, pdf_email_attempts = 0
        WHERE id = $1`,
      [noteId, savedPath],
    );
    return;
  }

  let lastError;
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt += 1) {
    try {
      await sendPdfEmail({
        to: row.patient_email,
        subject: `Your visit record from ${row.doctor_name}`,
        text: `Attached is the signed record of your visit with ${row.doctor_name}.`,
        pdfBuffer,
        filename,
      });
      await query(
        `UPDATE visit_notes
            SET pdf_email_status = 'sent', pdf_email_error = NULL, pdf_email_attempts = $2
          WHERE id = $1`,
        [noteId, attempt],
      );
      return;
    } catch (err) {
      lastError = err;
      console.error(`Visit PDF email attempt ${attempt} for note ${noteId} failed:`, err);
    }
  }

  await query(
    `UPDATE visit_notes
        SET pdf_email_status = 'failed', pdf_email_error = $2, pdf_email_attempts = $3
      WHERE id = $1`,
    [noteId, lastError?.message?.slice(0, 500) ?? 'Unknown error', MAX_ATTEMPTS],
  );
}
