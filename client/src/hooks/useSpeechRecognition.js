import { useCallback, useEffect, useRef, useState } from 'react';

const SpeechRecognition =
  typeof window !== 'undefined'
    ? window.SpeechRecognition || window.webkitSpeechRecognition
    : undefined;

export const speechRecognitionSupported = Boolean(SpeechRecognition);

/**
 * Thin wrapper over the browser SpeechRecognition API for continuous dictation.
 *
 * @param {object} opts
 * @param {(chunk: string) => void} opts.onFinal - called with each finalized phrase (trailing space included)
 * @param {string} [opts.lang]
 * @returns {{ supported: boolean, listening: boolean, interim: string, error: string,
 *            start: () => void, stop: () => void }}
 */
export function useSpeechRecognition({ onFinal, lang = 'en-US' } = {}) {
  const [listening, setListening] = useState(false);
  const [interim, setInterim] = useState('');
  const [error, setError] = useState('');

  const recognitionRef = useRef(null);
  const wantListeningRef = useRef(false);
  const onFinalRef = useRef(onFinal);
  onFinalRef.current = onFinal;

  useEffect(() => {
    if (!SpeechRecognition) return undefined;

    const recognition = new SpeechRecognition();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = lang;

    recognition.onresult = (event) => {
      let interimText = '';
      for (let i = event.resultIndex; i < event.results.length; i += 1) {
        const result = event.results[i];
        const text = result[0].transcript;
        if (result.isFinal) {
          const clean = text.trim();
          if (clean) onFinalRef.current?.(`${clean} `);
        } else {
          interimText += text;
        }
      }
      setInterim(interimText);
    };

    recognition.onerror = (event) => {
      // "no-speech" and "aborted" are routine during pauses / restarts.
      if (event.error === 'no-speech' || event.error === 'aborted') return;
      if (event.error === 'not-allowed' || event.error === 'service-not-allowed') {
        setError('Microphone permission was denied.');
        wantListeningRef.current = false;
        setListening(false);
      } else if (event.error === 'audio-capture') {
        setError('No microphone was found.');
        wantListeningRef.current = false;
        setListening(false);
      } else {
        setError(`Speech recognition error: ${event.error}`);
      }
    };

    // Chrome ends the session after a stretch of silence; resume if the user
    // has not pressed stop.
    recognition.onend = () => {
      setInterim('');
      if (wantListeningRef.current) {
        try {
          recognition.start();
        } catch {
          /* start() throws if it is already starting - safe to ignore */
        }
      } else {
        setListening(false);
      }
    };

    recognitionRef.current = recognition;
    return () => {
      wantListeningRef.current = false;
      recognition.onresult = null;
      recognition.onerror = null;
      recognition.onend = null;
      try {
        recognition.abort();
      } catch {
        /* ignore */
      }
    };
  }, [lang]);

  const start = useCallback(() => {
    if (!recognitionRef.current || wantListeningRef.current) return;
    setError('');
    setInterim('');
    wantListeningRef.current = true;
    try {
      recognitionRef.current.start();
      setListening(true);
    } catch {
      /* already running */
    }
  }, []);

  const stop = useCallback(() => {
    wantListeningRef.current = false;
    setInterim('');
    try {
      recognitionRef.current?.stop();
    } catch {
      /* ignore */
    }
    setListening(false);
  }, []);

  return { supported: speechRecognitionSupported, listening, interim, error, start, stop };
}
