import { useCallback, useState } from 'react';

export const webNfcSupported = typeof window !== 'undefined' && 'NDEFReader' in window;

/** Thin wrapper over the Web NFC write API (Chrome on Android with NFC hardware, secure context only). */
export function useWebNFCWriter() {
  const [writing, setWriting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  const write = useCallback(async (text) => {
    setError('');
    setDone(false);
    if (!webNfcSupported) {
      setError('NFC writing needs Chrome on an Android device with NFC hardware.');
      return;
    }
    setWriting(true);
    try {
      const reader = new window.NDEFReader();
      await reader.write({ records: [{ recordType: 'text', data: text }] });
      setDone(true);
    } catch (err) {
      setError(
        err.message ||
          'Could not write to the NFC tag. Hold the tag against the back of your phone and try again.',
      );
    } finally {
      setWriting(false);
    }
  }, []);

  return { supported: webNfcSupported, writing, error, done, write };
}

/** Thin wrapper over the Web NFC read API. */
export function useWebNFCReader() {
  const [scanning, setScanning] = useState(false);
  const [error, setError] = useState('');

  const scan = useCallback((onRead) => {
    setError('');
    if (!webNfcSupported) {
      setError('NFC scanning needs Chrome on an Android device with NFC hardware.');
      return;
    }
    setScanning(true);
    const reader = new window.NDEFReader();
    reader
      .scan()
      .then(() => {
        reader.onreading = (event) => {
          const record = event.message.records[0];
          const text = new TextDecoder(record.encoding || 'utf-8').decode(record.data);
          setScanning(false);
          onRead(text);
        };
        reader.onreadingerror = () => {
          setError('Could not read the tag. Try again.');
          setScanning(false);
        };
      })
      .catch((err) => {
        setError(err.message || 'Could not start NFC scanning.');
        setScanning(false);
      });
  }, []);

  return { supported: webNfcSupported, scanning, error, scan };
}
