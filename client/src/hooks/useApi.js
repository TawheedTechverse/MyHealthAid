import { useCallback, useEffect, useState } from 'react';
import { api, errorMessage } from '../api/client.js';

/**
 * Simple GET hook with loading/error state and a `reload` function.
 * @param {string} path
 */
export function useFetch(path) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  const reload = useCallback(() => {
    setLoading(true);
    setError('');
    return api
      .get(path)
      .then((res) => setData(res.data))
      .catch((err) => setError(errorMessage(err)))
      .finally(() => setLoading(false));
  }, [path]);

  useEffect(() => {
    reload();
  }, [reload]);

  return { data, setData, loading, error, reload };
}
