import { useEffect, useState } from 'react';
import type { FeedItem, FeedResponse } from '@ai-job-search/shared';
import { fetchFeed } from './api.js';
import { EligibilityBadge } from './EligibilityBadge.js';
import { ListingDetailView } from './ListingDetailView.js';
import { PreferenceForm } from './PreferenceForm.js';
import { ResumeStatusBanner } from './ResumeStatusBanner.js';
import { SOURCE_LABEL } from './sources.js';

type State =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; feed: FeedResponse };

const TIERS: { key: keyof FeedResponse['tiers']; heading: string }[] = [
  { key: 'fresh', heading: 'Last 24 hours' },
  { key: 'recent', heading: '1–3 days ago' },
  { key: 'older', heading: 'Older' },
];

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

export function ListingRow({ item }: { item: FeedItem }) {
  return (
    <li className="listing">
      <a className="title" href={`#/listings/${item.id}`}>
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
  );
}

/** `#/listings/<id>`; a trailing slash or query after the id is ignored. */
const LISTING_HASH = /^#\/listings\/([^/?#]+)/;

/** The listing id in `#/listings/<id>`, or null for the feed. No router: the hash picks the view. */
export function listingIdFromHash(hash: string): string | null {
  const match = LISTING_HASH.exec(hash);
  if (!match) return null;
  try {
    return decodeURIComponent(match[1]!);
  } catch {
    return match[1]!;
  }
}

export function App() {
  const [listingId, setListingId] = useState(() => listingIdFromHash(location.hash));

  useEffect(() => {
    const onHashChange = () => {
      setListingId(listingIdFromHash(location.hash));
      window.scrollTo(0, 0);
      // Move focus to the new view's heading, as a page navigation would.
      requestAnimationFrame(() => document.querySelector<HTMLElement>('main h1')?.focus());
    };
    window.addEventListener('hashchange', onHashChange);
    return () => window.removeEventListener('hashchange', onHashChange);
  }, []);

  if (listingId !== null) return <ListingDetailView id={listingId} />;
  return <Feed />;
}

function Feed() {
  const [state, setState] = useState<State>({ status: 'loading' });
  const [reload, setReload] = useState(0);

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchFeed(controller.signal)
      .then((feed) => setState({ status: 'ready', feed }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
  }, [reload]);

  const isEmpty =
    state.status === 'ready' && TIERS.every(({ key }) => state.feed.tiers[key].length === 0);

  return (
    <main className="page">
      <h1 tabIndex={-1}>Job feed</h1>
      <PreferenceForm onSaved={() => setReload((n) => n + 1)} />
      {state.status === 'loading' && <p className="status">Loading listings…</p>}
      {state.status === 'error' && (
        <p className="status error" role="alert">
          Could not load the feed: {state.message}
        </p>
      )}
      {state.status === 'ready' && <ResumeStatusBanner status={state.feed.resumeStatus} />}
      {state.status === 'ready' && isEmpty && (
        <p className="status">No listings yet — the first fetch may still be running</p>
      )}
      {state.status === 'ready' &&
        !isEmpty &&
        TIERS.map(({ key, heading }) => {
          const items = state.feed.tiers[key];
          return (
            <section key={key} className="tier" aria-labelledby={`tier-${key}`}>
              <h2 id={`tier-${key}`} className="tier-heading">
                {heading}
              </h2>
              {items.length === 0 ? (
                <p className="tier-empty">Nothing in this window</p>
              ) : (
                <ul className="feed">
                  {items.map((item) => (
                    <ListingRow key={item.id} item={item} />
                  ))}
                </ul>
              )}
            </section>
          );
        })}
    </main>
  );
}
