import { useCallback, useEffect, useState } from 'react';
import api, { errMsg } from '../api/client.js';

/** GET helper: const { data, loading, error, reload } = useApi('/leaves/my', { page }) */
export default function useApi(url, params, enabled = true) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(enabled);
  const [error, setError] = useState('');
  const key = JSON.stringify(params || {});
  const reload = useCallback(async () => {
    if (!enabled) return;
    setLoading(true); setError('');
    try { setData((await api.get(url, { params: JSON.parse(key) })).data); }
    catch (e) { setError(errMsg(e)); }
    finally { setLoading(false); }
  }, [url, key, enabled]);
  useEffect(() => { reload(); }, [reload]);
  return { data, loading, error, reload };
}
