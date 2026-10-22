import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, errorMessage } from '../api/client.js';
import { useWebNFCReader } from '../hooks/useWebNFC.js';

const barcodeDetectorSupported = typeof window !== 'undefined' && 'BarcodeDetector' in window;

export default function ScanEmergencyCard() {
  const [raw, setRaw] = useState('');
  const [result, setResult] = useState(null);
  const [error, setError] = useState('');
  const [verifying, setVerifying] = useState(false);
  const [cameraOn, setCameraOn] = useState(false);
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const nfc = useWebNFCReader();

  useEffect(() => stopCamera, []);

  async function verifyRaw(text) {
    setError('');
    setResult(null);
    let card;
    try {
      card = JSON.parse(text);
    } catch {
      setError('That does not look like valid card data.');
      return;
    }
    setVerifying(true);
    try {
      const res = await api.post('/emergency-card/verify', { card });
      setResult(res.data);
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setVerifying(false);
    }
  }

  function stopCamera() {
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setCameraOn(false);
  }

  async function startCamera() {
    setError('');
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment' },
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      setCameraOn(true);

      const detector = new window.BarcodeDetector({ formats: ['qr_code'] });
      const tick = async () => {
        if (!streamRef.current || !videoRef.current) return;
        try {
          const codes = await detector.detect(videoRef.current);
          if (codes.length > 0) {
            stopCamera();
            verifyRaw(codes[0].rawValue);
            return;
          }
        } catch {
          /* a failed single frame isn't fatal - keep scanning */
        }
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    } catch (err) {
      setError(err.message || 'Could not access the camera.');
    }
  }

  return (
    <div>
      <p className="page-sub">
        <Link to="/">&larr; Back to dashboard</Link>
      </p>
      <h1 className="page-title">Scan emergency card</h1>
      <p className="page-sub">
        Scan a patient&apos;s NFC tag or QR code. Scanning itself works offline, but confirming
        the card is valid (not revoked) needs a network connection.
      </p>

      <div className="glass card stack" style={{ maxWidth: 480, marginBottom: 20 }}>
        <div className="row">
          {nfc.supported && (
            <button
              className="btn btn-ghost btn-sm"
              disabled={nfc.scanning}
              onClick={() => nfc.scan(verifyRaw)}
            >
              {nfc.scanning ? 'Hold tag to phone…' : 'Scan NFC tag'}
            </button>
          )}
          {barcodeDetectorSupported && !cameraOn && (
            <button className="btn btn-ghost btn-sm" onClick={startCamera}>
              Scan QR with camera
            </button>
          )}
          {cameraOn && (
            <button className="btn btn-ghost btn-sm" onClick={stopCamera}>
              Stop camera
            </button>
          )}
        </div>
        {nfc.error && <div className="error-text">{nfc.error}</div>}
        {cameraOn && (
          // eslint-disable-next-line jsx-a11y/media-has-caption
          <video ref={videoRef} muted playsInline style={{ width: '100%', borderRadius: 12 }} />
        )}

        <label className="field" style={{ margin: 0 }}>
          <span>Or paste scanned card data</span>
          <textarea
            rows={3}
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
            placeholder="Paste the card's text here"
          />
        </label>
        <button
          className="btn btn-primary btn-sm"
          disabled={verifying || !raw.trim()}
          onClick={() => verifyRaw(raw.trim())}
        >
          {verifying ? 'Verifying…' : 'Verify'}
        </button>

        {!nfc.supported && !barcodeDetectorSupported && (
          <p className="muted" style={{ fontSize: '0.8rem' }}>
            This browser supports neither Web NFC nor camera QR scanning - paste the card&apos;s
            text manually (e.g. from a separate QR scanner app).
          </p>
        )}
      </div>

      {error && <div className="error-text">{error}</div>}

      {result && (
        <div className={`glass card ${result.verified ? '' : 'emergency-banner'}`}>
          <strong style={{ fontSize: '1.1rem' }}>
            {result.verified ? 'Verified' : `Not verified${result.reason ? `: ${result.reason}` : ''}`}
          </strong>
        </div>
      )}
    </div>
  );
}
