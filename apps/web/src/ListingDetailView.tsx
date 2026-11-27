import { useEffect, useState } from 'react';
import type { ListingDetail } from '@ai-job-search/shared';
import { ApiError, fetchListing } from './api.js';
import { EligibilityBadge } from './EligibilityBadge.js';
import { JobDescription } from './JobDescription.js';
import { SOURCE_LABEL } from './sources.js';

type State =
  | { status: 'loading' }
  | { status: 'not-found' }
  | { status: 'error'; message: string }
  | { status: 'ready'; listing: ListingDetail };

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium', timeStyle: 'short' });

function BackLink() {
  return (
    <a
      className="back"
      href="#"
      onClick={(e) => {
        e.preventDefault();
        location.hash = '';
      }}
    >
      ← Back to feed
    </a>
  );
}

/** One listing in full (R8): its header, description, and the only off-site link, to apply. */
export function ListingDetailView({ id }: { id: string }) {
  const [state, setState] = useState<State>({ status: 'loading' });

  useEffect(() => {
    const controller = new AbortController();
    setState({ status: 'loading' });
    fetchListing(id, controller.signal)
      .then((listing) => setState({ status: 'ready', listing }))
      .catch((err: unknown) => {
        if (controller.signal.aborted) return;
        if (err instanceof ApiError && err.notFound) setState({ status: 'not-found' });
        else setState({ status: 'error', message: err instanceof Error ? err.message : String(err) });
      });
    return () => controller.abort();
  }, [id]);

  return (
    <main className="page detail">
      <BackLink />
      {state.status === 'loading' && <p className="status">Loading listing…</p>}
      {state.status === 'not-found' && (
        <p className="status" role="alert">
          Listing not found. It may have been removed or is not open to you.
        </p>
      )}
      {state.status === 'error' && (
        <p className="status error" role="alert">
          Could not load the listing: {state.message}
        </p>
      )}
      {state.status === 'ready' && <ListingBody listing={state.listing} />}
    </main>
  );
}

export function ListingBody({ listing }: { listing: ListingDetail }) {
  const board = SOURCE_LABEL[listing.source];
  return (
    <article>
      <header className="detail-header">
        <h1 tabIndex={-1}>{listing.title}</h1>
        <div className="meta">
          <span>{listing.company}</span>
          {listing.locationText && <span>{listing.locationText}</span>}
          <EligibilityBadge eligibility={listing.eligibility} />
        </div>
        <div className="meta">
          {listing.postedAt && (
            <span>
              Posted <time dateTime={listing.postedAt}>{dateFormat.format(new Date(listing.postedAt))}</time>
            </span>
          )}
          <span>
            First seen <time dateTime={listing.firstSeenAt}>{dateFormat.format(new Date(listing.firstSeenAt))}</time>
          </span>
        </div>
      </header>
      <p className="source">via {board}</p>
      <JobDescription html={listing.descriptionHtml} />
      <p className="apply-row">
        <a className="apply" href={listing.url} target="_blank" rel="noopener noreferrer">
          Apply on {board}
        </a>
      </p>
    </article>
  );
}
