import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import QRCode from 'qrcode';
import { api, errorMessage } from '../api/client.js';
import Spinner from '../components/Spinner.jsx';
import { formatDateTime } from '../lib/format.js';
import { useWebNFCWriter } from '../hooks/useWebNFC.js';

export default function EmergencyCard() {
  const [card, setCard] = useState(null);
  const [qrSrc, setQrSrc] = useState('');
  const [error, setError] = useState('');
  const [blocking, setBlocking] = useState(false);
  const nfc = useWebNFCWriter();

  useEffect(() => {
    api
      .get('/emergency-card')
      .then((res) => setCard(res.data.card))
      .catch((err) => setError(errorMessage(err)));
  }, []);

  useEffect(() => {
    if (!card) return;
    QRCode.toDataURL(JSON.stringify(card), { margin: 1, width: 240 })
      .then(setQrSrc)
      .catch(() => setQrSrc(''));
  }, [card]);

  async function handleBlock() {
    if (
      !window.confirm(
        'Block your current card? Any previously issued card (printed, saved, or written to an NFC tag) will stop verifying.',
      )
    ) {
      return;
    }
    setBlocking(true);
    setError('');
    try {
      const res = await api.post('/emergency-card/block');
      setCard(res.data.card);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBlocking(false);
    }
  }

  if (!card && !error) return <Spinner full />;

  return (
    <div>
      <p className="page-sub">
        <Link to="/">&larr; Back to dashboard</Link>
      </p>
      <h1 className="page-title">Emergency card</h1>
      <p className="page-sub">
        A doctor can scan this to see your allergies, current medications, and latest visit —
        even if you can&apos;t speak for yourself.
      </p>

      {error && <div className="error-text">{error}</div>}

      {card && (
        <div className="glass card stack" style={{ maxWidth: 420 }}>
          <strong>{card.data.patientName}</strong>

          <div>
            <div className="note-label">Allergies</div>
            <div>{card.data.allergies}</div>
          </div>

          <div>
            <div className="note-label">Current medications</div>
            {card.data.medications.length === 0 ? (
              <div className="muted">None recorded</div>
            ) : (
              <ul style={{ margin: '4px 0 0', paddingLeft: 18 }}>
                {card.data.medications.map((m, i) => (
                  <li key={i}>
                    <strong>{m.name}</strong>
                    {m.instruction ? ` — ${m.instruction}` : ''}
                  </li>
                ))}
              </ul>
            )}
          </div>

          <div className="muted" style={{ fontSize: '0.85rem' }}>
            Latest visit:{' '}
            {card.data.latestVisitDate ? formatDateTime(card.data.latestVisitDate) : 'None recorded'}
            {card.data.doctorName ? ` · ${card.data.doctorName}` : ''}
          </div>

          {qrSrc && (
            <div style={{ textAlign: 'center' }}>
              <img src={qrSrc} alt="Emergency card QR code" width={240} height={240} />
              <p className="muted" style={{ fontSize: '0.8rem' }}>
                A doctor can scan this to verify your card.
              </p>
            </div>
          )}

          <div className="row">
            {nfc.supported && (
              <button
                className="btn btn-ghost btn-sm"
                disabled={nfc.writing}
                onClick={() => nfc.write(JSON.stringify(card))}
              >
                {nfc.writing ? 'Hold tag to phone…' : 'Write to NFC tag'}
              </button>
            )}
            <button className="btn btn-ghost btn-sm" disabled={blocking} onClick={handleBlock}>
              {blocking ? 'Blocking…' : 'Block lost card'}
            </button>
          </div>
          {nfc.error && <div className="error-text">{nfc.error}</div>}
          {nfc.done && <p className="muted" style={{ fontSize: '0.85rem' }}>Written to tag.</p>}
          {!nfc.supported && (
            <p className="muted" style={{ fontSize: '0.8rem' }}>
              Writing to an NFC tag needs Chrome on an Android phone with NFC hardware. The QR
              code above always works as a fallback.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
