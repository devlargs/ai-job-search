import { useEffect, useState, type FormEvent } from 'react';
import { Preference } from '@ai-job-search/shared';
import { fetchPreference, savePreference } from './api.js';

type Status =
  | { kind: 'loading' }
  | { kind: 'idle' }
  | { kind: 'saving' }
  | { kind: 'saved' }
  | { kind: 'error'; message: string };

const errorMessage = (err: unknown) => (err instanceof Error ? err.message : String(err));

/** The one preference (AD-9): role or skill keywords and the minimum match %. Saving reloads the feed via `onSaved`. */
export function PreferenceForm({ onSaved }: { onSaved: () => void }) {
  const [keywords, setKeywords] = useState('');
  const [minMatch, setMinMatch] = useState('40');
  const [status, setStatus] = useState<Status>({ kind: 'loading' });
  // Save stays off until the stored preference has loaded, so a failed load can't overwrite it with placeholders.
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    const controller = new AbortController();
    fetchPreference(controller.signal)
      .then((p) => {
        setKeywords(p.roleKeywords.join(', '));
        setMinMatch(String(p.minMatch));
        setLoaded(true);
        setStatus({ kind: 'idle' });
      })
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setStatus({ kind: 'error', message: `Could not load the preference: ${errorMessage(err)}` });
      });
    return () => controller.abort();
  }, []);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!loaded) return;
    const parsed = Preference.safeParse({
      roleKeywords: keywords.split(',').map((k) => k.trim()).filter((k) => k !== ''),
      minMatch: minMatch.trim() === '' ? Number.NaN : Number(minMatch),
    });
    if (!parsed.success) {
      const issue = parsed.error.issues[0];
      const field = issue?.path[0] === 'minMatch' ? 'Minimum match must be a whole number from 0 to 100' : 'Keywords must each be 1–40 characters, at most 20';
      setStatus({ kind: 'error', message: field });
      return;
    }
    setStatus({ kind: 'saving' });
    try {
      const saved = await savePreference(parsed.data);
      setKeywords(saved.roleKeywords.join(', '));
      setMinMatch(String(saved.minMatch));
      setStatus({ kind: 'saved' });
      onSaved();
    } catch (err) {
      setStatus({ kind: 'error', message: `Could not save: ${errorMessage(err)}` });
    }
  }

  const busy = !loaded || status.kind === 'saving';

  return (
    <form className="preference" onSubmit={onSubmit} aria-label="Feed preference">
      <label className="field field-keywords">
        <span>Role or skill keywords</span>
        <input
          type="text"
          value={keywords}
          placeholder="e.g. Frontend, React"
          onChange={(e) => setKeywords(e.target.value)}
          disabled={busy}
        />
      </label>
      <label className="field field-min">
        <span>Minimum match %</span>
        <input
          type="number"
          min={0}
          max={100}
          step={1}
          value={minMatch}
          onChange={(e) => setMinMatch(e.target.value)}
          disabled={busy}
        />
      </label>
      <button type="submit" disabled={busy}>
        {status.kind === 'saving' ? 'Saving…' : 'Save'}
      </button>
      <p className="preference-status" role="status">
        {status.kind === 'saved' && 'Saved'}
        {status.kind === 'error' && <span className="error">{status.message}</span>}
      </p>
    </form>
  );
}
