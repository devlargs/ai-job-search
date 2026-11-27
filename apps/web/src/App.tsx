import { useEffect, useState } from 'react';
import type { FeedItem, SourceId } from '@ai-job-search/shared';
import { fetchFeed } from './api.js';
import { EligibilityBadge } from './EligibilityBadge.js';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; items: FeedItem[] };

const SOURCE_LABEL: Record<SourceId, string> = {
  remotive: 'Remotive',
};

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function App() {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    fetchFeed(controller.signal)
      .then((feed) => setState({ status: 'ready', items: feed.items }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
  }, []);

  return (
    <main className="page">
      <h1>Job feed</h1>
      {state.status === 'loading' && <p className="status">Loading listings…</p>}
      {state.status === 'error' && (
        <p className="status error" role="alert">
          Could not load the feed: {state.message}
        </p>
      )}
      {state.status === 'ready' && state.items.length === 0 && (
        <p className="status">No listings yet — the first fetch may still be running</p>
      )}
      {state.status === 'ready' && state.items.length > 0 && (
        <ul className="feed">
          {state.items.map((item) => (
            <li key={item.id} className="listing">
              <a className="title" href={item.url} target="_blank" rel="noopener noreferrer">
                {item.title}
              </a>
              <div className="meta">
                <span>{item.company}</span>
                {item.locationText && <span>{item.locationText}</span>}
                <EligibilityBadge eligibility={item.eligibility} />
                <time dateTime={item.effectiveDate}>{dateFormat.format(new Date(item.effectiveDate))}</time>
                <span className="source">via {SOURCE_LABEL[item.source]}</span>
              </div>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}
